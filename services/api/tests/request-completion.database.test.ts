import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
import {createDatabasePool} from '../src/database.ts';
import {acceptProposal} from '../src/proposal-acceptance.ts';
import {updateProgress} from '../src/request-progress.ts';
import {AUTO_CONFIRM_DAYS,AWAITING,autoConfirmOverdue,completionAction} from '../src/request-completion.ts';
import {chatAccess,reviewService,sendMessage} from '../src/team-workflows.ts';
import {cancelRequest} from '../src/request-cancellation.ts';
import {closeAccountWork,lockAccountRequests} from '../src/account-management.ts';
import {listRequestsQuery} from '../src/request-listing.ts';
import {proposalAccessQuery} from '../src/proposals.ts';
import {historyQuery} from '../src/history.ts';
import {WorkflowError} from '../src/workflow-error.ts';

const body=(action:'confirm'|'contest')=>action==='contest'?{reason:'Motivo'}:{};
const failure=(status:number,code?:string,current?:string)=>(e:unknown)=>e instanceof WorkflowError&&e.status===status&&(code===undefined||e.details?.code===code)&&(current===undefined||e.details?.status===current);
// Roda nas tabelas reais com o usuário maridao_api (confere também os GRANTs, os CHECKs e o gatilho da migração 014).
// Tudo acontece dentro de uma única transação que é desfeita ao final: nenhum dado fictício permanece.
test('PostgreSQL: conclusão registrada, confirmada, contestada e confirmada automaticamente, com avisos e regras vizinhas',{skip:process.env.MARIDAO_DB_TEST!=='1'},async()=>{
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
  // Cada pedido nasce com proposta dos prestadores A e B; a de A é aceita.
  const order=async(start=true)=>{
   const request=randomUUID(),proposals=[randomUUID(),randomUUID()];
   await raw.query("INSERT INTO maridao.service_requests(id,customer_id,category,description,neighborhood) VALUES($1,$2,'Pintura','Pedido fictício de conclusão','Plano Diretor Sul')",[request,customerId]);
   for(const [i,provider] of [aId,bId].entries())await raw.query("INSERT INTO maridao.proposals(id,request_id,provider_id,amount,description,estimated_duration,valid_until) VALUES($1,$2,$3,100,'Proposta fictícia','Um dia','2099-12-31')",[proposals[i],request,provider]);
   await acceptProposal(db,customer,request,proposals[0]!,{version:1});
   if(start)await updateProgress(db,a,request,{status:'Em andamento'});
   return request;
  };
  const state=async(request:string)=>one('SELECT status,started_at,completed_at,completion_reported_at,completion_confirmed_by FROM maridao.service_requests WHERE id=$1',[request]);
  const events=async(request:string,action:string)=>(await raw.query('SELECT actor_account_id,actor_kind,previous_status,next_status,reason FROM maridao.request_events WHERE request_id=$1 AND action=$2 ORDER BY created_at,id',[request,action])).rows;
  const listed=async(user:Profile,request:string)=>{const q=listRequestsQuery(user,{});return (await raw.query(q.text,q.values)).rows.find(r=>r.id===request);};
  const detail=async(user:Profile,request:string)=>{const q=proposalAccessQuery(user,request);return (await raw.query(q.text,q.values)).rows[0];};
  const history=async(user:Profile,request:string)=>{const q=historyQuery(user,{});return (await raw.query(q.text,q.values)).rows.find(r=>r.id===request);};
  const permissions=(row:Record<string,unknown>)=>['can_start','can_report_completion','can_confirm_completion','can_contest_completion','can_review'].filter(field=>row[field]===true);

  // --- Aceita: ninguém registra, confirma ou contesta; só o prestador escolhido pode iniciar.
  const accepted=await order(false);
  assert.deepEqual(permissions(await listed(a,accepted)),['can_start']);assert.deepEqual(permissions(await listed(b,accepted)),[]);assert.deepEqual(permissions(await listed(customer,accepted)),[]);
  await assert.rejects(()=>completionAction(db,a,accepted,'report',{}),failure(409,'COMPLETION_NOT_REPORTABLE','Aceita'));
  for(const action of ['confirm','contest'] as const)await assert.rejects(()=>completionAction(db,customer,accepted,action,body(action)),failure(409,'COMPLETION_NOT_PENDING','Aceita'));

  // --- Em andamento → Aguardando confirmação: só o prestador da proposta aceita registra (RN06).
  const request=await order();
  assert.deepEqual(permissions(await listed(a,request)),['can_report_completion']);assert.deepEqual(permissions(await listed(customer,request)),[]);
  await assert.rejects(()=>completionAction(db,customer,request,'report',{}),failure(403,'COMPLETION_NOT_ALLOWED'));
  await assert.rejects(()=>completionAction(db,b,request,'report',{}),failure(403,'COMPLETION_NOT_ALLOWED','Em andamento'));
  await assert.rejects(()=>completionAction(db,c,request,'report',{}),failure(404));
  for(const action of ['confirm','contest'] as const){
   await assert.rejects(()=>completionAction(db,customer,request,action,body(action)),failure(409,'COMPLETION_NOT_PENDING','Em andamento'));
   await assert.rejects(()=>completionAction(db,otherCustomer,request,action,body(action)),failure(404));
  }
  await assert.rejects(()=>reviewService(db,customer,request,{rating:5,comment:''}),failure(409));
  assert.equal((await state(request)).status,'Em andamento');
  const beforeCustomer=(await titles(customerId,request)).length,beforeA=(await titles(aId,request)).length;
  const reported=await completionAction(db,a,request,'report',{});
  assert.equal(reported.message,'Conclusão registrada. Aguardando a confirmação do cliente.');assert.equal(reported.request.status,AWAITING);assert.equal(reported.request.previousStatus,'Em andamento');
  const waiting=await state(request);assert.equal(waiting.status,AWAITING);assert.ok(waiting.completion_reported_at>=waiting.started_at);assert.equal(waiting.completed_at,null);assert.equal(waiting.completion_confirmed_by,null);
  assert.deepEqual(reported.request.completion_reported_at,waiting.completion_reported_at);
  assert.equal(reported.request.completion_deadline_at.getTime()-waiting.completion_reported_at.getTime(),AUTO_CONFIRM_DAYS*86_400_000);
  assert.deepEqual(await events(request,'completion_reported'),[{actor_account_id:aId,actor_kind:'provider',previous_status:'Em andamento',next_status:AWAITING,reason:'Prestador registrou a conclusão do atendimento.'}]);
  // RF13.3: o cliente é avisado para confirmar ou contestar; um aviso por pessoa.
  assert.deepEqual((await titles(customerId,request)).slice(beforeCustomer),['Conclusão registrada pelo prestador: confirme ou conteste']);
  assert.deepEqual((await titles(aId,request)).slice(beforeA),['Atendimento atualizado: Aguardando confirmação']);
  await assert.rejects(()=>completionAction(db,a,request,'report',{}),failure(409,'COMPLETION_NOT_REPORTABLE',AWAITING));
  // Campos para as telas na lista, no detalhe e no histórico.
  for(const read of [listed,detail]){
   const row=await read(customer,request);assert.deepEqual(permissions(row),['can_confirm_completion','can_contest_completion']);assert.equal(row.status,AWAITING);assert.equal(row.can_cancel,false);
   assert.deepEqual(row.completion_reported_at,waiting.completion_reported_at);assert.deepEqual(row.completion_deadline_at,reported.request.completion_deadline_at);assert.equal(row.completion_contest,null);assert.equal(row.completion_confirmed_by,null);
   assert.ok(!('can_confirm' in row));
   const seen=await read(a,request);assert.deepEqual(permissions(seen),[]);assert.equal(seen.can_manage,true);assert.equal(seen.can_cancel,false);assert.deepEqual(seen.completion_deadline_at,reported.request.completion_deadline_at);
  }
  for(const user of [customer,a])assert.deepEqual((await history(user,request)).completion_deadline_at,reported.request.completion_deadline_at);

  // --- Regras vizinhas em "Aguardando confirmação": sem cancelamento, sem avaliação, conta não encerra, chat aberto.
  for(const user of [customer,a])await assert.rejects(()=>cancelRequest(db,user,request,{reason:'Durante a espera'}),failure(409,'REQUEST_NOT_CANCELLABLE',AWAITING));
  await assert.rejects(()=>reviewService(db,customer,request,{rating:5,comment:''}),failure(409));
  for(const account of [customer,a])await assert.rejects(async()=>closeAccountWork(db,account,account,await lockAccountRequests(db,account.id)),failure(409));
  await sendMessage(db,a,request,{clientId:randomUUID(),message:'Serviço finalizado, pode conferir.'});assert.equal((await chatAccess(db,customer,request)).status,AWAITING);
  await assert.rejects(()=>updateProgress(db,a,request,{status:'Em andamento'}),(e:unknown)=>e instanceof Error&&'status' in e&&e.status===409);

  // --- Contestar: motivo obrigatório; volta a "Em andamento", registra o motivo e avisa o prestador (RN07).
  await assert.rejects(()=>completionAction(db,customer,request,'contest',{}),failure(400,'CONTEST_REASON_REQUIRED',AWAITING));
  await assert.rejects(()=>completionAction(db,customer,request,'contest',{reason:'   '}),failure(400,'CONTEST_REASON_REQUIRED'));
  await assert.rejects(()=>completionAction(db,customer,request,'contest',{reason:'x'.repeat(501)}),failure(400));
  await assert.rejects(()=>completionAction(db,a,request,'contest',{reason:'Não sou o cliente'}),failure(403,'COMPLETION_NOT_ALLOWED'));
  assert.equal((await state(request)).status,AWAITING);assert.equal((await events(request,'completion_contested')).length,0);
  const noticesA=(await titles(aId,request)).length,noticesCustomer=(await titles(customerId,request)).length;
  const contested=await completionAction(db,customer,request,'contest',{reason:' Faltou pintar o rodapé '});
  assert.equal(contested.request.status,'Em andamento');assert.equal(contested.request.previousStatus,AWAITING);assert.equal(contested.request.completion_contest?.reason,'Faltou pintar o rodapé');assert.match(contested.request.completion_contest!.at,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  const back=await state(request);assert.equal(back.status,'Em andamento');assert.equal(back.completion_reported_at,null);assert.deepEqual(back.started_at,waiting.started_at);assert.equal(back.completed_at,null);
  assert.deepEqual(await events(request,'completion_contested'),[{actor_account_id:customerId,actor_kind:'customer',previous_status:AWAITING,next_status:'Em andamento',reason:'Faltou pintar o rodapé'}]);
  assert.deepEqual((await titles(aId,request)).slice(noticesA),['Conclusão contestada pelo cliente: veja o motivo']);
  assert.deepEqual((await titles(customerId,request)).slice(noticesCustomer),['Pedido atualizado: Em andamento']);
  // A última contestação aparece para o cliente e o prestador escolhido; o prestador não escolhido não recebe o motivo.
  for(const read of [listed,detail,history])for(const user of [customer,a])assert.deepEqual((await read(user,request)).completion_contest,contested.request.completion_contest);
  assert.equal((await listed(b,request)).completion_contest,null);
  assert.deepEqual(permissions(await listed(a,request)),['can_report_completion']);assert.equal((await listed(a,request)).completion_deadline_at,null);assert.equal((await listed(customer,request)).can_cancel,true);
  await assert.rejects(()=>completionAction(db,customer,request,'confirm',{}),failure(409,'COMPLETION_NOT_PENDING','Em andamento'));

  // --- O prestador registra de novo e o cliente confirma: "Concluída", avaliação liberada, prestador avisado.
  await completionAction(db,a,request,'report',{});assert.equal((await events(request,'completion_reported')).length,2);
  const noticesBefore=(await titles(aId,request)).length,customerBefore=(await titles(customerId,request)).length;
  const confirmed=await completionAction(db,customer,request,'confirm',{});
  assert.equal(confirmed.request.status,'Concluída');assert.equal(confirmed.request.completion_confirmed_by,'customer');assert.equal(confirmed.request.can_review,true);
  const done=await state(request);assert.equal(done.status,'Concluída');assert.equal(done.completion_confirmed_by,'customer');assert.ok(done.completed_at>=done.completion_reported_at);
  assert.deepEqual(await events(request,'completion_confirmed'),[{actor_account_id:customerId,actor_kind:'customer',previous_status:AWAITING,next_status:'Concluída',reason:'Cliente confirmou a conclusão do atendimento.'}]);
  assert.deepEqual((await titles(aId,request)).slice(noticesBefore),['Conclusão confirmada pelo cliente']);
  assert.deepEqual((await titles(customerId,request)).slice(customerBefore),['Pedido atualizado: Concluída']);
  const finished=await listed(customer,request);assert.deepEqual(permissions(finished),['can_review']);assert.equal(finished.completion_deadline_at,null);assert.equal(finished.completion_confirmed_by,'customer');assert.deepEqual(finished.completion_contest,contested.request.completion_contest);
  for(const action of ['confirm','contest'] as const)await assert.rejects(()=>completionAction(db,customer,request,action,body(action)),failure(409,'COMPLETION_NOT_PENDING','Concluída'));
  await assert.rejects(()=>completionAction(db,a,request,'report',{}),failure(409,'COMPLETION_NOT_REPORTABLE','Concluída'));
  await assert.rejects(()=>sendMessage(db,customer,request,{clientId:randomUUID(),message:'Depois da conclusão'}),failure(409));
  // RF08: avaliação só depois de "Concluída", uma única vez.
  await reviewService(db,customer,request,{rating:5,comment:'Serviço bem feito'});
  await assert.rejects(()=>reviewService(db,customer,request,{rating:1,comment:'Duplicada'}),failure(409));
  assert.deepEqual(permissions(await listed(customer,request)),[]);

  // --- Confirmação automática: só depois de AUTO_CONFIRM_DAYS dias, como sistema, avisando cliente e prestador.
  const late=await order(),early=await order();
  for(const id of [late,early])await completionAction(db,a,id,'report',{});
  const backdate=(id:string,interval:string)=>raw.query(`UPDATE maridao.service_requests SET started_at=started_at-interval '30 days',completion_reported_at=completion_reported_at-$2::interval WHERE id=$1`,[id,interval]);
  await backdate(late,`${AUTO_CONFIRM_DAYS} days`);await backdate(early,`${AUTO_CONFIRM_DAYS*24-1} hours`);
  // "Agora" injetado no passado: nada vence.
  assert.deepEqual(await autoConfirmOverdue(db,new Date('2000-01-01T00:00:00Z')),[]);assert.equal((await state(late)).status,AWAITING);
  // Vencida, a contestação é recusada mesmo antes de o sistema passar; a que ainda está no prazo segue contestável.
  await assert.rejects(()=>completionAction(db,customer,late,'contest',{reason:'Fora do prazo'}),failure(409,'CONTEST_DEADLINE_PASSED',AWAITING));
  const lateCustomer=(await titles(customerId,late)).length,lateA=(await titles(aId,late)).length,earlyCustomer=(await titles(customerId,early)).length;
  const settled=await autoConfirmOverdue(db);
  assert.ok(settled.includes(late));assert.ok(!settled.includes(early));
  const auto=await state(late);assert.equal(auto.status,'Concluída');assert.equal(auto.completion_confirmed_by,'system');assert.ok(auto.completed_at>=auto.completion_reported_at);
  assert.deepEqual(await events(late,'completion_auto_confirmed'),[{actor_account_id:null,actor_kind:'system',previous_status:AWAITING,next_status:'Concluída',reason:`Sem resposta do cliente em ${AUTO_CONFIRM_DAYS} dias: conclusão confirmada automaticamente pelo sistema.`}]);
  assert.deepEqual((await titles(customerId,late)).slice(lateCustomer),['Conclusão confirmada automaticamente: o prazo de resposta terminou']);
  assert.deepEqual((await titles(aId,late)).slice(lateA),['Conclusão confirmada automaticamente: o prazo de resposta terminou']);
  const autoRow=await listed(customer,late);assert.equal(autoRow.completion_confirmed_by,'system');assert.deepEqual(permissions(autoRow),['can_review']);
  // Repetir a passada não confirma nem avisa de novo; a não vencida continua aguardando e sem avisos novos.
  assert.ok(!(await autoConfirmOverdue(db)).includes(late));assert.equal((await events(late,'completion_auto_confirmed')).length,1);assert.equal((await titles(customerId,late)).length,lateCustomer+1);
  assert.equal((await state(early)).status,AWAITING);assert.equal((await titles(customerId,early)).length,earlyCustomer);
  assert.deepEqual(permissions(await listed(customer,early)),['can_confirm_completion','can_contest_completion']);
  // Depois da confirmação automática o cliente avalia normalmente e não pode mais contestar.
  await assert.rejects(()=>completionAction(db,customer,late,'contest',{reason:'Tarde demais'}),failure(409,'COMPLETION_NOT_PENDING','Concluída'));
  await reviewService(db,customer,late,{rating:4,comment:''});
  await completionAction(db,customer,early,'contest',{reason:'Ainda no prazo'});assert.equal((await state(early)).status,'Em andamento');
  // Com todos os atendimentos concluídos ou contestados resolvidos, o encerramento de conta deixa de ser barrado por "Aguardando confirmação".
  await cancelRequest(db,customer,early,{reason:'Desisti do serviço'});await cancelRequest(db,customer,accepted,{reason:'Desisti do serviço'});
  await closeAccountWork(db,customer,customer,await lockAccountRequests(db,customerId));
 }finally{try{await raw.query('ROLLBACK');}finally{raw.release();await pool.end();}}
});
