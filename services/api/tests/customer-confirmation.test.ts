import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
import {CompletionError,codeDigest,checkCompletionCode,issueCompletionCode,validateCustomerAction,validateSupportInput,supportQuery} from '../src/customer-confirmation.ts';
import {updateProgress,ProgressError} from '../src/request-progress.ts';
const id='11111111-1111-4111-8111-111111111111';
const customer={id:'cliente',role:'customer'} as Profile,provider={id:'prestador',role:'provider'} as Profile;
const code='123456',salt='salt-test';
const current={status:'Em andamento',completion_code_hash:codeDigest(id,salt,code),completion_code_salt:salt,completion_code_attempts:0,code_expired:false,support_open:false};
type Step={match:RegExp;rows?:unknown[];rowCount?:number;fail?:boolean};
function db(steps:Step[]){const calls:{text:string;values?:unknown[]}[]=[];const query=async(text:string,values?:unknown[])=>{calls.push({text,values});const step=steps.shift();assert.ok(step,text);assert.match(text,step.match);if(step.fail)throw Error('Falha simulada');return {rows:step.rows??[],rowCount:step.rowCount??0};};return {client:{query} as unknown as Pick<PoolClient,'query'>,calls,done:()=>assert.equal(steps.length,0)};}
test('cliente do pedido é o único que pode gerar código ou abrir relato; não aceita identidade externa',()=>{
 assert.throws(()=>validateCustomerAction(provider,id),CompletionError);assert.throws(()=>validateCustomerAction(customer,'invalid'),CompletionError);
 for(const input of [{},{reason:'denuncia',description:'texto'},{reason:'nao_realizado',description:''},{reason:'discordancia',description:'texto',customerId:'outro'}])assert.throws(()=>validateSupportInput(input),CompletionError);
 assert.deepEqual(validateSupportInput({reason:'discordancia',description:' relato '}),{reason:'discordancia',description:'relato'});
 const q=supportQuery(customer,id);assert.deepEqual(q.values,[id,customer.id]);assert.match(q.text,/r.customer_id=\$2 AND s.customer_id=\$2/);assert.throws(()=>supportQuery(provider,id),CompletionError);
});
test('código é vinculado ao pedido e não pode ser obtido por outro cliente ou em etapa indevida',async()=>{
 for(const rows of [[],[{status:'Aceita'}],[{status:'Em andamento',support_open:true}]]){const d=db([{match:/BEGIN/},{match:/r.customer_id=\$2 FOR UPDATE/,rows},{match:/ROLLBACK/}]);await assert.rejects(()=>issueCompletionCode(d.client,customer,id,{}),CompletionError);d.done();}
});
test('código novo tem seis dígitos, expira e armazena apenas resumo com salt',async()=>{
 const d=db([{match:/BEGIN/},{match:/FOR UPDATE/,rows:[{status:'Em andamento',support_open:false}]},{match:/completion_code_expires_at=clock_timestamp\(\)\+interval '10 minutes'/,rows:[{completion_code_expires_at:'2099-01-01T00:00:00Z'}]},{match:/INSERT INTO maridao.request_events/},{match:/COMMIT/}]);
 const result=await issueCompletionCode(d.client,customer,id,{});assert.match(result.code,/^\d{6}$/);
 const saved=d.calls.find(c=>c.text.startsWith('UPDATE'))!;assert.notEqual(saved.values?.[1],result.code);assert.equal(saved.values?.[1],codeDigest(id,saved.values?.[2] as string,result.code));assert.ok(!d.calls.some(c=>c.values?.some(v=>v===result.code)));d.done();
});
test('conclusão unilateral sem código é rejeitada antes de iniciar transação',async()=>{
 const d=db([]);await assert.rejects(()=>updateProgress(d.client,provider,id,{status:'Concluída'}),ProgressError);assert.equal(d.calls.length,0);
});
test('código errado persiste tentativa e não altera status nem registra conclusão',async()=>{
 const d=db([{match:/BEGIN/},{match:/FOR UPDATE/,rows:[current]},{match:/completion_code_attempts=completion_code_attempts\+1/},{match:/COMMIT/}]);
 await assert.rejects(()=>updateProgress(d.client,provider,id,{status:'Concluída',code:'999999'}),CompletionError);
 assert.ok(!d.calls.some(c=>c.text.includes('status=$2')));assert.ok(!d.calls.some(c=>c.text==='ROLLBACK'));d.done();
});
test('código ausente, expirado, limite de tentativas e suporte aberto impedem conclusão',async()=>{
 for(const changed of [{completion_code_hash:null},{code_expired:true},{completion_code_attempts:5},{support_open:true}]){
  const d=db([]);await assert.rejects(()=>checkCompletionCode(d.client,{...current,...changed},id,code),CompletionError);assert.equal(d.calls.length,0);
 }
 assert.equal(await checkCompletionCode(db([]).client,current,id,code),null);
 assert.notEqual(codeDigest(id,salt,code),codeDigest('outro-pedido',salt,code));
});
test('falha no registro do evento reverte conclusão e uso do código',async()=>{
 const d=db([{match:/BEGIN/},{match:/FOR UPDATE/,rows:[current]},{match:/UPDATE maridao.service_requests SET status/,rows:[{id,status:'Concluída'}],rowCount:1},{match:/INSERT INTO maridao.request_events/,fail:true},{match:/ROLLBACK/}]);
 await assert.rejects(()=>updateProgress(d.client,provider,id,{status:'Concluída',code}));assert.ok(!d.calls.some(c=>c.text==='COMMIT'));d.done();
});
