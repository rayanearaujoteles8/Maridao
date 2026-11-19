import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
import * as confirmation from '../src/customer-confirmation.ts';
import {CompletionError,openSupport,validateCustomerAction,validateSupportInput,supportQuery,supportPermissionSql} from '../src/customer-confirmation.ts';
import {updateProgress,ProgressError} from '../src/request-progress.ts';
const id='11111111-1111-4111-8111-111111111111';
const customer={id:'cliente',role:'customer'} as Profile,provider={id:'prestador',role:'provider'} as Profile;
type Step={match:RegExp;rows?:unknown[];rowCount?:number;fail?:boolean};
function db(steps:Step[]){const calls:{text:string;values?:unknown[]}[]=[];const query=async(text:string,values?:unknown[])=>{calls.push({text,values});const step=steps.shift();assert.ok(step,text);assert.match(text,step.match);if(step.fail)throw Error('Falha simulada');return {rows:step.rows??[],rowCount:step.rowCount??0};};return {client:{query} as unknown as Pick<PoolClient,'query'>,calls,done:()=>assert.equal(steps.length,0)};}
test('cliente do pedido é o único que pode abrir relato; o protocolo aceita só serviço não realizado e nenhuma identidade externa',()=>{
 assert.throws(()=>validateCustomerAction(provider,id),CompletionError);assert.throws(()=>validateCustomerAction(customer,'invalid'),CompletionError);
 // "discordancia" servia à confirmação por código; a discordância agora é a contestação da conclusão (UC07.4).
 for(const input of [{},{reason:'denuncia',description:'texto'},{reason:'discordancia',description:'texto'},{reason:'nao_realizado',description:''},{reason:'nao_realizado',description:'x'.repeat(3001)},{reason:'nao_realizado',description:'texto',customerId:'outro'}])assert.throws(()=>validateSupportInput(input),(e:unknown)=>e instanceof CompletionError&&e.status===400);
 assert.deepEqual(validateSupportInput({reason:'nao_realizado',description:' relato '}),{reason:'nao_realizado',description:'relato'});
 const q=supportQuery(customer,id);assert.deepEqual(q.values,[id,customer.id]);assert.match(q.text,/r.customer_id=\$2 AND s.customer_id=\$2/);assert.throws(()=>supportQuery(provider,id),CompletionError);
});
test('o código de quatro dígitos foi retirado: nada o gera, confere ou devolve',()=>{
 for(const name of ['codeDigest','phoneCompletionCode','issueCompletionCode','checkCompletionCode','completionPermissionSql'])assert.ok(!(name in confirmation),name);
 for(const role of ['customer','provider'] as const){const sql=supportPermissionSql(role);assert.ok(!/can_confirm|completion_code/.test(sql));assert.match(sql,/AS can_chat/);assert.match(sql,/AS support_open/);assert.match(sql,/AS can_open_support/);}
 assert.match(supportPermissionSql('customer'),/r\.customer_id=\$1 AND r\.status='Aceita' AND NOT EXISTS/);assert.match(supportPermissionSql('provider'),/false AS can_open_support/);
});
test('conclusão pela rota de andamento, com ou sem código, é rejeitada antes de iniciar transação',async()=>{
 for(const input of [{status:'Concluída'},{status:'Concluída',code:'3456'}]){const d=db([]);await assert.rejects(()=>updateProgress(d.client,provider,id,input),ProgressError);assert.equal(d.calls.length,0);}
});
test('protocolo só é aberto antes do início (pedido Aceita), pelo cliente do pedido e sem outro protocolo aberto',async()=>{
 const input={reason:'nao_realizado',description:'Prestador não compareceu.'};
 for(const rows of [[],[{status:'Aberta'}],[{status:'Em andamento'}],[{status:'Aguardando confirmação'}],[{status:'Concluída'}],[{status:'Cancelada'}],[{status:'Aceita',support_open:true}]]){
  const d=db([{match:/BEGIN/},{match:/r.customer_id=\$2 FOR UPDATE/,rows},{match:/ROLLBACK/}]);
  await assert.rejects(()=>openSupport(d.client,customer,id,input),(e:unknown)=>e instanceof CompletionError&&e.status===(rows.length?409:404));d.done();
 }
 const none=db([]);await assert.rejects(()=>openSupport(none.client,provider,id,input),(e:unknown)=>e instanceof CompletionError&&e.status===403);assert.equal(none.calls.length,0);
 const d=db([{match:/BEGIN/},{match:/FOR UPDATE/,rows:[{status:'Aceita',support_open:false}]},{match:/INSERT INTO maridao.service_support/,rows:[{id:'protocolo',status:'Aberto'}]},{match:/INSERT INTO maridao.request_events/},{match:/COMMIT/}]);
 assert.deepEqual(await openSupport(d.client,customer,id,input),{id:'protocolo',status:'Aberto'});d.done();
 assert.deepEqual(d.calls[2].values,[id,customer.id,'nao_realizado','Prestador não compareceu.']);assert.deepEqual(d.calls[3].values?.slice(3,7),['support_opened','Aceita','Aceita','Cliente relatou serviço não realizado.']);
 assert.ok(!d.calls.some(c=>c.text.includes('completion_code')));
});
test('falha no registro do evento desfaz a abertura do protocolo',async()=>{
 const d=db([{match:/BEGIN/},{match:/FOR UPDATE/,rows:[{status:'Aceita',support_open:false}]},{match:/INSERT INTO maridao.service_support/,rows:[{id:'protocolo'}]},{match:/INSERT INTO maridao.request_events/,fail:true},{match:/ROLLBACK/}]);
 await assert.rejects(()=>openSupport(d.client,customer,id,{reason:'nao_realizado',description:'Relato'}));assert.ok(!d.calls.some(c=>c.text==='COMMIT'));d.done();
});
