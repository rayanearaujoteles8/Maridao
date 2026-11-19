import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
import {hashPassword} from '../src/password.ts';
import {accessDecision} from '../src/session-guard.ts';
import {activeStatuses,closureStatus,customerAuthorSql,deactivateAccount,REMOVED_NAME} from '../src/account-management.ts';
import {listRequestsQuery} from '../src/request-listing.ts';
import {historyQuery} from '../src/history.ts';
import {proposalAccessQuery} from '../src/proposals.ts';
import {WorkflowError} from '../src/workflow-error.ts';

const id='11111111-1111-4111-8111-111111111111',request='22222222-2222-4222-8222-222222222222',secret='senha fictícia do teste';
const customer={id,role:'customer'} as Profile,provider={id,role:'provider'} as Profile;
const failure=(status:number,code?:string)=>(e:unknown)=>e instanceof WorkflowError&&e.status===status&&(code===undefined||e.details?.code===code);
// Banco roteirizado: cada consulta deve casar com o próximo passo, na ordem.
function scripted(steps:{match:RegExp;rows?:unknown[]}[]){
 const commands:{sql:string;values?:unknown[]}[]=[];let index=0;
 const client={query:async(sql:string,values?:unknown[])=>{const step=steps[index++];assert.ok(step,`consulta inesperada: ${sql}`);assert.match(sql,step.match);commands.push({sql,values});return {rows:step.rows??[],rowCount:step.rows?.length??0};}} as unknown as Pick<PoolClient,'query'>;
 return {client,commands,done:()=>assert.equal(index,steps.length)};
}
const hash=await hashPassword(secret);
const lockRequests=(rows:unknown[]=[])=>({match:/FROM maridao\.service_requests r WHERE r\.customer_id=\$1[\s\S]*FOR UPDATE OF r/,rows});
const lockAccount={match:/SELECT password_hash FROM maridao\.accounts WHERE id=\$1 AND disabled_at IS NULL FOR UPDATE/,rows:[{password_hash:hash}]};
const noActive={match:/SELECT r\.id FROM maridao\.service_requests r WHERE r\.status=ANY/};

test('UC01.3 fluxo 1: cliente sem atendimento em curso exclui a própria conta, com dados eliminados, sessões encerradas e registro',async()=>{
 const d=scripted([{match:/^BEGIN$/},lockRequests([{id:request,status:'Aberta',customer_id:id,chosen:false},{id:'x',status:'Concluída',customer_id:id,chosen:false},{id:'y',status:'Cancelada',customer_id:id,chosen:false}]),lockAccount,noActive,
  {match:/UPDATE maridao\.service_requests SET status='Cancelada' WHERE id=\$1/},{match:/UPDATE maridao\.proposals SET status='Não selecionada' WHERE request_id=\$1 AND status='Pendente' AND valid_until >=/},{match:/INSERT INTO maridao\.request_events/},
  {match:/UPDATE maridao\.accounts SET disabled_at=COALESCE\(disabled_at,clock_timestamp\(\)\),deleted_at=clock_timestamp\(\),email=NULL,email_verified_at=NULL,must_change_password=false,password_hash='removido\$'/},
  {match:/UPDATE maridao\.customer_profiles SET full_name=\$2,phone=NULL,cpf=NULL,neighborhood=NULL WHERE account_id=\$1/},{match:/DELETE FROM maridao\.sessions WHERE account_id=\$1$/},{match:/DELETE FROM maridao\.account_challenges WHERE account_id=\$1$/},
  {match:/INSERT INTO maridao\.admin_events\(admin_id,target_account_id,action,reason,actor_kind\)/},{match:/^COMMIT$/}]);
 assert.deepEqual(await deactivateAccount(d.client,customer,{currentPassword:secret}),{action:'deleted',message:'Conta excluída. Seus dados pessoais foram eliminados.'});d.done();
 // Só o pedido aberto é cancelado, com o próprio cliente como autor do evento.
 assert.deepEqual(d.commands[4].values,[request]);assert.deepEqual(d.commands[6].values,[request,id,'customer','account_closed','Aberta','Cancelada','Cliente encerrou a conta.',null]);
 assert.deepEqual(d.commands[8].values,[id,REMOVED_NAME]);assert.equal(REMOVED_NAME,'Usuário removido');
 // RNF02.4: autor é o próprio cliente (sem administrador) e o motivo nunca fica vazio.
 assert.deepEqual(d.commands[11].values,[null,id,'account_deleted','Exclusão solicitada pelo próprio cliente.','customer']);
 const reasoned=scripted([{match:/^BEGIN$/},lockRequests(),lockAccount,noActive,{match:/UPDATE maridao\.accounts/},{match:/UPDATE maridao\.customer_profiles/},{match:/DELETE FROM maridao\.sessions/},{match:/DELETE FROM maridao\.account_challenges/},{match:/INSERT INTO maridao\.admin_events/},{match:/^COMMIT$/}]);
 await deactivateAccount(reasoned.client,customer,{currentPassword:secret,reason:'  Não uso mais o aplicativo  '});reasoned.done();
 assert.deepEqual(reasoned.commands[8].values,[null,id,'account_deleted','Não uso mais o aplicativo','customer']);
});

