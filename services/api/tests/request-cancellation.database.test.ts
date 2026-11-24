import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
import {createDatabasePool} from '../src/database.ts';
import {acceptProposal} from '../src/proposal-acceptance.ts';
import {updateProgress} from '../src/request-progress.ts';
import {openSupport} from '../src/customer-confirmation.ts';
import {completionAction} from '../src/request-completion.ts';
import {chatAccess,sendMessage} from '../src/team-workflows.ts';
import {cancelRequest} from '../src/request-cancellation.ts';
import {listRequestsQuery} from '../src/request-listing.ts';
import {proposalAccessQuery} from '../src/proposals.ts';
import {historyQuery} from '../src/history.ts';
import {userDetail} from '../src/admin.ts';
import {WorkflowError} from '../src/workflow-error.ts';

const failure=(status:number,code?:string)=>(e:unknown)=>e instanceof WorkflowError&&e.status===status&&(code===undefined||e.details?.code===code);
// Roda nas tabelas reais com o usuário maridao_api (confere também os GRANTs e o gatilho da migração 013).
// Tudo acontece dentro de uma única transação que é desfeita ao final: nenhum dado fictício permanece.
test('PostgreSQL: cancelamento por cliente e prestador, propostas, evento, avisos, chat e consulta',{skip:process.env.MARIDAO_DB_TEST!=='1'},async()=>{
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
  // Cada pedido nasce com proposta pendente dos prestadores A e B.
  const order=async()=>{
   const request=randomUUID(),proposals=[randomUUID(),randomUUID()];
   await raw.query("INSERT INTO maridao.service_requests(id,customer_id,category,description,neighborhood) VALUES($1,$2,'Pintura','Pedido fictício de cancelamento','Plano Diretor Sul')",[request,customerId]);
   for(const [i,provider] of [aId,bId].entries())await raw.query("INSERT INTO maridao.proposals(id,request_id,provider_id,amount,description,estimated_duration,valid_until) VALUES($1,$2,$3,100,'Proposta fictícia','Um dia','2099-12-31')",[proposals[i],request,provider]);
   return {request,proposalA:proposals[0]!,proposalB:proposals[1]!};
  };
  const state=async(request:string)=>one('SELECT status,selected_proposal_id,started_at,completed_at FROM maridao.service_requests WHERE id=$1',[request]);
  const proposalStatus=async(id:string)=>(await one('SELECT status FROM maridao.proposals WHERE id=$1',[id])).status;
  const listed=async(user:Profile,request:string)=>{const q=listRequestsQuery(user,{});return (await raw.query(q.text,q.values)).rows.find(r=>r.id===request);};

  // --- Aberta: só o cliente dono cancela; o motivo é opcional.
  const open=await order();
  // UC05.1: prestador compatível só consulta a solicitação aberta com o cadastro aprovado; quem já tem proposta nela continua vendo.
  const detailed=async(user:Profile,request:string)=>{const q=proposalAccessQuery(user,request);return (await raw.query(q.text,q.values)).rows[0];};
  const setApproval=(id:string,status:string)=>raw.query('UPDATE maridao.provider_profiles SET approval_status=$2 WHERE account_id=$1',[id,status]);
  assert.ok(await listed(c,open.request));assert.ok(await detailed(c,open.request));
  // "Rejeitado" passa pela mesma condição (approval_status='Aprovado'); a tabela exige motivo e administrador para gravá-lo, então aqui basta "Em análise".
  await setApproval(cId,'Em análise');assert.equal(await listed(c,open.request),undefined);assert.equal(await detailed(c,open.request),undefined);
  await setApproval(aId,'Em análise');assert.ok(await listed(a,open.request));assert.ok(await detailed(a,open.request));
  await setApproval(cId,'Aprovado');await setApproval(aId,'Aprovado');assert.ok(await listed(c,open.request));
  assert.equal((await listed(customer,open.request)).can_cancel,true);assert.equal((await listed(a,open.request)).can_cancel,false);assert.equal((await listed(customer,open.request)).cancellation,null);
  await assert.rejects(()=>cancelRequest(db,a,open.request,{reason:'Imprevisto'}),failure(403,'CANCEL_NOT_ALLOWED'));
  await assert.rejects(()=>cancelRequest(db,c,open.request,{reason:'Imprevisto'}),failure(404));
  await assert.rejects(()=>cancelRequest(db,otherCustomer,open.request,{reason:'Invasão'}),failure(404));
  const first=await cancelRequest(db,customer,open.request,{});
  assert.equal(first.request.status,'Cancelada');assert.equal(first.request.previousStatus,'Aberta');assert.equal(first.request.cancellation.reason,null);assert.match(first.request.cancellation.at,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.equal((await state(open.request)).status,'Cancelada');
  assert.equal(await proposalStatus(open.proposalA),'Não selecionada');assert.equal(await proposalStatus(open.proposalB),'Não selecionada');
  assert.deepEqual((await raw.query('SELECT actor_account_id,actor_kind,action,previous_status,next_status,reason,created_at IS NOT NULL AS dated FROM maridao.request_events WHERE request_id=$1',[open.request])).rows,[{actor_account_id:customerId,actor_kind:'customer',action:'request_cancelled',previous_status:'Aberta',next_status:'Cancelada',reason:'',dated:true}]);
  // RF13 (016): cada prestador com proposta pendente é avisado uma vez; o cliente, que cancelou, não recebe aviso da própria ação.
  for(const provider of [aId,bId])assert.deepEqual(await titles(provider,open.request),['Solicitação cancelada: sua proposta foi encerrada']);
  assert.deepEqual((await titles(customerId,open.request)).filter(t=>t!=='Nova proposta recebida'),[]);
  const openRow=await listed(customer,open.request);assert.equal(openRow.can_cancel,false);assert.deepEqual(openRow.cancellation,{by:'customer',at:first.request.cancellation.at,action:'request_cancelled',reason:null});
  await assert.rejects(()=>cancelRequest(db,customer,open.request,{}),failure(409,'REQUEST_NOT_CANCELLABLE'));

  // --- Aberta com motivo: o prestador com proposta vê quem cancelou e quando, mas não o motivo.
  const withReason=await order();await cancelRequest(db,customer,withReason.request,{reason:'Resolvi por conta própria'});
  assert.equal((await listed(customer,withReason.request)).cancellation.reason,'Resolvi por conta própria');
  const seenByA=(await listed(a,withReason.request)).cancellation;assert.equal(seenByA.by,'customer');assert.equal(seenByA.reason,null);assert.equal(await proposalStatus(withReason.proposalA),'Não selecionada');

  // --- Aceita: cliente cancela; motivo obrigatório.
  const accepted=await order();await acceptProposal(db,customer,accepted.request,accepted.proposalA,{version:1});
  assert.equal((await listed(customer,accepted.request)).can_cancel,true);assert.equal((await listed(a,accepted.request)).can_cancel,true);assert.equal((await listed(b,accepted.request)).can_cancel,false);
  await assert.rejects(()=>cancelRequest(db,customer,accepted.request,{}),failure(400,'CANCEL_REASON_REQUIRED'));
  await assert.rejects(()=>cancelRequest(db,customer,accepted.request,{reason:'   '}),failure(400,'CANCEL_REASON_REQUIRED'));
  await assert.rejects(()=>cancelRequest(db,b,accepted.request,{reason:'Não sou o escolhido'}),failure(403,'CANCEL_NOT_ALLOWED'));
  await assert.rejects(()=>cancelRequest(db,c,accepted.request,{reason:'Sem proposta'}),failure(404));
  assert.equal((await state(accepted.request)).status,'Aceita');assert.equal(await proposalStatus(accepted.proposalA),'Aceita');
  await sendMessage(db,customer,accepted.request,{clientId:randomUUID(),message:'Mensagem antes do cancelamento'});
  // Protocolo de suporte (serviço não realizado, antes do início) aberto: é encerrado junto com o pedido.
  const protocol=await openSupport(db,customer,accepted.request,{reason:'nao_realizado',description:'Relato fictício para o teste de cancelamento.'});
  const before=(await titles(aId,accepted.request)).length,beforeCustomer=(await titles(customerId,accepted.request)).length;
  const second=await cancelRequest(db,customer,accepted.request,{reason:'Mudança de planos'});assert.equal(second.message,'Solicitação cancelada.');assert.equal(second.request.previousStatus,'Aceita');
  const cancelled=await state(accepted.request);assert.equal(cancelled.status,'Cancelada');assert.equal(cancelled.selected_proposal_id,accepted.proposalA);assert.equal(cancelled.started_at,null);
  assert.equal(await proposalStatus(accepted.proposalA),'Cancelada');assert.equal(await proposalStatus(accepted.proposalB),'Não selecionada');
  assert.deepEqual(await one('SELECT status,resolution,resolved_by,resolved_at IS NOT NULL AS dated FROM maridao.service_support WHERE id=$1',[protocol.id]),{status:'Cancelado',resolution:'Solicitação cancelada pelo cliente.',resolved_by:'sistema',dated:true});
  assert.deepEqual((await raw.query("SELECT actor_account_id,actor_kind,previous_status,reason FROM maridao.request_events WHERE request_id=$1 AND action='request_cancelled'",[accepted.request])).rows,[{actor_account_id:customerId,actor_kind:'customer',previous_status:'Aceita',reason:'Mudança de planos'}]);
  // A outra parte recebe um único aviso do cancelamento (013: sem repetir pelo estado da proposta).
  assert.deepEqual((await titles(aId,accepted.request)).slice(before),['Atendimento cancelado pelo cliente: veja o motivo na solicitação']);
  assert.deepEqual((await titles(customerId,accepted.request)).slice(beforeCustomer),[]);assert.equal((await titles(bId,accepted.request)).length,1);
  // 016: no aceite, um aviso para cada parte e um para a proposta não selecionada.
  assert.deepEqual((await titles(customerId,accepted.request)).filter(t=>t!=='Nova proposta recebida'&&t!=='Nova mensagem no atendimento'),['Proposta aceita: combine os detalhes com o prestador pelo chat']);
  assert.deepEqual((await titles(aId,accepted.request)).slice(0,1),['Sua proposta foi aceita: combine os detalhes com o cliente pelo chat']);
  assert.deepEqual((await titles(bId,accepted.request)).slice(0,1),['Proposta não selecionada: o cliente escolheu outra proposta']);
  // Chat somente leitura: a conversa continua visível e recusa novas mensagens.
  assert.equal((await chatAccess(db,customer,accepted.request)).status,'Cancelada');assert.equal((await chatAccess(db,a,accepted.request)).status,'Cancelada');
  for(const user of [customer,a])await assert.rejects(()=>sendMessage(db,user,accepted.request,{clientId:randomUUID(),message:'Depois do cancelamento'}),failure(409));
  await assert.rejects(()=>updateProgress(db,a,accepted.request,{status:'Em andamento'}),(e:unknown)=>e instanceof Error);
  await assert.rejects(()=>cancelRequest(db,a,accepted.request,{reason:'De novo'}),failure(409,'REQUEST_NOT_CANCELLABLE'));
  // Motivo visível para as duas partes na lista, no detalhe e no histórico; o prestador não escolhido não o recebe.
  const expected={by:'customer',at:second.request.cancellation.at,action:'request_cancelled',reason:'Mudança de planos'};
  for(const user of [customer,a]){
   assert.deepEqual((await listed(user,accepted.request)).cancellation,expected);
   const detail=proposalAccessQuery(user,accepted.request),history=historyQuery(user,{});
   const row=(await raw.query(detail.text,detail.values)).rows[0];assert.deepEqual(row.cancellation,expected);assert.equal(row.can_cancel,false);assert.equal(row.can_manage,false);
   assert.deepEqual((await raw.query(history.text,history.values)).rows.find(r=>r.id===accepted.request).cancellation,expected);
  }
  assert.deepEqual((await listed(b,accepted.request)).cancellation,{...expected,reason:null});

  // --- Em andamento: o prestador da proposta aceita cancela.
  const running=await order();await acceptProposal(db,customer,running.request,running.proposalA,{version:1});await updateProgress(db,a,running.request,{status:'Em andamento'});
  await assert.rejects(()=>cancelRequest(db,a,running.request,{}),failure(400,'CANCEL_REASON_REQUIRED'));
  await assert.rejects(()=>cancelRequest(db,b,running.request,{reason:'Não sou o escolhido'}),failure(403,'CANCEL_NOT_ALLOWED'));
  const third=await cancelRequest(db,a,running.request,{reason:'Imprevisto de saúde'});assert.equal(third.message,'Atendimento cancelado.');assert.equal(third.request.cancellation.by,'provider');
  const stopped=await state(running.request);assert.equal(stopped.status,'Cancelada');assert.ok(stopped.started_at);assert.equal(stopped.completed_at,null);
  assert.equal(await proposalStatus(running.proposalA),'Cancelada');
  assert.deepEqual((await raw.query("SELECT actor_account_id,actor_kind,previous_status,reason FROM maridao.request_events WHERE request_id=$1 AND action='request_cancelled'",[running.request])).rows,[{actor_account_id:aId,actor_kind:'provider',previous_status:'Em andamento',reason:'Imprevisto de saúde'}]);
  assert.deepEqual((await titles(customerId,running.request)).slice(-1),['Solicitação cancelada pelo prestador: veja o motivo e, se quiser, crie uma nova solicitação']);assert.ok(!(await titles(aId,running.request)).some(t=>/cancelad/.test(t)));
  assert.equal((await listed(customer,running.request)).cancellation.reason,'Imprevisto de saúde');
  await assert.rejects(()=>sendMessage(db,a,running.request,{clientId:randomUUID(),message:'Depois do cancelamento'}),failure(409));

  // --- Concluída: ninguém cancela.
  const done=await order();await acceptProposal(db,customer,done.request,done.proposalA,{version:1});await updateProgress(db,a,done.request,{status:'Em andamento'});
  // --- Aguardando confirmação: RN05 não prevê cancelamento; depois da contestação a solicitação volta a poder ser cancelada.
  await completionAction(db,a,done.request,'report',{});
  for(const user of [customer,a]){
   await assert.rejects(()=>cancelRequest(db,user,done.request,{reason:'Durante a espera'}),(e:unknown)=>failure(409,'REQUEST_NOT_CANCELLABLE')(e)&&(e as WorkflowError).details?.status==='Aguardando confirmação');
   assert.equal((await listed(user,done.request)).can_cancel,false);
  }
  await assert.rejects(()=>cancelRequest(db,b,done.request,{reason:'Não sou o escolhido'}),failure(403,'CANCEL_NOT_ALLOWED'));
  assert.equal((await state(done.request)).status,'Aguardando confirmação');
  await completionAction(db,customer,done.request,'contest',{reason:'Faltou acabamento'});
  for(const user of [customer,a])assert.equal((await listed(user,done.request)).can_cancel,true);
  await completionAction(db,a,done.request,'report',{});await completionAction(db,customer,done.request,'confirm',{});
  for(const user of [customer,a])await assert.rejects(()=>cancelRequest(db,user,done.request,{reason:'Tarde demais'}),(e:unknown)=>failure(409,'REQUEST_NOT_CANCELLABLE')(e)&&(e as WorkflowError).details?.status==='Concluída');
  assert.equal((await state(done.request)).status,'Concluída');assert.equal((await listed(customer,done.request)).can_cancel,false);assert.equal((await listed(customer,done.request)).cancellation,null);

  // --- Cancelamento antigo sem evento não ganha dados inventados.
  const legacy=await order();await raw.query("UPDATE maridao.service_requests SET status='Cancelada' WHERE id=$1",[legacy.request]);
  assert.equal((await listed(customer,legacy.request)).cancellation,null);

  // --- RNF02.4: consulta administrativa com data, autor e motivo.
  const audit=(await userDetail(db,customerId)).cancellations;
  assert.equal(audit.length,4);assert.ok(audit.every(e=>e.createdAt instanceof Date&&e.category==='Pintura'));
  assert.deepEqual(audit.map(e=>[e.by,e.actorName,e.previousStatus,e.reason]),[['provider','Prestador fictício 0','Em andamento','Imprevisto de saúde'],['customer','Cliente fictício 0','Aceita','Mudança de planos'],['customer','Cliente fictício 0','Aberta','Resolvi por conta própria'],['customer','Cliente fictício 0','Aberta','']]);
  assert.deepEqual((await userDetail(db,aId)).cancellations.map(e=>e.requestId),[running.request,accepted.request]);
  assert.equal((await userDetail(db,cId)).cancellations.length,0);
 }finally{try{await raw.query('ROLLBACK');}finally{raw.release();await pool.end();}}
});
