import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
import {AUTO_CONFIRM_DAYS,AWAITING,autoConfirmOverdue,autoConfirmSql,completionAction,completionDecision,completionPermissionSql,completionSql,contestReason,settleOverdue,type CompletionAction} from '../src/request-completion.ts';
import {listRequestsQuery} from '../src/request-listing.ts';
import {proposalAccessQuery} from '../src/proposals.ts';
import {historyQuery} from '../src/history.ts';
import {closeAccountWork} from '../src/account-management.ts';
import {accessDecision} from '../src/session-guard.ts';
import {WorkflowError} from '../src/workflow-error.ts';
const id='11111111-1111-4111-8111-111111111111',customer={id:'cliente-da-sessao',role:'customer'} as Profile,provider={id:'prestador-da-sessao',role:'provider'} as Profile;
const failure=(status:number,code?:string,current?:string)=>(e:unknown)=>e instanceof WorkflowError&&e.status===status&&(code===undefined||e.details?.code===code)&&(current===undefined||e.details?.status===current);
const statuses=['Aberta','Aceita','Em andamento',AWAITING,'Concluída','Cancelada'];
// Banco roteirizado: cada consulta deve casar com o próximo passo, na ordem.
function scripted(steps:{match:RegExp;rows?:unknown[];rowCount?:number;fail?:boolean}[]){
 const commands:{sql:string;values?:unknown[]}[]=[];let index=0;
 const client={query:async(sql:string,values?:unknown[])=>{const step=steps[index++];assert.ok(step,`consulta inesperada: ${sql}`);assert.match(sql,step.match);commands.push({sql,values});if(step.fail)throw new Error('falha simulada');return {rows:step.rows??[],rowCount:step.rowCount??step.rows?.length??0};}} as unknown as Pick<PoolClient,'query'>;
 return {client,commands,done:()=>assert.equal(index,steps.length)};
}

test('registrar conclusão: matriz papel × etapa (RN06, UC07.3)',()=>{
 for(const status of statuses){
  // Cliente e prestador que não é o da proposta aceita nunca registram.
  assert.throws(()=>completionDecision('report','customer',true,status),failure(403,'COMPLETION_NOT_ALLOWED',status));
  assert.throws(()=>completionDecision('report','provider',false,status),failure(403,'COMPLETION_NOT_ALLOWED',status));
  if(status==='Em andamento')assert.doesNotThrow(()=>completionDecision('report','provider',true,status));
  else assert.throws(()=>completionDecision('report','provider',true,status),failure(409,'COMPLETION_NOT_REPORTABLE',status));
 }
 assert.throws(()=>completionDecision('report','provider',true,'Em andamento',{supportOpen:true}),failure(409,'SUPPORT_OPEN','Em andamento'));
 assert.throws(()=>completionDecision('report','provider',true,'Etapa desconhecida'),failure(409,'COMPLETION_NOT_REPORTABLE'));
 assert.throws(()=>completionDecision('report','provider',true,AWAITING),/já foi registrada/);
});