test('RN10: exclusão bloqueada com solicitação Aceita, Em andamento ou Aguardando confirmação; nada é alterado',async()=>{
 assert.deepEqual(activeStatuses,['Aceita','Em andamento','Aguardando confirmação']);
 for(const status of activeStatuses){
  const d=scripted([{match:/^BEGIN$/},lockRequests([{id:request,status,customer_id:id,chosen:false},{id:'x',status:'Aberta',customer_id:id,chosen:false}]),lockAccount,{match:/^ROLLBACK$/}]);
  await assert.rejects(()=>deactivateAccount(d.client,customer,{currentPassword:secret}),(e:unknown)=>failure(409,'ACCOUNT_HAS_ACTIVE_REQUESTS')(e)&&/só será possível depois que essas solicitações forem concluídas ou canceladas/.test((e as WorkflowError).message));d.done();
 }
 // Atendimento que mudou depois do bloqueio dos pedidos também recusa.
 const late=scripted([{match:/^BEGIN$/},lockRequests(),lockAccount,{...noActive,rows:[{id:request}]},{match:/^ROLLBACK$/}]);
 await assert.rejects(()=>deactivateAccount(late.client,customer,{currentPassword:secret}),failure(409,'ACCOUNT_HAS_ACTIVE_REQUESTS'));late.done();
 // Senha errada: recusa antes de qualquer alteração.
 const wrong=scripted([{match:/^BEGIN$/},lockRequests(),lockAccount,{match:/^ROLLBACK$/}]);
 await assert.rejects(()=>deactivateAccount(wrong.client,customer,{currentPassword:'outra senha'}),failure(403,'WRONG_PASSWORD'));wrong.done();
 const none=scripted([]);
 for(const input of [null,[],{currentPassword:secret,extra:1},{currentPassword:secret,reason:5},{currentPassword:secret,reason:'x'.repeat(501)}])await assert.rejects(()=>deactivateAccount(none.client,customer,input),failure(400));
 for(const role of ['admin',undefined] as const)await assert.rejects(()=>deactivateAccount(none.client,{id,role} as Profile,{currentPassword:secret}),failure(403,'ACCOUNT_CLOSE_NOT_ALLOWED'));none.done();
 assert.equal(accessDecision({role:'admin'},'POST','/account/close')?.code,'ADMIN_AREA_ONLY');
});

test('prestador nunca é excluído: o encerramento só inativa, retira propostas pendentes e mantém os dados',async()=>{
 const d=scripted([{match:/^BEGIN$/},lockRequests([{id:request,status:'Aberta',customer_id:'outro',chosen:false}]),lockAccount,noActive,
  {match:/UPDATE maridao\.proposals SET status='Retirada',withdrawn_at=clock_timestamp\(\) WHERE provider_id=\$1 AND status='Pendente'/,rows:[{request_id:request}]},{match:/INSERT INTO maridao\.request_events/},
  {match:/^UPDATE maridao\.accounts SET disabled_at=clock_timestamp\(\) WHERE id=\$1$/},{match:/DELETE FROM maridao\.sessions/},{match:/DELETE FROM maridao\.account_challenges/},{match:/INSERT INTO maridao\.admin_events/},{match:/^COMMIT$/}]);
 assert.deepEqual(await deactivateAccount(d.client,provider,{currentPassword:secret}),{action:'deactivated',message:'Conta inativada. O histórico dos serviços foi preservado.'});d.done();
 assert.ok(!d.commands.some(c=>/deleted_at|provider_profiles|customer_profiles|service_requests SET/.test(c.sql)));
 assert.deepEqual(d.commands[9].values,[null,id,'account_deactivated','Inativação solicitada pelo próprio prestador.','provider']);
 const busy=scripted([{match:/^BEGIN$/},lockRequests([{id:request,status:'Em andamento',customer_id:'outro',chosen:true}]),lockAccount,{match:/^ROLLBACK$/}]);
 await assert.rejects(()=>deactivateAccount(busy.client,provider,{currentPassword:secret}),(e:unknown)=>failure(409,'ACCOUNT_HAS_ACTIVE_REQUESTS')(e)&&/inativação/.test((e as WorkflowError).message));busy.done();
});

test('GET /account informa o que o encerramento fará e se já é possível',async()=>{
 const free=scripted([{match:/count\(\*\) FILTER/,rows:[{active:0,open:2}]}]);
 assert.deepEqual(await closureStatus(free.client,customer),{action:'delete',allowed:true,activeRequests:0,openRequests:2});assert.deepEqual(free.commands[0].values,[id,activeStatuses]);
 const blocked=await closureStatus(scripted([{match:/count/,rows:[{active:1,open:0}]}]).client,customer);
 assert.equal(blocked.allowed,false);assert.equal(blocked.code,'ACCOUNT_HAS_ACTIVE_REQUESTS');assert.match(blocked.reason??'',/concluídas ou canceladas/);
 assert.equal((await closureStatus(scripted([{match:/count/,rows:[{active:0,open:0}]}]).client,provider)).action,'deactivate');
 await assert.rejects(()=>closureStatus(scripted([]).client,{id,role:'admin'} as Profile),failure(403));
});

test('histórico do prestador marca o cliente excluído como "Usuário removido" sem expor dados de cliente',()=>{
 const sql=customerAuthorSql();
 assert.match(sql,/deleted_at IS NOT NULL\) AS customer_removed/);assert.match(sql,/THEN 'Usuário removido' END AS customer_name/);assert.ok(!/full_name|email|phone|cpf/.test(sql));
 assert.match(customerAuthorSql('customer_id','author'),/AS author_removed,[\s\S]*AS author_name/);
 for(const text of [listRequestsQuery(provider,{}).text,historyQuery(provider,{}).text,proposalAccessQuery(provider,request).text])assert.match(text,/AS customer_removed,[\s\S]*AS customer_name/);
 // O cliente consulta os próprios pedidos: o campo não se aplica.
 for(const text of [listRequestsQuery(customer,{}).text,historyQuery(customer,{}).text,proposalAccessQuery(customer,request).text])assert.ok(!text.includes('customer_removed'));
});
