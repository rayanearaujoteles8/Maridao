import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
import {ProgressError,validateProgress,updateProgress,progressPermissionSql} from '../src/request-progress.ts';
const id='11111111-1111-4111-8111-111111111111';
const provider={id:'prestador-escolhido',role:'provider'} as Profile;
function database(steps:{match:RegExp;rows?:unknown[];count?:number;values?:unknown[];fail?:boolean}[]){
 const commands:string[]=[];
 const client={query:async(text:string,values?:unknown[])=>{
  commands.push(text);const step=steps.shift();assert.ok(step);assert.match(text,step.match);
  if(step.values)assert.deepEqual(values,step.values);if(step.fail)throw new Error('Falha simulada');
  return {rows:step.rows??[],rowCount:step.count??0};
 }} as unknown as Pick<PoolClient,'query'>;
 return {client,commands,done:()=>assert.equal(steps.length,0)};
}
test('somente prestador pode pedir transições e não pode enviar identidade, datas ou etapas arbitrárias',()=>{
 assert.throws(()=>validateProgress({...provider,role:'customer'},id,{status:'Em andamento'}),ProgressError);
 assert.throws(()=>validateProgress(provider,'outro',{status:'Em andamento'}),ProgressError);
 for(const input of [undefined,[],{},{status:'Aceita'},{status:'Aberta'},{status:'Concluída',providerId:'outro'},{status:'Em andamento',started_at:'ontem'}])assert.throws(()=>validateProgress(provider,id,input),ProgressError);
 assert.equal(validateProgress(provider,id,{status:'Concluída'}),'Concluída');
 assert.match(progressPermissionSql('provider'),/chosen.id=r.selected_proposal_id.*chosen.provider_id=\$1/);
 assert.equal(progressPermissionSql('customer'),'false AS can_manage');
});
test('início e conclusão bloqueiam o pedido e conferem o vínculo ao prestador da sessão',async()=>{
 for(const [previous,target] of [['Aceita','Em andamento'],['Em andamento','Concluída']]){
  const next={id,status:target,started_at:'2026-10-22T12:00:00Z',completed_at:target==='Concluída'?'2026-10-22T13:00:00Z':null};
  const db=database([{match:/^BEGIN$/},{match:/chosen.id=r.selected_proposal_id.*chosen.request_id=r.id[\s\S]*chosen.provider_id=\$2.*chosen.status='Aceita' FOR UPDATE OF r/,values:[id,provider.id],rows:[{status:previous}]},{match:/^UPDATE.*status=\$2[\s\S]*clock_timestamp\(\)[\s\S]*status=\$3/,values:[id,target,previous],rows:[next],count:1},{match:/^COMMIT$/}]);
  assert.deepEqual(await updateProgress(db.client,provider,id,{status:target}),next);db.done();
 }
});
test('prestador não escolhido ou sem proposta aceita não altera atendimento',async()=>{
 const db=database([{match:/BEGIN/},{match:/FOR UPDATE OF r/,rows:[]},{match:/ROLLBACK/}]);
 await assert.rejects(()=>updateProgress(db.client,provider,id,{status:'Em andamento'}),error=>error instanceof ProgressError&&error.status===404);
 assert.ok(!db.commands.some(command=>command.startsWith('UPDATE')));db.done();
});
test('não permite concluir antes do início, reabrir concluído ou iniciar pedido aberto',async()=>{
 for(const [current,target] of [['Aceita','Concluída'],['Concluída','Em andamento'],['Aberta','Em andamento']]){
  const db=database([{match:/BEGIN/},{match:/FOR UPDATE OF r/,rows:[{status:current}]},{match:/ROLLBACK/}]);
  await assert.rejects(()=>updateProgress(db.client,provider,id,{status:target}),error=>error instanceof ProgressError&&error.status===409);db.done();
 }
});
test('repetir a mesma atualização não muda os horários registrados',async()=>{
 const current={status:'Concluída',started_at:'2026-10-22T12:00:00Z',completed_at:'2026-10-22T13:00:00Z'};
 const db=database([{match:/BEGIN/},{match:/FOR UPDATE OF r/,rows:[current]},{match:/COMMIT/}]);
 assert.deepEqual(await updateProgress(db.client,provider,id,{status:'Concluída'}),{id,...current});db.done();
});
test('falha de gravação desfaz a atualização',async()=>{
 const db=database([{match:/BEGIN/},{match:/FOR UPDATE OF r/,rows:[{status:'Aceita'}]},{match:/UPDATE/,fail:true},{match:/ROLLBACK/}]);
 await assert.rejects(()=>updateProgress(db.client,provider,id,{status:'Em andamento'}));assert.ok(!db.commands.includes('COMMIT'));db.done();
});