test('confirmar e contestar: matriz papel × etapa × motivo (RN07, UC07.4)',()=>{
 for(const action of ['confirm','contest'] as const)for(const status of statuses){
  // Prestador (mesmo o escolhido) e cliente de outro pedido nunca confirmam nem contestam.
  for(const reason of ['','Motivo']){
   assert.throws(()=>completionDecision(action,'provider',true,status,{reason}),failure(403,'COMPLETION_NOT_ALLOWED',status));
   assert.throws(()=>completionDecision(action,'customer',false,status,{reason}),failure(403,'COMPLETION_NOT_ALLOWED',status));
  }
  // Fora de "Aguardando confirmação" a operação não é permitida, com ou sem motivo.
  if(status!==AWAITING)for(const reason of ['','Motivo'])assert.throws(()=>completionDecision(action,'customer',true,status,{reason}),failure(409,'COMPLETION_NOT_PENDING',status));
 }
 // Confirmar não pede motivo e vale mesmo depois do prazo (enquanto o sistema ainda não confirmou).
 assert.doesNotThrow(()=>completionDecision('confirm','customer',true,AWAITING));
 assert.doesNotThrow(()=>completionDecision('confirm','customer',true,AWAITING,{overdue:true}));
 // Contestar exige motivo e respeita o prazo.
 assert.doesNotThrow(()=>completionDecision('contest','customer',true,AWAITING,{reason:'Faltou o rodapé'}));
 assert.throws(()=>completionDecision('contest','customer',true,AWAITING,{reason:''}),(e:unknown)=>failure(400,'CONTEST_REASON_REQUIRED',AWAITING)(e)&&'reason' in ((e as WorkflowError).details?.fields as object));
 assert.throws(()=>completionDecision('contest','customer',true,AWAITING),failure(400,'CONTEST_REASON_REQUIRED'));
 assert.throws(()=>completionDecision('contest','customer',true,AWAITING,{reason:'Motivo',overdue:true}),failure(409,'CONTEST_DEADLINE_PASSED',AWAITING));
});

test('motivo da contestação: texto de até 500 caracteres e nenhum campo extra',()=>{
 assert.equal(contestReason({}),'');assert.equal(contestReason({reason:null}),'');assert.equal(contestReason({reason:'   '}),'');assert.equal(contestReason({reason:'  Faltou pintar  '}),'Faltou pintar');
 assert.equal(contestReason({reason:'x'.repeat(500)}).length,500);
 for(const input of [{reason:'x'.repeat(501)},{reason:5},{reason:['a']},{reason:{}}])assert.throws(()=>contestReason(input),(e:unknown)=>failure(400)(e)&&'reason' in ((e as WorkflowError).details?.fields as object));
 for(const input of [null,'texto',[],{reason:'ok',status:'Em andamento'},{actor:'admin'}])assert.throws(()=>contestReason(input),failure(400));
});

test('ações validam antes de abrir transação e recusam papel trocado, corpo com campos e pedido de terceiro',async()=>{
 const none=scripted([]);
 for(const action of ['report','confirm','contest'] as const)await assert.rejects(()=>completionAction(none.client,action==='report'?provider:customer,'não-é-uuid',action,{}),failure(400));
 await assert.rejects(()=>completionAction(none.client,customer,id,'report',{}),failure(403,'COMPLETION_NOT_ALLOWED'));
 for(const action of ['confirm','contest'] as const)await assert.rejects(()=>completionAction(none.client,provider,id,action,{reason:'Motivo'}),failure(403,'COMPLETION_NOT_ALLOWED'));
 for(const role of ['admin',undefined])for(const action of ['report','confirm','contest'] as const)await assert.rejects(()=>completionAction(none.client,{...customer,role} as Profile,id,action,{}),failure(403));
 await assert.rejects(()=>completionAction(none.client,provider,id,'report',{status:'Concluída'}),failure(400));
 await assert.rejects(()=>completionAction(none.client,provider,id,'report',{code:'3456'}),failure(400));
 await assert.rejects(()=>completionAction(none.client,customer,id,'confirm',{reason:'x'}),failure(400));
 await assert.rejects(()=>completionAction(none.client,customer,id,'contest',{reason:'x',status:'Concluída'}),failure(400));none.done();
 const foreign=scripted([{match:/^BEGIN$/},{match:/FOR UPDATE OF r/},{match:/^ROLLBACK$/}]);
 await assert.rejects(()=>completionAction(foreign.client,customer,id,'confirm',{}),failure(404));foreign.done();assert.deepEqual(foreign.commands[1].values,[customer.id,id]);
 // RNF02.2: a trava central barra o administrador antes das rotas.
 for(const path of ['','/confirm','/contest'])assert.equal(accessDecision({role:'admin'},'POST',`/requests/${id}/completion${path}`)?.code,'ADMIN_AREA_ONLY');
});

