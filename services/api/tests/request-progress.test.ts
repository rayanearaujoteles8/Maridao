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
test('somente prestador pode iniciar e não pode enviar identidade, datas, etapas arbitrárias nem concluir por esta rota',()=>{
 assert.throws(()=>validateProgress({...provider,role:'customer'},id,{status:'Em andamento'}),ProgressError);
 assert.throws(()=>validateProgress(provider,'outro',{status:'Em andamento'}),ProgressError);
 for(const input of [undefined,[],{},{status:'Aceita'},{status:'Aberta'},{status:'Aguardando confirmação'},{status:'Concluída'},{status:'Concluída',code:'3456'},{status:'Em andamento',providerId:'outro'},{status:'Em andamento',started_at:'ontem'}])assert.throws(()=>validateProgress(provider,id,input),(e:unknown)=>e instanceof ProgressError&&e.status===400);
 // A conclusão saiu desta rota (lote 3): o código de quatro dígitos não é mais aceito.
 assert.throws(()=>validateProgress(provider,id,{status:'Concluída',code:'3456'}),/cliente confirma ou contesta/);
 assert.equal(validateProgress(provider,id,{status:'Em andamento'}),'Em andamento');
 assert.match(progressPermissionSql('provider'),/chosen.id=r.selected_proposal_id.*chosen.provider_id=\$1/);
 assert.equal(progressPermissionSql('customer'),'false AS can_manage');
});
test('início bloqueia o pedido e confere o vínculo ao prestador da sessão',async()=>{
 const next={id,status:'Em andamento',started_at:'2026-10-22T12:00:00Z',completed_at:null};
 const db=database([{match:/^BEGIN$/},{match:/chosen.id=r.selected_proposal_id.*chosen.request_id=r.id[\s\S]*chosen.provider_id=\$2.*chosen.status='Aceita' FOR UPDATE OF r/,values:[id,provider.id],rows:[{status:'Aceita',support_open:false}]},{match:/^UPDATE.*status=\$2[\s\S]*started_at=clock_timestamp\(\)[\s\S]*status=\$3/,values:[id,'Em andamento','Aceita'],rows:[next],count:1},{match:/^COMMIT$/}]);
 assert.deepEqual(await updateProgress(db.client,provider,id,{status:'Em andamento'}),next);db.done();
 assert.ok(!db.commands.some(command=>/completion_code|completed_at=/.test(command)));
});
test('prestador não escolhido ou sem proposta aceita não altera atendimento',async()=>{
 const db=database([{match:/BEGIN/},{match:/FOR UPDATE OF r/,rows:[]},{match:/ROLLBACK/}]);
 await assert.rejects(()=>updateProgress(db.client,provider,id,{status:'Em andamento'}),error=>error instanceof ProgressError&&error.status===404);
 assert.ok(!db.commands.some(command=>command.startsWith('UPDATE')));db.done();
});
test('não permite iniciar pedido aberto, aguardando confirmação, concluído ou cancelado, nem com protocolo aberto',async()=>{
 for(const row of [{status:'Aberta'},{status:'Aguardando confirmação'},{status:'Concluída'},{status:'Cancelada'},{status:'Aceita',support_open:true}]){
  const db=database([{match:/BEGIN/},{match:/FOR UPDATE OF r/,rows:[row]},{match:/ROLLBACK/}]);
  await assert.rejects(()=>updateProgress(db.client,provider,id,{status:'Em andamento'}),error=>error instanceof ProgressError&&error.status===409);db.done();
 }
});
test('repetir o início não muda os horários registrados',async()=>{
 const current={status:'Em andamento',started_at:'2026-10-22T12:00:00Z',completed_at:null};
 const db=database([{match:/BEGIN/},{match:/FOR UPDATE OF r/,rows:[current]},{match:/COMMIT/}]);
 assert.deepEqual(await updateProgress(db.client,provider,id,{status:'Em andamento'}),{id,...current});db.done();
});
test('falha de gravação desfaz a atualização',async()=>{
 const db=database([{match:/BEGIN/},{match:/FOR UPDATE OF r/,rows:[{status:'Aceita'}]},{match:/UPDATE/,fail:true},{match:/ROLLBACK/}]);
 await assert.rejects(()=>updateProgress(db.client,provider,id,{status:'Em andamento'}));assert.ok(!db.commands.includes('COMMIT'));db.done();
});
