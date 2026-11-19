import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
import {createDatabasePool} from '../src/database.ts';
import {acceptProposal} from '../src/proposal-acceptance.ts';
import {changeProposal} from '../src/proposal-management.ts';
import {expireOverdueProposals,proposalVersions} from '../src/proposal-versions.ts';
import {listProposalsQuery} from '../src/proposals.ts';
import {cancelRequest} from '../src/request-cancellation.ts';
import {closeAccountWork,lockAccountRequests} from '../src/account-management.ts';
import {historyQuery} from '../src/history.ts';
import {localToday} from '../src/request-validation.ts';
import {WorkflowError} from '../src/workflow-error.ts';

const failure=(status:number,code?:string,current?:string)=>(e:unknown)=>e instanceof WorkflowError&&e.status===status&&(code===undefined||e.details?.code===code)&&(current===undefined||e.details?.status===current);
const day=(offset:number)=>localToday(new Date(Date.now()+offset*86_400_000));
// Roda nas tabelas reais com o usuário maridao_api (confere também os GRANTs, o CHECK de status e o gatilho da migração 015).
// Tudo acontece dentro de uma única transação que é desfeita ao final: nenhum dado fictício permanece.
test('PostgreSQL: reenvio com histórico de versões, expiração gravada, recusas, leituras e avisos',{skip:process.env.MARIDAO_DB_TEST!=='1'},async()=>{
 const pool=createDatabasePool(),raw=await pool.connect();
 const db={query:async(sql:string,values?:unknown[])=>{
  if(sql==='BEGIN')return raw.query('SAVEPOINT operation');if(sql==='COMMIT')return raw.query('RELEASE SAVEPOINT operation');
  if(sql==='ROLLBACK'){await raw.query('ROLLBACK TO SAVEPOINT operation');return raw.query('RELEASE SAVEPOINT operation');}return raw.query(sql,values);
 }} as unknown as Pick<PoolClient,'query'>;
 const one=async(sql:string,values?:unknown[])=>(await raw.query(sql,values)).rows[0];
 const titles=async(account:string,request:string)=>(await raw.query('SELECT title FROM maridao.notifications WHERE account_id=$1 AND request_id=$2 ORDER BY id',[account,request])).rows.map(r=>r.title as string);
 try{
  await raw.query('BEGIN');
  const ids=Array.from({length:5},()=>randomUUID()),[customerId,otherCustomerId,aId,bId,cId]=ids;
  for(const id of ids)await raw.query('INSERT INTO maridao.accounts(id,email,password_hash) VALUES($1,$2,$3)',[id,`${id}@example.invalid`,'ficticio-sem-login-'.repeat(3)]);
  for(const [index,id] of [customerId,otherCustomerId].entries())await raw.query("INSERT INTO maridao.customer_profiles(account_id,full_name,phone,cpf,neighborhood) VALUES($1,$2,'63999120345',$3,'Plano Diretor Sul')",[id,`Cliente fictício ${index}`,String(BigInt('0x'+id.replaceAll('-','').slice(0,12))%100000000000n).padStart(11,'0')]);
  for(const [index,id] of [aId,bId,cId].entries())await raw.query("INSERT INTO maridao.provider_profiles(account_id,full_name,phone,document_type,document_encrypted,document_fingerprint,categories,specialties,neighborhoods,availability,approval_status) VALUES($1,$2,'63999999999','CPF','v1.fixture',$3,ARRAY['Pintura'],ARRAY['Pintura interna'],ARRAY['Plano Diretor Sul'],'A combinar','Aprovado')",[id,`Prestador fictício ${index}`,id.replaceAll('-','').padEnd(64,'0')]);
  const customer={id:customerId,role:'customer'} as Profile,otherCustomer={id:otherCustomerId,role:'customer'} as Profile,a={id:aId,role:'provider'} as Profile,b={id:bId,role:'provider'} as Profile,c={id:cId,role:'provider'} as Profile;
  // Cada pedido nasce com uma proposta pendente de cada prestador informado.
  const order=async(providers:string[])=>{
   const request=randomUUID(),proposals=providers.map(()=>randomUUID());
   await raw.query("INSERT INTO maridao.service_requests(id,customer_id,category,description,neighborhood) VALUES($1,$2,'Pintura','Pedido fictício de versões','Plano Diretor Sul')",[request,customerId]);
   for(const [i,provider] of providers.entries())await raw.query("INSERT INTO maridao.proposals(id,request_id,provider_id,amount,description,estimated_duration,valid_until) VALUES($1,$2,$3,100,'Proposta fictícia','Um dia','2099-12-31')",[proposals[i],request,provider]);
   return {request,proposals};
  };
  const form=(version:number,amount:string,validUntil='2099-12-31')=>({version,amount,description:`Proposta versão ${version+1}`,estimatedDuration:'Dois dias',validUntil});
  const stored=async(id:string)=>one("SELECT status,version,amount,description,to_char(valid_until,'YYYY-MM-DD') AS valid_until,withdrawn_at FROM maridao.proposals WHERE id=$1",[id]);
  const saved=async(id:string)=>(await raw.query('SELECT version,amount,description,status,status_before,sent_at,replaced_at FROM maridao.proposal_versions WHERE proposal_id=$1 ORDER BY version',[id])).rows;
  const events=async(request:string,action:string)=>(await raw.query('SELECT actor_account_id,actor_kind,previous_status,next_status,reason FROM maridao.request_events WHERE request_id=$1 AND action=$2 ORDER BY created_at,id',[request,action])).rows;
  const listed=async(user:Profile,request:string)=>{const q=listProposalsQuery(user,request);return (await raw.query(q.text,q.values)).rows;};
  const history=async(user:Profile,request:string)=>{const q=historyQuery(user,{});return (await raw.query(q.text,q.values)).rows.find(row=>row.id===request);};
  const permissions=(row:Record<string,unknown>)=>['can_resend','can_withdraw','can_accept'].filter(field=>row[field]===true);
  // Vence a validade direto no banco (a API não aceita validade no passado).
  const overdue=(id:string,date=day(-1))=>raw.query('UPDATE maridao.proposals SET valid_until=$2 WHERE id=$1',[id,date]);

  // --- Reenviar "Pendente": a versão anterior fica "Substituída", a vigente segue "Pendente" com os novos dados e o cliente é avisado.
  const main=await order([aId,bId]),[pA,pB]=main.proposals as [string,string];
  const created=(await one('SELECT created_at FROM maridao.proposals WHERE id=$1',[pA])).created_at;
  const noticesCustomer=(await titles(customerId,main.request)).length,noticesA=(await titles(aId,main.request)).length;
  const second=await changeProposal(db,a,main.request,pA,form(1,'250,50'));
  assert.equal(second.status,'Pendente');assert.equal(second.version,2);assert.equal(second.previous.version,1);assert.equal(second.previous.status,'Substituída');
  assert.deepEqual({...await stored(pA)},{status:'Pendente',version:2,amount:'250.50',description:'Proposta versão 2',valid_until:'2099-12-31',withdrawn_at:null});
  const firstSaved=await saved(pA);
  assert.deepEqual(firstSaved.map(({sent_at,replaced_at,...row})=>row),[{version:1,amount:'100.00',description:'Proposta fictícia',status:'Substituída',status_before:'Pendente'}]);
  assert.deepEqual(firstSaved[0].sent_at,created);assert.ok(firstSaved[0].replaced_at>=created);assert.deepEqual(second.previous.replaced_at,firstSaved[0].replaced_at);
  assert.deepEqual(await events(main.request,'proposal_resent'),[{actor_account_id:aId,actor_kind:'provider',previous_status:'Aberta',next_status:'Aberta',reason:'Prestador reenviou a proposta: a versão 1 passou a "Substituída" e a versão 2 entrou como "Pendente".'}]);
  // RF13.1: um aviso, só para o cliente (quem reenviou não é avisado).
  assert.deepEqual((await titles(customerId,main.request)).slice(noticesCustomer),['Proposta reenviada: confira os novos dados']);assert.equal((await titles(aId,main.request)).length,noticesA);
  // Concorrência por versão: quem ainda está com a versão antiga perde, com mensagem clara, e nada é gravado.
  await assert.rejects(()=>acceptProposal(db,customer,main.request,pA,{version:1}),failure(409,'PROPOSAL_VERSION_CHANGED'));
  await assert.rejects(()=>changeProposal(db,a,main.request,pA,form(1,'999,00')),failure(409,'PROPOSAL_VERSION_CHANGED'));
  await assert.rejects(()=>changeProposal(db,b,main.request,pA,form(2,'1,00')),failure(404));
  await assert.rejects(()=>changeProposal(db,a,main.request,pA,form(2,'300,00',day(-1))),(e:unknown)=>e instanceof Error&&'fields' in e);
  assert.equal((await saved(pA)).length,1);assert.equal((await stored(pA)).version,2);

  // --- Reenviar duas vezes: três versões, na ordem certa, para o autor e para o cliente; outros não leem.
  await changeProposal(db,a,main.request,pA,form(2,'300,00'));
  for(const reader of [a,customer]){
   const seen=await proposalVersions(db,reader,main.request,pA);
   assert.deepEqual(seen.versions.map(v=>[v.version,v.current,v.status,v.amount,v.description]),[[3,true,'Pendente','300.00','Proposta versão 3'],[2,false,'Substituída','250.50','Proposta versão 2'],[1,false,'Substituída','100.00','Proposta fictícia']]);
   assert.equal(seen.proposal.version,3);assert.equal(seen.proposal.versions_count,3);assert.equal(seen.proposal.has_previous_versions,true);assert.equal(seen.proposal.missing_previous_versions,false);assert.equal(seen.proposal.provider_id,aId);assert.equal(seen.role,reader.role);
   // Cada versão foi enviada quando a anterior foi substituída.
   assert.deepEqual(seen.versions[2]!.sent_at,created);assert.deepEqual(seen.versions[1]!.sent_at,seen.versions[2]!.replaced_at);assert.deepEqual(seen.versions[0]!.sent_at,seen.versions[1]!.replaced_at);assert.equal(seen.versions[0]!.replaced_at,null);
  }
  for(const outsider of [b,c,otherCustomer])await assert.rejects(()=>proposalVersions(db,outsider,main.request,pA),failure(404));
  await assert.rejects(()=>proposalVersions(db,a,randomUUID(),pA),failure(404));
  // O histórico só recebe inclusões: a API não altera nem apaga versões guardadas.
  for(const sql of ["UPDATE maridao.proposal_versions SET amount=1 WHERE proposal_id=$1",'DELETE FROM maridao.proposal_versions WHERE proposal_id=$1']){
   await db.query('BEGIN');await assert.rejects(()=>raw.query(sql,[pA]),/permission denied/);await db.query('ROLLBACK');
  }

  // --- UC06.1: o cliente vê só a versão vigente de cada prestador; permissões por papel.
  const received=await listed(customer,main.request);
  assert.deepEqual(received.map(row=>row.provider_id).sort(),[aId,bId].sort());
  const rowA=received.find(row=>row.id===pA);assert.equal(rowA.version,3);assert.equal(rowA.amount,'300.00');assert.equal(rowA.versions_count,3);assert.equal(rowA.has_previous_versions,true);assert.equal(rowA.expired,false);assert.deepEqual(permissions(rowA),['can_accept']);
  const rowB=received.find(row=>row.id===pB);assert.equal(rowB.versions_count,1);assert.equal(rowB.has_previous_versions,false);assert.deepEqual(rowB.sent_at,rowB.created_at);
  const own=await listed(a,main.request);assert.equal(own.length,1);assert.deepEqual(permissions(own[0]),['can_resend','can_withdraw']);assert.deepEqual(own[0].sent_at,(await saved(pA))[1].replaced_at);
  assert.equal((await history(a,main.request)).proposal_version,3);assert.equal((await history(a,main.request)).proposal_versions_count,3);assert.equal((await history(a,main.request)).proposal_has_previous_versions,true);

  // --- Expirar: só depois que o dia da validade termina em Palmas; status gravado, evento do sistema e aviso ao prestador.
  await overdue(pB,day(0));
  assert.ok(!(await expireOverdueProposals(db)).includes(pB));assert.equal((await stored(pB)).status,'Pendente');
  await overdue(pB);
  // "Agora" injetado no passado: nada vence. Vencida mas ainda não gravada: já não é aceita nem retirada, e aparece marcada.
  assert.ok(!(await expireOverdueProposals(db,new Date('2000-01-01T12:00:00Z'))).includes(pB));
  const pending=(await listed(customer,main.request)).find(row=>row.id===pB);assert.equal(pending.status,'Pendente');assert.equal(pending.expired,true);assert.deepEqual(permissions(pending),[]);
  await assert.rejects(()=>acceptProposal(db,customer,main.request,pB,{version:1}),failure(409,'PROPOSAL_EXPIRED','Expirada'));
  await assert.rejects(()=>changeProposal(db,b,main.request,pB,{version:1},true),failure(409,'PROPOSAL_NOT_WITHDRAWABLE','Expirada'));
  const beforeB=(await titles(bId,main.request)).length,beforeCustomer=(await titles(customerId,main.request)).length;
  assert.ok((await expireOverdueProposals(db)).includes(pB));
  assert.equal((await stored(pB)).status,'Expirada');assert.equal((await stored(pA)).status,'Pendente');
  assert.deepEqual(await events(main.request,'proposal_expired'),[{actor_account_id:null,actor_kind:'system',previous_status:'Aberta',next_status:'Aberta',reason:'Validade encerrada: proposta expirada automaticamente pelo sistema.'}]);
  assert.deepEqual((await titles(bId,main.request)).slice(beforeB),['Proposta expirada: a validade terminou']);assert.equal((await titles(customerId,main.request)).length,beforeCustomer);
  // Repetir a passada não expira nem avisa de novo.
  assert.ok(!(await expireOverdueProposals(db)).includes(pB));assert.equal((await events(main.request,'proposal_expired')).length,1);assert.equal((await titles(bId,main.request)).length,beforeB+1);
  // "Expirada" gravada: o cliente vê marcada e não aceita; o prestador não retira, mas pode reenviar.
  const expired=(await listed(customer,main.request)).find(row=>row.id===pB);assert.equal(expired.status,'Expirada');assert.equal(expired.expired,true);assert.deepEqual(permissions(expired),[]);
  assert.deepEqual(permissions((await listed(b,main.request))[0]),['can_resend']);
  for(const version of [1,2])await assert.rejects(()=>acceptProposal(db,customer,main.request,pB,{version}),failure(409,'PROPOSAL_EXPIRED','Expirada'));
  await assert.rejects(()=>changeProposal(db,b,main.request,pB,{version:1},true),failure(409,'PROPOSAL_NOT_WITHDRAWABLE','Expirada'));
  assert.equal((await stored(pB)).status,'Expirada');

  // --- Reenviar "Expirada": volta a "Pendente" com nova validade; a versão expirada fica no histórico.
  await assert.rejects(()=>changeProposal(db,b,main.request,pB,form(1,'180,00',day(-1))),(e:unknown)=>e instanceof Error&&'fields' in e);
  const renewed=await changeProposal(db,b,main.request,pB,form(1,'180,00',day(5)));
  assert.equal(renewed.status,'Pendente');assert.equal(renewed.version,2);
  assert.deepEqual({...await stored(pB)},{status:'Pendente',version:2,amount:'180.00',description:'Proposta versão 2',valid_until:day(5),withdrawn_at:null});
  assert.deepEqual((await saved(pB)).map(({sent_at,replaced_at,...row})=>row),[{version:1,amount:'100.00',description:'Proposta fictícia',status:'Substituída',status_before:'Expirada'}]);
  assert.deepEqual((await titles(customerId,main.request)).slice(beforeCustomer),['Proposta reenviada: confira os novos dados']);assert.equal((await titles(bId,main.request)).length,beforeB+1);
  assert.deepEqual(permissions((await listed(customer,main.request)).find(row=>row.id===pB)),['can_accept']);assert.deepEqual(permissions((await listed(b,main.request))[0]),['can_resend','can_withdraw']);

  // --- Retirada: só "Pendente"; some da lista e das versões para o cliente, não cria versão e não pode mais ser reenviada.
  const gone=await order([aId]),pGone=gone.proposals[0]!;
  await changeProposal(db,a,gone.request,pGone,form(1,'120,00'));
  const withdrawn=await changeProposal(db,a,gone.request,pGone,{version:2},true);assert.equal(withdrawn.status,'Retirada');assert.equal(withdrawn.version,2);
  assert.deepEqual(await listed(customer,gone.request),[]);await assert.rejects(()=>proposalVersions(db,customer,gone.request,pGone),failure(404));
  const kept=await proposalVersions(db,a,gone.request,pGone);assert.deepEqual(kept.versions.map(v=>[v.version,v.status]),[[2,'Retirada'],[1,'Substituída']]);
  assert.deepEqual(permissions((await listed(a,gone.request))[0]),[]);
  await assert.rejects(()=>changeProposal(db,a,gone.request,pGone,form(2,'130,00')),failure(409,'PROPOSAL_NOT_RESENDABLE','Retirada'));
  await assert.rejects(()=>acceptProposal(db,customer,gone.request,pGone,{version:2}),failure(409,'PROPOSAL_NOT_AVAILABLE','Retirada'));
  assert.equal((await saved(pGone)).length,1);

  // --- Aceite com outra proposta expirada no mesmo pedido (RN03): só a pendente válida vira "Não selecionada".
  const chosen=await order([aId,bId,cId]),[qA,qB,qC]=chosen.proposals as [string,string,string];
  await changeProposal(db,a,chosen.request,qA,form(1,'400,00'));
  await overdue(qB);assert.ok((await expireOverdueProposals(db)).includes(qB));
  const quietB=(await titles(bId,chosen.request)).length;
  await acceptProposal(db,customer,chosen.request,qA,{version:2});
  assert.equal((await stored(qA)).status,'Aceita');assert.equal((await stored(qB)).status,'Expirada');assert.equal((await stored(qC)).status,'Não selecionada');
  assert.equal((await titles(bId,chosen.request)).length,quietB);assert.deepEqual(await titles(cId,chosen.request),['Proposta não selecionada: o cliente escolheu outra proposta']);
  // Recusas do reenvio e da retirada, com o status atual: "Aceita", "Não selecionada" e pedido que não está "Aberta".
  await assert.rejects(()=>changeProposal(db,a,chosen.request,qA,form(2,'410,00')),failure(409,'PROPOSAL_NOT_RESENDABLE','Aceita'));
  await assert.rejects(()=>changeProposal(db,c,chosen.request,qC,form(1,'90,00')),failure(409,'PROPOSAL_NOT_RESENDABLE','Não selecionada'));
  await assert.rejects(()=>changeProposal(db,b,chosen.request,qB,form(1,'90,00')),(e:unknown)=>failure(409,'REQUEST_NOT_OPEN','Aceita')(e)&&(e as WorkflowError).details?.proposalStatus==='Expirada');
  for(const [user,id,status] of [[a,qA,'Aceita'],[c,qC,'Não selecionada'],[b,qB,'Expirada']] as const)await assert.rejects(()=>changeProposal(db,user,chosen.request,id,{version:user===a?2:1},true),failure(409,'PROPOSAL_NOT_WITHDRAWABLE',status));
  for(const user of [a,b,c])assert.deepEqual(permissions((await listed(user,chosen.request))[0]),[]);
  assert.equal((await saved(qA)).length,1);assert.equal((await saved(qB)).length,0);
  // UC09.3: no histórico do cliente e do prestador a proposta aceita traz a contagem de versões; as anteriores continuam consultáveis.
  for(const user of [customer,a]){const row=await history(user,chosen.request);assert.equal(row.proposal_id,qA);assert.equal(row.proposal_version,2);assert.equal(row.proposal_versions_count,2);assert.equal(row.proposal_has_previous_versions,true);}
  assert.equal((await history(b,chosen.request)).proposal_status,'Expirada');assert.equal((await history(b,chosen.request)).proposal_has_previous_versions,false);
  assert.deepEqual((await proposalVersions(db,customer,chosen.request,qA)).versions.map(v=>[v.version,v.status]),[[2,'Aceita'],[1,'Substituída']]);

  // --- Pendente com validade vencida ainda não gravada: o aceite de outra e o cancelamento não a tocam; a passada grava "Expirada".
  const late=await order([aId,bId]),[lA,lB]=late.proposals as [string,string];
  await overdue(lB);await acceptProposal(db,customer,late.request,lA,{version:1});
  assert.equal((await stored(lB)).status,'Pendente');assert.ok((await expireOverdueProposals(db)).includes(lB));assert.equal((await stored(lB)).status,'Expirada');
  assert.deepEqual((await events(late.request,'proposal_expired')).map(e=>[e.previous_status,e.next_status]),[['Aceita','Aceita']]);
  // 7.5: no cancelamento, "Pendente" vira "Não selecionada"; a "Expirada" mantém o status.
  const dropped=await order([aId,bId,cId]),[dA,dB,dC]=dropped.proposals as [string,string,string];
  await overdue(dB);await expireOverdueProposals(db);await overdue(dC);
  await cancelRequest(db,customer,dropped.request,{});
  assert.equal((await stored(dA)).status,'Não selecionada');assert.equal((await stored(dB)).status,'Expirada');assert.equal((await stored(dC)).status,'Pendente');
  await expireOverdueProposals(db);assert.equal((await stored(dC)).status,'Expirada');
  await assert.rejects(()=>changeProposal(db,b,dropped.request,dB,form(1,'90,00')),failure(409,'REQUEST_NOT_OPEN','Cancelada'));
  await assert.rejects(()=>changeProposal(db,a,dropped.request,dA,form(1,'90,00')),failure(409,'PROPOSAL_NOT_RESENDABLE','Não selecionada'));
  await assert.rejects(()=>acceptProposal(db,customer,dropped.request,dA,{version:1}),failure(409,'REQUEST_NOT_OPEN','Cancelada'));

  // --- Encerramento de conta do prestador: as pendentes são retiradas (sem criar versão) e a "Expirada" fica como está.
  await overdue(pA);await expireOverdueProposals(db);
  const spare=await order([aId]);
  await cancelRequest(db,customer,late.request,{reason:'Desisti do serviço'});await cancelRequest(db,customer,chosen.request,{reason:'Desisti do serviço'});
  await closeAccountWork(db,a,a,await lockAccountRequests(db,aId));
  assert.equal((await stored(pA)).status,'Expirada');assert.equal((await stored(pA)).version,3);
  assert.deepEqual({status:(await stored(spare.proposals[0]!)).status,version:(await stored(spare.proposals[0]!)).version},{status:'Retirada',version:1});
 }finally{try{await raw.query('ROLLBACK');}finally{raw.release();await pool.end();}}
});