test('cada ação bloqueia o pedido, muda a etapa a partir da etapa lida, registra o evento e só então confirma',async()=>{
 const at='2026-11-18T12:00:00.000Z',reported=new Date('2026-11-18T12:00:00Z'),deadline=new Date('2026-11-25T12:00:00Z');
 const report=scripted([{match:/^BEGIN$/},{match:/SELECT r\.status[\s\S]*cp\.provider_id=\$1 AND cp\.status='Aceita'[\s\S]*FOR UPDATE OF r/,rows:[{status:'Em andamento',mine:true,support_open:false,overdue:null}]},
  {match:/SET status='Aguardando confirmação',completion_reported_at=clock_timestamp\(\) WHERE id=\$1 AND status='Em andamento'/,rows:[{completion_reported_at:reported,completion_deadline_at:deadline}]},{match:/INSERT INTO maridao\.request_events/,rows:[{at}]},{match:/^COMMIT$/}]);
 assert.deepEqual(await completionAction(report.client,provider,id,'report',{}),{message:'Conclusão registrada. Aguardando a confirmação do cliente.',request:{id,status:AWAITING,previousStatus:'Em andamento',completion_reported_at:reported,completion_deadline_at:deadline}});report.done();
 assert.deepEqual(report.commands[3].values,[id,provider.id,'provider','completion_reported','Em andamento',AWAITING,'Prestador registrou a conclusão do atendimento.']);
 const completed=new Date('2026-11-19T12:00:00Z');
 const confirm=scripted([{match:/^BEGIN$/},{match:/\(r\.customer_id=\$1\) AS mine[\s\S]*FOR UPDATE OF r/,rows:[{status:AWAITING,mine:true,support_open:false,overdue:false}]},
  {match:/SET status='Concluída',completed_at=clock_timestamp\(\),completion_confirmed_by='customer' WHERE id=\$1 AND status='Aguardando confirmação'/,rows:[{completion_reported_at:reported,completed_at:completed,completion_confirmed_by:'customer'}]},{match:/request_events/,rows:[{at}]},{match:/^COMMIT$/}]);
 assert.deepEqual(await completionAction(confirm.client,customer,id,'confirm',{}),{message:'Conclusão confirmada. Você já pode avaliar o atendimento.',request:{id,status:'Concluída',previousStatus:AWAITING,completion_reported_at:reported,completed_at:completed,completion_confirmed_by:'customer',completion_deadline_at:null,can_review:true}});confirm.done();
 assert.deepEqual(confirm.commands[3].values?.slice(1,6),[customer.id,'customer','completion_confirmed',AWAITING,'Concluída']);
 const started=new Date('2026-11-17T12:00:00Z');
 const contest=scripted([{match:/^BEGIN$/},{match:/FOR UPDATE OF r/,rows:[{status:AWAITING,mine:true,support_open:false,overdue:false}]},
  {match:/SET status='Em andamento',completion_reported_at=NULL WHERE id=\$1 AND status='Aguardando confirmação'/,rows:[{started_at:started}]},{match:/request_events/,rows:[{at}]},{match:/^COMMIT$/}]);
 assert.deepEqual(await completionAction(contest.client,customer,id,'contest',{reason:' Faltou o rodapé '}),{message:'Contestação registrada. O atendimento voltou para "Em andamento".',request:{id,status:'Em andamento',previousStatus:AWAITING,started_at:started,completion_reported_at:null,completion_deadline_at:null,completion_contest:{at,reason:'Faltou o rodapé'}}});contest.done();
 assert.deepEqual(contest.commands[3].values,[id,customer.id,'customer','completion_contested',AWAITING,'Em andamento','Faltou o rodapé']);
 // Recusa, corrida e falha desfazem tudo: nada é confirmado sem o evento.
 const refused=scripted([{match:/^BEGIN$/},{match:/FOR UPDATE OF r/,rows:[{status:AWAITING,mine:true,support_open:false,overdue:false}]},{match:/^ROLLBACK$/}]);
 await assert.rejects(()=>completionAction(refused.client,customer,id,'contest',{}),failure(400,'CONTEST_REASON_REQUIRED'));refused.done();
 const other=scripted([{match:/^BEGIN$/},{match:/FOR UPDATE OF r/,rows:[{status:'Em andamento',mine:false,support_open:false,overdue:null}]},{match:/^ROLLBACK$/}]);
 await assert.rejects(()=>completionAction(other.client,provider,id,'report',{}),failure(403,'COMPLETION_NOT_ALLOWED','Em andamento'));other.done();
 const changed=scripted([{match:/^BEGIN$/},{match:/FOR UPDATE OF r/,rows:[{status:AWAITING,mine:true,support_open:false,overdue:false}]},{match:/UPDATE maridao\.service_requests/,rowCount:0},{match:/^ROLLBACK$/}]);
 await assert.rejects(()=>completionAction(changed.client,customer,id,'confirm',{}),failure(409));changed.done();
 for(const action of ['report','confirm','contest'] as CompletionAction[]){
  const broken=scripted([{match:/^BEGIN$/},{match:/FOR UPDATE OF r/,rows:[{status:action==='report'?'Em andamento':AWAITING,mine:true,support_open:false,overdue:false}]},{match:/UPDATE maridao\.service_requests/,rows:[{}]},{match:/request_events/,fail:true},{match:/^ROLLBACK$/}]);
  await assert.rejects(()=>completionAction(broken.client,action==='report'?provider:customer,id,action,action==='contest'?{reason:'Motivo'}:{}),/falha simulada/);broken.done();
  assert.ok(!broken.commands.some(c=>c.sql==='COMMIT'));
 }
});

