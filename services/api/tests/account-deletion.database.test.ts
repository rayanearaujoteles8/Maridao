import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomInt,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
import {createDatabasePool} from '../src/database.ts';
import {hashPassword,verifyPassword} from '../src/password.ts';
import {acceptProposal} from '../src/proposal-acceptance.ts';
import {updateProgress} from '../src/request-progress.ts';
import {completionAction} from '../src/request-completion.ts';
import {cancelRequest} from '../src/request-cancellation.ts';
import {chatAccess,reviewService,sendMessage,decryptMessage} from '../src/team-workflows.ts';
import {closureStatus,customerAuthorSql,deactivateAccount,REMOVED_NAME} from '../src/account-management.ts';
import {listRequestsQuery} from '../src/request-listing.ts';
import {listProposalsQuery,proposalAccessQuery} from '../src/proposals.ts';
import {historyQuery} from '../src/history.ts';
import {userDetail} from '../src/admin.ts';
import {WorkflowError} from '../src/workflow-error.ts';

function fakeCpf(){
 for(;;){
  const digits=Array.from({length:9},()=>randomInt(10));
  for(const length of [9,10]){const check=(digits.reduce((sum,digit,i)=>sum+digit*(length+1-i),0)*10)%11;digits.push(check===10?0:check);}
  if(new Set(digits).size>1)return digits.join('');
 }
}
const failure=(status:number,code?:string)=>(e:unknown)=>e instanceof WorkflowError&&e.status===status&&(code===undefined||e.details?.code===code);
// Roda nas tabelas reais com o usuário maridao_api (confere também os GRANTs, a regra de autoria e os gatilhos da migração 016).
// Tudo acontece dentro de uma única transação que é desfeita ao final: nenhum dado fictício permanece.
test('PostgreSQL: autoexclusão do cliente, bloqueio com atendimento em curso, prestador só inativado, histórico e avisos',{skip:process.env.MARIDAO_DB_TEST!=='1'},async()=>{
 const pool=createDatabasePool(),raw=await pool.connect();
 const db={query:async(sql:string,values?:unknown[])=>{
  if(sql==='BEGIN')return raw.query('SAVEPOINT operation');if(sql==='COMMIT')return raw.query('RELEASE SAVEPOINT operation');
  if(sql==='ROLLBACK'){await raw.query('ROLLBACK TO SAVEPOINT operation');return raw.query('RELEASE SAVEPOINT operation');}return raw.query(sql,values);
 }} as unknown as Pick<PoolClient,'query'>;
 const one=async(sql:string,values?:unknown[])=>(await raw.query(sql,values)).rows[0];
 const titles=async(account:string,request:string)=>(await raw.query('SELECT title FROM maridao.notifications WHERE account_id=$1 AND request_id=$2 ORDER BY id',[account,request])).rows.map(r=>r.title as string);
 try{
  await raw.query('BEGIN');
  const secret='senha fictícia da exclusão',hash=await hashPassword(secret);
  const ids=Array.from({length:5},()=>randomUUID()),[goneId,busyId,aId,bId,adminId]=ids as [string,string,string,string,string];
  for(const id of ids)await raw.query('INSERT INTO maridao.accounts(id,email,password_hash) VALUES($1,$2,$3)',[id,`${id}@example.invalid`,hash]);
  const cpf=fakeCpf();
  for(const [index,id] of [goneId,busyId].entries())await raw.query("INSERT INTO maridao.customer_profiles(account_id,full_name,phone,cpf,neighborhood) VALUES($1,$2,'63999120345',$3,'Plano Diretor Sul')",[id,`Cliente fictício ${index}`,index?fakeCpf():cpf]);
  for(const [index,id] of [aId,bId].entries())await raw.query("INSERT INTO maridao.provider_profiles(account_id,full_name,phone,document_type,document_encrypted,document_fingerprint,categories,specialties,neighborhoods,availability,approval_status) VALUES($1,$2,'63999999999','CPF','v1.fixture',$3,ARRAY['Pintura'],ARRAY['Pintura interna'],ARRAY['Plano Diretor Sul'],'A combinar','Aprovado')",[id,`Prestador fictício ${index}`,id.replaceAll('-','').padEnd(64,'0')]);
  await raw.query("INSERT INTO maridao.admin_profiles(account_id,full_name) VALUES($1,'Admin fictício')",[adminId]);
  const gone={id:goneId,role:'customer'} as Profile,busy={id:busyId,role:'customer'} as Profile,a={id:aId,role:'provider'} as Profile,b={id:bId,role:'provider'} as Profile;
  // Cada pedido nasce com proposta pendente dos prestadores A e B.
  const order=async(customerId:string)=>{
   const request=randomUUID(),proposals=[randomUUID(),randomUUID()];
   await raw.query("INSERT INTO maridao.service_requests(id,customer_id,category,description,neighborhood) VALUES($1,$2,'Pintura','Pedido fictício da exclusão','Plano Diretor Sul')",[request,customerId]);
   for(const [i,provider] of [aId,bId].entries())await raw.query("INSERT INTO maridao.proposals(id,request_id,provider_id,amount,description,estimated_duration,valid_until) VALUES($1,$2,$3,100,'Proposta fictícia','Um dia','2099-12-31')",[proposals[i],request,provider]);
   return {request,proposalA:proposals[0]!,proposalB:proposals[1]!};
  };
  const state=async(request:string)=>(await one('SELECT status FROM maridao.service_requests WHERE id=$1',[request])).status;
  const proposalStatus=async(id:string)=>(await one('SELECT status FROM maridao.proposals WHERE id=$1',[id])).status;
  const account=async(id:string)=>one('SELECT a.email,a.disabled_at,a.deleted_at,a.password_hash,c.full_name,c.phone,c.cpf,c.neighborhood FROM maridao.accounts a LEFT JOIN maridao.customer_profiles c ON c.account_id=a.id WHERE a.id=$1',[id]);
  const sessions=async(id:string)=>(await one('SELECT count(*)::integer AS count FROM maridao.sessions WHERE account_id=$1',[id])).count;

  // --- Histórico do cliente que será excluído: um atendimento concluído e avaliado, com conversa, um pedido cancelado e um pedido aberto.
  const done=await order(goneId);await acceptProposal(db,gone,done.request,done.proposalA,{version:1});
  // 016: no aceite, um aviso para cada parte e um para a proposta não selecionada.
  assert.deepEqual((await titles(goneId,done.request)).filter(t=>t!=='Nova proposta recebida'),['Proposta aceita: combine os detalhes com o prestador pelo chat']);
  assert.deepEqual(await titles(aId,done.request),['Sua proposta foi aceita: combine os detalhes com o cliente pelo chat']);
  assert.deepEqual(await titles(bId,done.request),['Proposta não selecionada: o cliente escolheu outra proposta']);
  await sendMessage(db,gone,done.request,{clientId:randomUUID(),message:'Mensagem fictícia do cliente'});
  await updateProgress(db,a,done.request,{status:'Em andamento'});await completionAction(db,a,done.request,'report',{});await completionAction(db,gone,done.request,'confirm',{});
  const review=await reviewService(db,gone,done.request,{rating:5,comment:'Avaliação fictícia'});
  const dropped=await order(goneId);await acceptProposal(db,gone,dropped.request,dropped.proposalA,{version:1});await cancelRequest(db,gone,dropped.request,{reason:'Motivo fictício'});
  const open=await order(goneId);
  for(let i=0;i<2;i++)await raw.query("INSERT INTO maridao.sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[randomBytes(32).toString('hex'),goneId]);
  await raw.query("INSERT INTO maridao.account_challenges(account_id,purpose,token_hash,expires_at) VALUES($1,'verify_email',$2,now()+interval '15 minutes')",[goneId,randomBytes(32).toString('hex')]);

  // --- Bloqueio (RN10): Aceita, Em andamento e Aguardando confirmação impedem a exclusão; nada muda.
  const active=await order(busyId);await order(busyId);await acceptProposal(db,busy,active.request,active.proposalA,{version:1});
  await raw.query("INSERT INTO maridao.sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[randomBytes(32).toString('hex'),busyId]);
  const refused=async(status:string)=>{
   assert.equal(await state(active.request),status);
   assert.deepEqual(await closureStatus(db,busy),{action:'delete',allowed:false,activeRequests:1,openRequests:1,code:'ACCOUNT_HAS_ACTIVE_REQUESTS',reason:'Você tem solicitação aceita ou em andamento. A exclusão só será possível depois que essas solicitações forem concluídas ou canceladas.'});
   await assert.rejects(()=>deactivateAccount(db,busy,{currentPassword:secret}),failure(409,'ACCOUNT_HAS_ACTIVE_REQUESTS'));
   // O prestador da proposta aceita também não pode inativar a conta.
   assert.equal((await closureStatus(db,a)).allowed,false);await assert.rejects(()=>deactivateAccount(db,a,{currentPassword:secret}),failure(409,'ACCOUNT_HAS_ACTIVE_REQUESTS'));
   const kept=await account(busyId);assert.ok(kept.email&&kept.cpf&&kept.phone&&!kept.disabled_at&&!kept.deleted_at);assert.equal(await sessions(busyId),1);
  };
  await refused('Aceita');await updateProgress(db,a,active.request,{status:'Em andamento'});await refused('Em andamento');
  await completionAction(db,a,active.request,'report',{});await refused('Aguardando confirmação');
  assert.equal((await one("SELECT count(*)::integer AS count FROM maridao.service_requests WHERE customer_id=$1 AND status='Aberta'",[busyId])).count,1);
  assert.equal((await one('SELECT count(*)::integer AS count FROM maridao.admin_events WHERE target_account_id=$1',[busyId])).count,0);

  // --- Exclusão permitida (UC01.3 fluxo 1): a senha é a confirmação.
  assert.deepEqual(await closureStatus(db,gone),{action:'delete',allowed:true,activeRequests:0,openRequests:1});
  await assert.rejects(()=>deactivateAccount(db,gone,{currentPassword:'senha errada'}),failure(403,'WRONG_PASSWORD'));
  assert.equal((await account(goneId)).deleted_at,null);assert.equal(await sessions(goneId),2);
  const beforeA=(await titles(aId,open.request)).length;
  assert.deepEqual(await deactivateAccount(db,gone,{currentPassword:secret,reason:'Não uso mais o aplicativo'}),{action:'deleted',message:'Conta excluída. Seus dados pessoais foram eliminados.'});
  const erased=await account(goneId);
  assert.deepEqual([erased.email,erased.full_name,erased.phone,erased.cpf,erased.neighborhood],[null,REMOVED_NAME,null,null,null]);assert.ok(erased.disabled_at&&erased.deleted_at);
  assert.equal(await verifyPassword(secret,erased.password_hash),false);
  // Sessão encerrada (todas) e códigos pendentes apagados: a conta não permite novos acessos.
  assert.equal(await sessions(goneId),0);assert.equal((await one('SELECT count(*)::integer AS count FROM maridao.account_challenges WHERE account_id=$1',[goneId])).count,0);
  assert.equal((await one("SELECT count(*)::integer AS count FROM maridao.accounts WHERE email=$1",[`${goneId}@example.invalid`])).count,0);
  await assert.rejects(()=>deactivateAccount(db,gone,{currentPassword:secret}),failure(403));
  // RNF02.4: data, autor (o próprio cliente) e motivo, consultáveis pelo administrador.
  assert.deepEqual((await raw.query('SELECT admin_id,actor_kind,action,reason,created_at IS NOT NULL AS dated FROM maridao.admin_events WHERE target_account_id=$1',[goneId])).rows,[{admin_id:null,actor_kind:'customer',action:'account_deleted',reason:'Não uso mais o aplicativo',dated:true}]);
  const detail=await userDetail(db,goneId);assert.equal(detail.user.accountStatus,'Excluída');assert.equal(detail.user.name,REMOVED_NAME);assert.equal(detail.user.email,null);assert.equal(detail.user.cpf,null);
  assert.deepEqual(detail.events.map(e=>[e.action,e.by,e.adminName,e.reason]),[['account_deleted','customer',null,'Não uso mais o aplicativo']]);
  assert.ok(!JSON.stringify(detail).includes(cpf)&&!JSON.stringify(detail).includes('Cliente fictício 0'));
  // O pedido aberto é cancelado com evento; as propostas pendentes passam a "Não selecionada" e cada prestador é avisado uma vez.
  assert.equal(await state(open.request),'Cancelada');assert.equal(await proposalStatus(open.proposalA),'Não selecionada');assert.equal(await proposalStatus(open.proposalB),'Não selecionada');
  assert.deepEqual((await raw.query('SELECT actor_account_id,actor_kind,action,previous_status,next_status FROM maridao.request_events WHERE request_id=$1',[open.request])).rows,[{actor_account_id:goneId,actor_kind:'customer',action:'account_closed',previous_status:'Aberta',next_status:'Cancelada'}]);
  assert.deepEqual((await titles(aId,open.request)).slice(beforeA),['Solicitação cancelada: sua proposta foi encerrada']);assert.deepEqual(await titles(bId,open.request),['Solicitação cancelada: sua proposta foi encerrada']);
  // O histórico é preservado: pedido concluído, cancelado, proposta, conversa e avaliação continuam lá.
  assert.equal(await state(done.request),'Concluída');assert.equal(await state(dropped.request),'Cancelada');assert.equal(await proposalStatus(done.proposalA),'Aceita');
  // E-mail e CPF eliminados ficam livres para um novo cadastro.
  const again=randomUUID();await raw.query('INSERT INTO maridao.accounts(id,email,password_hash) VALUES($1,$2,$3)',[again,`${goneId}@example.invalid`,hash]);
  await raw.query("INSERT INTO maridao.customer_profiles(account_id,full_name,phone,cpf,neighborhood) VALUES($1,'Cliente fictício de volta','63999120345',$2,'Plano Diretor Sul')",[again,cpf]);

  // --- O prestador continua vendo o histórico, com o autor como "Usuário removido" e sem dado pessoal do cliente.
  const removed={customer_removed:true,customer_name:REMOVED_NAME};
  for(const query of [listRequestsQuery(a,{}),historyQuery(a,{})]){
   const rows=(await raw.query(query.text.replace('LIMIT 21','LIMIT 100000'),query.values)).rows;
   for(const request of [done.request,dropped.request,open.request]){const row=rows.find(r=>r.id===request);assert.ok(row,'pedido ausente do histórico do prestador');assert.deepEqual({customer_removed:row.customer_removed,customer_name:row.customer_name},removed);}
   assert.ok(!JSON.stringify(rows).includes('Cliente fictício 0')&&!JSON.stringify(rows).includes(cpf));
   // Pedidos de cliente ativo não levam nome.
   const other=rows.find(r=>r.id===active.request);assert.deepEqual({customer_removed:other.customer_removed,customer_name:other.customer_name},{customer_removed:false,customer_name:null});
  }
  const access=proposalAccessQuery(a,done.request),shown=(await raw.query(access.text,access.values)).rows[0];
  assert.deepEqual({customer_removed:shown.customer_removed,customer_name:shown.customer_name,status:shown.status},{...removed,status:'Concluída'});
  const proposals=listProposalsQuery(a,done.request);assert.deepEqual((await raw.query(proposals.text,proposals.values)).rows.map(p=>[p.id,p.status]),[[done.proposalA,'Aceita']]);
  // Conversa: continua legível para o prestador, somente leitura.
  assert.deepEqual(await chatAccess(db,a,done.request),{id:done.request,status:'Concluída',customer_id:goneId,provider_id:aId});
  const messages=(await raw.query('SELECT sender_id,ciphertext FROM maridao.chat_messages WHERE request_id=$1',[done.request])).rows;
  assert.deepEqual(messages.map(m=>[m.sender_id,decryptMessage(done.request,m.ciphertext)]),[[goneId,'Mensagem fictícia do cliente']]);
  await assert.rejects(()=>sendMessage(db,a,done.request,{clientId:randomUUID(),message:'Depois da exclusão'}),failure(409));
  // Avaliação: mesma consulta do perfil público e de GET /requests/:id/review.
  const reviews=(await raw.query(`SELECT id,rating,comment,${customerAuthorSql('customer_id','author')} FROM maridao.service_reviews WHERE provider_id=$1`,[aId])).rows;
  assert.deepEqual(reviews,[{id:review.id,rating:5,comment:'Avaliação fictícia',author_removed:true,author_name:REMOVED_NAME}]);
  // Cancelamentos consultados pelo administrador: o autor aparece como "Usuário removido".
  assert.ok((await userDetail(db,aId)).cancellations.some(c=>c.requestId===dropped.request&&c.actorName===REMOVED_NAME&&c.reason==='Motivo fictício'));

  // --- Depois de resolver o atendimento, o outro cliente consegue excluir (motivo padrão quando não informa).
  await completionAction(db,busy,active.request,'confirm',{});
  assert.equal((await closureStatus(db,busy)).allowed,true);await deactivateAccount(db,busy,{currentPassword:secret});
  assert.ok((await account(busyId)).deleted_at);assert.equal(await sessions(busyId),0);
  assert.equal((await one("SELECT reason FROM maridao.admin_events WHERE target_account_id=$1 AND action='account_deleted'",[busyId])).reason,'Exclusão solicitada pelo próprio cliente.');

  // --- Prestador: nunca excluído; o encerramento só inativa, com registro.
  const spare=await order(again);
  await raw.query("INSERT INTO maridao.sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[randomBytes(32).toString('hex'),bId]);
  assert.deepEqual(await closureStatus(db,b),{action:'deactivate',allowed:true,activeRequests:0,openRequests:0});
  assert.deepEqual(await deactivateAccount(db,b,{currentPassword:secret}),{action:'deactivated',message:'Conta inativada. O histórico dos serviços foi preservado.'});
  const inactive=await one('SELECT a.email,a.disabled_at,a.deleted_at,p.full_name,p.phone,p.document_encrypted FROM maridao.accounts a JOIN maridao.provider_profiles p ON p.account_id=a.id WHERE a.id=$1',[bId]);
  assert.ok(inactive.disabled_at&&inactive.email&&inactive.phone&&inactive.document_encrypted);assert.equal(inactive.deleted_at,null);assert.equal(inactive.full_name,'Prestador fictício 1');
  assert.equal(await sessions(bId),0);assert.equal(await proposalStatus(spare.proposalB),'Retirada');assert.equal(await state(spare.request),'Aberta');
  assert.deepEqual((await raw.query('SELECT admin_id,actor_kind,action,reason FROM maridao.admin_events WHERE target_account_id=$1',[bId])).rows,[{admin_id:null,actor_kind:'provider',action:'account_deactivated',reason:'Inativação solicitada pelo próprio prestador.'}]);
  assert.equal((await userDetail(db,bId)).user.accountStatus,'Inativa');

  // --- A regra de autoria do registro recusa combinações inválidas.
  for(const [admin,action,kind] of [[null,'account_deleted','administration'],[adminId,'account_deleted','customer'],[null,'account_deactivated','customer'],[null,'account_deleted','provider'],[null,'account_edited','customer']] as const){
   await raw.query('SAVEPOINT rule');
   await assert.rejects(()=>raw.query("INSERT INTO maridao.admin_events(admin_id,target_account_id,action,reason,actor_kind) VALUES($1,$2,$3,'Motivo',$4)",[admin,again,action,kind]),(e:unknown)=>typeof e==='object'&&e!==null&&'constraint' in e&&e.constraint==='admin_events_actor_check');
   await raw.query('ROLLBACK TO SAVEPOINT rule');await raw.query('RELEASE SAVEPOINT rule');
  }
 }finally{try{await raw.query('ROLLBACK');}finally{raw.release();await pool.end();}}
});
