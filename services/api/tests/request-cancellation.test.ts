import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
import {cancelReason,cancelRequest,cancellationDecision,cancelPermissionSql,cancellationSql} from '../src/request-cancellation.ts';
import {listRequestsQuery} from '../src/request-listing.ts';
import {proposalAccessQuery} from '../src/proposals.ts';
import {historyQuery} from '../src/history.ts';
import {accessDecision} from '../src/session-guard.ts';
import {WorkflowError} from '../src/workflow-error.ts';
const id='11111111-1111-4111-8111-111111111111',customer={id:'cliente-da-sessao',role:'customer'} as Profile,provider={id:'prestador-da-sessao',role:'provider'} as Profile;
const failure=(status:number,code?:string)=>(e:unknown)=>e instanceof WorkflowError&&e.status===status&&(code===undefined||e.details?.code===code);
// Banco roteirizado: cada consulta deve casar com o próximo passo, na ordem.
function scripted(steps:{match:RegExp;rows?:unknown[];rowCount?:number}[]){
 const commands:{sql:string;values?:unknown[]}[]=[];let index=0;
 const client={query:async(sql:string,values?:unknown[])=>{const step=steps[index++];assert.ok(step,`consulta inesperada: ${sql}`);assert.match(sql,step.match);commands.push({sql,values});return {rows:step.rows??[],rowCount:step.rowCount??step.rows?.length??0};}} as unknown as Pick<PoolClient,'query'>;
 return {client,commands,done:()=>assert.equal(index,steps.length)};
}

test('matriz papel × etapa × motivo do cancelamento (RN05)',()=>{
 const allowed=(party:'customer'|'provider',chosen:boolean,status:string,reason:string)=>assert.doesNotThrow(()=>cancellationDecision(party,chosen,status,reason));
 // Cliente: Aberta com ou sem motivo; depois do aceite só com motivo.
 allowed('customer',false,'Aberta','');allowed('customer',false,'Aberta','Desisti');
 for(const status of ['Aceita','Em andamento']){
  allowed('customer',false,status,'Mudança de planos');
  assert.throws(()=>cancellationDecision('customer',false,status,''),(e:unknown)=>failure(400,'CANCEL_REASON_REQUIRED')(e)&&'reason' in ((e as WorkflowError).details?.fields as object));
 }
 // Prestador da proposta aceita: Aceita ou Em andamento, sempre com motivo.
 for(const status of ['Aceita','Em andamento']){
  allowed('provider',true,status,'Imprevisto');
  assert.throws(()=>cancellationDecision('provider',true,status,''),failure(400,'CANCEL_REASON_REQUIRED'));
  assert.throws(()=>cancellationDecision('provider',false,status,'Imprevisto'),failure(403,'CANCEL_NOT_ALLOWED'));
 }
 assert.throws(()=>cancellationDecision('provider',false,'Aberta','Imprevisto'),failure(403,'CANCEL_NOT_ALLOWED'));
 assert.throws(()=>cancellationDecision('provider',true,'Aberta','Imprevisto'),failure(409,'REQUEST_NOT_CANCELLABLE'));
 // Aguardando confirmação: RN05 e 7.5 não preveem cancelamento; ninguém cancela, com ou sem motivo.
 for(const party of ['customer','provider'] as const)for(const reason of ['','Motivo'])
  assert.throws(()=>cancellationDecision(party,true,'Aguardando confirmação',reason),(e:unknown)=>failure(409,'REQUEST_NOT_CANCELLABLE')(e)&&(e as WorkflowError).details?.status==='Aguardando confirmação'&&/confirmação/.test((e as WorkflowError).message));
 assert.throws(()=>cancellationDecision('provider',false,'Aguardando confirmação','Motivo'),failure(403,'CANCEL_NOT_ALLOWED'));
 // Concluída ou já Cancelada: ninguém cancela, com ou sem motivo, e a resposta leva a etapa atual.
 for(const status of ['Concluída','Cancelada'])for(const party of ['customer','provider'] as const)for(const chosen of [true,false])for(const reason of ['','Motivo'])
  assert.throws(()=>cancellationDecision(party,chosen,status,reason),(e:unknown)=>failure(409,'REQUEST_NOT_CANCELLABLE')(e)&&(e as WorkflowError).details?.status===status);
 assert.throws(()=>cancellationDecision('customer',false,'Etapa desconhecida','Motivo'),failure(409,'REQUEST_NOT_CANCELLABLE'));
});