test('regra dos 7 dias: prazo único, confirmação como sistema e "agora" injetável',async()=>{
 assert.equal(AUTO_CONFIRM_DAYS,7);
 // O prazo não aparece escrito no SQL da confirmação automática: vem sempre do parâmetro.
 assert.ok(!/7 days|days=>7/.test(autoConfirmSql));assert.match(autoConfirmSql,/completion_reported_at<=\$1::timestamptz-make_interval\(days=>\$2::integer\)/);
 assert.match(autoConfirmSql,/r\.status='Aguardando confirmação'[\s\S]*FOR UPDATE SKIP LOCKED/);assert.match(autoConfirmSql,/SET status='Concluída'[\s\S]*completion_confirmed_by='system'[\s\S]*AND r\.status='Aguardando confirmação'/);
 assert.match(autoConfirmSql,/NULL,'system','completion_auto_confirmed','Aguardando confirmação','Concluída',\$3/);
 const now=new Date('2026-12-01T10:00:00.000Z'),d=scripted([{match:/^WITH due AS/,rows:[{request_id:'a'},{request_id:'b'}]}]);
 assert.deepEqual(await autoConfirmOverdue(d.client,now),['a','b']);d.done();
 assert.deepEqual(d.commands[0].values?.slice(0,2),[now.toISOString(),7]);assert.match(String(d.commands[0].values?.[2]),/7 dias/);
 // Sem "agora" informado usa o relógio; nenhuma conclusão vencida devolve lista vazia.
 const before=Date.now(),clock=scripted([{match:/^WITH due AS/}]);assert.deepEqual(await autoConfirmOverdue(clock.client),[]);
 const used=Date.parse(String(clock.commands[0].values?.[0]));assert.ok(used>=before&&used<=Date.now());
 // A passada preguiçosa nunca derruba a rota que a chamou.
 const error=console.error;console.error=()=>{};
 try{await assert.doesNotReject(()=>settleOverdue({query:async()=>{throw new Error('banco fora');}} as unknown as Pick<PoolClient,'query'>));}finally{console.error=error;}
 // O prazo exibido usa a mesma constante.
 for(const role of ['customer','provider'] as const)assert.match(completionSql(role),/CASE WHEN r\.status='Aguardando confirmação' THEN r\.completion_reported_at\+make_interval\(days=>7\) END AS completion_deadline_at/);
});

test('listas, detalhe e histórico expõem permissões por etapa, datas, prazo e a última contestação só a quem participa',()=>{
 const fields=['can_start','can_report_completion','can_confirm_completion','can_contest_completion','can_review'];
 for(const user of [customer,provider]){
  for(const text of [listRequestsQuery(user,{}).text,proposalAccessQuery(user,id).text]){
   for(const field of [...fields,'can_manage','can_chat','can_cancel','support_open','can_open_support','completion_deadline_at','completion_contest','cancellation'])assert.match(text,new RegExp(`AS ${field}\\b`));
   assert.match(text,/r\.completion_reported_at,/);assert.match(text,/r\.completion_confirmed_by,/);
   assert.ok(!/can_confirm\b|completion_code/.test(text));
  }
  const history=historyQuery(user,{}).text;assert.match(history,/r\.completion_reported_at,/);assert.match(history,/AS completion_deadline_at/);assert.match(history,/AS completion_contest/);assert.ok(!/completion_code/.test(history));
 }
 const c=completionPermissionSql('customer'),p=completionPermissionSql('provider');
 assert.match(c,/false AS can_start,false AS can_report_completion/);
 assert.match(c,/\(r\.customer_id=\$1 AND r\.status='Aguardando confirmação'\) AS can_confirm_completion,\(r\.customer_id=\$1 AND r\.status='Aguardando confirmação'\) AS can_contest_completion/);
 assert.match(c,/r\.customer_id=\$1 AND r\.status='Concluída' AND NOT EXISTS\(SELECT 1 FROM maridao\.service_reviews/);
 assert.match(p,/\(r\.status='Aceita' AND EXISTS[\s\S]*cs\.provider_id=\$1 AND cs\.status='Aceita'\)[\s\S]*AS can_start/);
 assert.match(p,/\(r\.status='Em andamento' AND EXISTS[\s\S]*cr\.provider_id=\$1 AND cr\.status='Aceita'\)[\s\S]*AS can_report_completion/);
 assert.match(p,/false AS can_confirm_completion,false AS can_contest_completion,false AS can_review/);
 assert.match(completionSql('customer'),/CASE WHEN r\.customer_id=\$1 THEN \(SELECT jsonb_build_object\('at'/);
 assert.match(completionSql('provider'),/CASE WHEN EXISTS\(SELECT 1 FROM maridao\.proposals cq WHERE cq\.id=r\.selected_proposal_id[\s\S]*cq\.provider_id=\$1\) THEN/);
 for(const role of ['customer','provider'] as const)assert.ok(!/full_name|email|phone|cpf|actor_account_id/.test(completionSql(role)));
});

test('"Aguardando confirmação" conta como atendimento em curso no encerramento de conta',async()=>{
 const none={query:async()=>{throw new Error('não deveria consultar');}} as unknown as Pick<PoolClient,'query'>;
 for(const [target,row] of [[customer,{customer_id:customer.id,chosen:false}],[provider,{customer_id:'outro',chosen:true}]] as const)
  await assert.rejects(()=>closeAccountWork(none,target,target,[{id,status:AWAITING,...row}]),failure(409));
 // Prestador com proposta apenas pendente em pedido de terceiro não é barrado pela etapa do pedido.
 const d=scripted([{match:/r\.status=ANY\(\$2::text\[\]\)/},{match:/UPDATE maridao\.proposals SET status='Retirada'/}]);
 await closeAccountWork(d.client,provider,provider,[{id,status:AWAITING,customer_id:'outro',chosen:false}]);d.done();
 assert.deepEqual(d.commands[0].values,[provider.id,['Aceita','Em andamento',AWAITING]]);
});