test('motivo: opcional no corpo, texto de até 500 caracteres e nenhum campo extra',()=>{
 assert.equal(cancelReason({}),'');assert.equal(cancelReason({reason:null}),'');assert.equal(cancelReason({reason:'   '}),'');assert.equal(cancelReason({reason:'  Viagem  '}),'Viagem');
 assert.equal(cancelReason({reason:'x'.repeat(500)}).length,500);
 for(const input of [{reason:'x'.repeat(501)},{reason:5},{reason:['a']},{reason:{}}])assert.throws(()=>cancelReason(input),(e:unknown)=>failure(400)(e)&&'reason' in ((e as WorkflowError).details?.fields as object));
 for(const input of [null,'texto',[],{reason:'ok',status:'Cancelada'},{actor:'admin'}])assert.throws(()=>cancelReason(input),failure(400));
});

test('cancelamento valida antes de abrir transação e recusa perfil sem acesso ou pedido de terceiro',async()=>{
 const none=scripted([]);
 await assert.rejects(()=>cancelRequest(none.client,customer,'não-é-uuid',{}),failure(400));
 await assert.rejects(()=>cancelRequest(none.client,{...customer,role:'admin'} as Profile,id,{reason:'x'}),failure(403));
 await assert.rejects(()=>cancelRequest(none.client,{...customer,role:undefined} as Profile,id,{reason:'x'}),failure(403));
 await assert.rejects(()=>cancelRequest(none.client,customer,id,{reason:'x',extra:1}),failure(400));none.done();
 const foreign=scripted([{match:/^BEGIN$/},{match:/FOR UPDATE OF r/},{match:/^ROLLBACK$/}]);
 await assert.rejects(()=>cancelRequest(foreign.client,provider,id,{reason:'Imprevisto'}),failure(404));foreign.done();
 assert.deepEqual(foreign.commands[1].values,[provider.id,id]);
 // RNF02.2: a trava central barra o administrador antes da rota.
 assert.equal(accessDecision({role:'admin'},'POST',`/requests/${id}/cancel`)?.code,'ADMIN_AREA_ONLY');
});

test('cancelamento bloqueia o pedido, atualiza propostas, encerra protocolo, registra evento e só então confirma',async()=>{
 const proposal='22222222-2222-4222-8222-222222222222';
 const d=scripted([{match:/^BEGIN$/},{match:/SELECT r\.status[\s\S]*FOR UPDATE OF r/,rows:[{status:'Em andamento',selected_proposal_id:proposal,chosen:true}]},
  {match:/UPDATE maridao\.service_requests SET status='Cancelada' WHERE id=\$1 AND status=\$2/,rowCount:1},{match:/UPDATE maridao\.proposals SET status='Não selecionada' WHERE request_id=\$1 AND status='Pendente'/},
  {match:/UPDATE maridao\.proposals SET status='Cancelada' WHERE request_id=\$1 AND id=\$2 AND status='Aceita'/},{match:/UPDATE maridao\.service_support SET status='Cancelado'/},
  {match:/INSERT INTO maridao\.request_events/,rows:[{at:'2026-11-18T12:00:00.000Z'}]},{match:/^COMMIT$/}]);
 const result=await cancelRequest(d.client,provider,id,{reason:' Imprevisto '});d.done();
 assert.deepEqual(result,{message:'Atendimento cancelado.',request:{id,status:'Cancelada',previousStatus:'Em andamento',cancellation:{by:'provider',at:'2026-11-18T12:00:00.000Z',action:'request_cancelled',reason:'Imprevisto'}}});
 assert.deepEqual(d.commands[2].values,[id,'Em andamento']);assert.deepEqual(d.commands[4].values,[id,proposal]);
 assert.deepEqual(d.commands[6].values,[id,provider.id,'provider','Em andamento','Imprevisto']);
 // Aberta sem proposta aceita: motivo vazio aceito e nenhuma proposta "Aceita" para alterar.
 const open=scripted([{match:/^BEGIN$/},{match:/FOR UPDATE OF r/,rows:[{status:'Aberta',selected_proposal_id:null,chosen:false}]},{match:/UPDATE maridao\.service_requests/,rowCount:1},{match:/Não selecionada/},{match:/service_support/},{match:/request_events/,rows:[{at:'x'}]},{match:/^COMMIT$/}]);
 assert.equal((await cancelRequest(open.client,customer,id,{})).request.cancellation.reason,null);open.done();assert.equal(open.commands[5].values?.[4],'');
 // Recusa e falha desfazem tudo: nada é confirmado sem o evento.
 const refused=scripted([{match:/^BEGIN$/},{match:/FOR UPDATE OF r/,rows:[{status:'Aceita',selected_proposal_id:proposal,chosen:false}]},{match:/^ROLLBACK$/}]);
 await assert.rejects(()=>cancelRequest(refused.client,customer,id,{}),failure(400,'CANCEL_REASON_REQUIRED'));refused.done();
 const changed=scripted([{match:/^BEGIN$/},{match:/FOR UPDATE OF r/,rows:[{status:'Aberta',selected_proposal_id:null,chosen:false}]},{match:/UPDATE maridao\.service_requests/,rowCount:0},{match:/^ROLLBACK$/}]);
 await assert.rejects(()=>cancelRequest(changed.client,customer,id,{}),failure(409));changed.done();
 let calls=0;const broken={query:async(sql:string)=>{calls++;if(sql.includes('request_events'))throw new Error('falha simulada');return {rows:[{status:'Aberta',selected_proposal_id:null,chosen:false}],rowCount:1};}} as unknown as Pick<PoolClient,'query'>;
 await assert.rejects(()=>cancelRequest(broken,customer,id,{}),/falha simulada/);assert.equal(calls,7);
});

test('listas, detalhe e histórico expõem can_cancel e o registro do cancelamento sem motivo para quem não participa',()=>{
 for(const user of [customer,provider]){
  for(const text of [listRequestsQuery(user,{}).text,proposalAccessQuery(user,id).text]){assert.match(text,/AS can_cancel/);assert.match(text,/AS cancellation/);}
  assert.match(historyQuery(user,{}).text,/AS cancellation/);
 }
 assert.match(cancelPermissionSql('customer'),/r\.customer_id=\$1 AND r\.status IN \('Aberta','Aceita','Em andamento'\)/);
 assert.match(cancelPermissionSql('provider'),/r\.status IN \('Aceita','Em andamento'\) AND EXISTS[\s\S]*provider_id=\$1 AND cc\.status='Aceita'/);
 assert.match(cancellationSql('customer'),/CASE WHEN r\.customer_id=\$1 THEN/);
 assert.match(cancellationSql('provider'),/CASE WHEN EXISTS\(SELECT 1 FROM maridao\.proposals cx WHERE cx\.id=r\.selected_proposal_id[\s\S]*cx\.provider_id=\$1\) THEN/);
 for(const role of ['customer','provider'] as const){const sql=cancellationSql(role);assert.match(sql,/e\.next_status='Cancelada'/);assert.ok(!/full_name|email|phone|cpf|actor_account_id/.test(sql));}
});
