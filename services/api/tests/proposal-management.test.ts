import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
import {changeProposal,validateProposalChange} from '../src/proposal-management.ts';
import {AcceptanceError,acceptProposal} from '../src/proposal-acceptance.ts';
import {historyQuery} from '../src/history.ts';
import {WorkflowError} from '../src/workflow-error.ts';
const r='11111111-1111-4111-8111-111111111111',p='22222222-2222-4222-8222-222222222222';
const provider={id:'provider-session',role:'provider'} as Profile,customer={id:'customer-session',role:'customer'} as Profile;
const input={version:1,amount:'250,50',description:'Serviço revisado',estimatedDuration:'Dois dias',validUntil:'2099-12-31'};
type Step={match:RegExp;rows?:unknown[];rowCount?:number;values?:unknown[];fail?:boolean};
function db(steps:Step[]){const commands:string[]=[];const query=async(text:string,values?:unknown[])=>{commands.push(text);const step=steps.shift();assert.ok(step,`SQL inesperado: ${text}`);assert.match(text,step.match);if(step.values)assert.deepEqual(values,step.values);if(step.fail)throw Error('Falha simulada');return {rows:step.rows??[],rowCount:step.rowCount??0};};return {client:{query} as unknown as Pick<PoolClient,'query'>,commands,done:()=>assert.equal(steps.length,0)};}
const request=(status='Aberta'):Step=>({match:/EXISTS[\s\S]*o.provider_id=\$3[\s\S]*FOR UPDATE OF r/,values:[r,p,provider.id],rows:[{status}]});
const proposal=(status='Pendente',version=1,expired=false):Step=>({match:/provider_id=\$3 FOR UPDATE/,values:[r,p,provider.id],rows:[{status,version,expired}]});
const snapshot=(version=1,rows:unknown[]=[{version,status:'Substituída',replaced_at:new Date(0)}]):Step=>({match:/INSERT INTO maridao.proposal_versions[\s\S]*o.status IN \('Pendente','Expirada'\) AND o.version=\$4/,values:[r,p,provider.id,version],rows});
const refusal=(code:string,status?:string)=>(e:unknown)=>e instanceof WorkflowError&&e.status===409&&e.details?.code===code&&(status===undefined||e.details?.status===status);
test('reenvio e retirada validam perfil, IDs, versão, campos e não aceitam autoria externa',()=>{
 assert.throws(()=>validateProposalChange(customer,r,p,input),AcceptanceError);
 assert.throws(()=>validateProposalChange(provider,'bad',p,input),AcceptanceError);
 for(const body of [null,[],{...input,version:0},{...input,providerId:'outro'},{...input,amount:'0'},{...input,description:''},{...input,validUntil:'2020-01-01'}])assert.throws(()=>validateProposalChange(provider,r,p,body));
 assert.throws(()=>validateProposalChange(provider,r,p,{version:1,status:'Retirada'},true),AcceptanceError);
});
test('reenvio serializa com aceite, guarda a versão anterior como "Substituída", usa centavos e incrementa versão',async()=>{
 const d=db([{match:/BEGIN/},request(),proposal(),snapshot(),{match:/SET amount=\$4[\s\S]*status='Pendente',version=version\+1/,values:[r,p,provider.id,'250.50',input.description,input.estimatedDuration,input.validUntil,1],rows:[{id:p,status:'Pendente',version:2}],rowCount:1},{match:/INSERT INTO maridao.request_events/,values:[r,provider.id,'provider','proposal_resent','Aberta','Aberta','Prestador reenviou a proposta: a versão 1 passou a "Substituída" e a versão 2 entrou como "Pendente".',null]},{match:/COMMIT/}]);
 const sent=await changeProposal(d.client,provider,r,p,input);assert.equal(sent.version,2);assert.equal(sent.status,'Pendente');assert.deepEqual(sent.previous,{version:1,status:'Substituída',replaced_at:new Date(0)});d.done();
 // A fotografia é gravada antes da alteração, na mesma transação.
 assert.ok(d.commands.findIndex(q=>q.startsWith('INSERT INTO maridao.proposal_versions'))<d.commands.findIndex(q=>q.startsWith('UPDATE maridao.proposals')));
});
test('reenvio de proposta "Expirada" (gravada ou só vencida) volta a "Pendente"',async()=>{
 for(const [status,expired] of [['Expirada',true],['Pendente',true]] as const){
  const d=db([{match:/BEGIN/},request(),proposal(status,3,expired),snapshot(3),{match:/status IN \('Pendente','Expirada'\) AND version=\$8/,rows:[{id:p,status:'Pendente',version:4}],rowCount:1},{match:/request_events/},{match:/COMMIT/}]);
  assert.equal((await changeProposal(d.client,provider,r,p,{...input,version:3})).status,'Pendente');d.done();
 }
});
test('retirada mantém histórico, não cria versão e repetição é idempotente',async()=>{
 const d=db([{match:/BEGIN/},request(),proposal(),{match:/SET status='Retirada',updated_at[\s\S]*withdrawn_at=clock_timestamp/,values:[r,p,provider.id,1],rows:[{id:p,status:'Retirada',version:1}],rowCount:1},{match:/INSERT INTO maridao.request_events/},{match:/COMMIT/}]);
 assert.equal((await changeProposal(d.client,provider,r,p,{version:1},true)).status,'Retirada');d.done();
 const again=db([{match:/BEGIN/},request(),proposal('Retirada',2),{match:/COMMIT/}]);await changeProposal(again.client,provider,r,p,{version:1},true);assert.ok(!again.commands.some(q=>q.startsWith('UPDATE')));again.done();
});
test('outra conta não consulta nem modifica proposta',async()=>{
 const d=db([{match:/BEGIN/},{...request(),rows:[]},{match:/ROLLBACK/}]);await assert.rejects(()=>changeProposal(d.client,provider,r,p,input),(e:unknown)=>e instanceof AcceptanceError&&e.status===404);d.done();
});
test('aceite e encerramento que vencem a disputa impedem reenvio e retirada, informando o status',async()=>{
 // Pedido que deixou de estar "Aberta": a proposta já é "Aceita"/"Não selecionada"/"Cancelada" (recusa pelo status dela) ou "Expirada" (recusa pelo status do pedido).
 for(const status of ['Aceita','Em andamento','Aguardando confirmação','Concluída','Cancelada'])for(const withdraw of [false,true]){
  const d=db([{match:/BEGIN/},request(status),proposal('Não selecionada'),{match:/ROLLBACK/}]);await assert.rejects(()=>changeProposal(d.client,provider,r,p,withdraw?{version:1}:input,withdraw),refusal(withdraw?'PROPOSAL_NOT_WITHDRAWABLE':'PROPOSAL_NOT_RESENDABLE','Não selecionada'));d.done();
  const e=db([{match:/BEGIN/},request(status),proposal('Expirada'),{match:/ROLLBACK/}]);await assert.rejects(()=>changeProposal(e.client,provider,r,p,withdraw?{version:1}:input,withdraw),refusal(withdraw?'PROPOSAL_NOT_WITHDRAWABLE':'REQUEST_NOT_OPEN',withdraw?'Expirada':status));e.done();
 }
});
test('proposta aceita, retirada, não selecionada, cancelada ou versão antiga não pode ser reenviada',async()=>{
 for(const status of ['Aceita','Retirada','Não selecionada','Cancelada','Substituída']){const d=db([{match:/BEGIN/},request(),proposal(status),{match:/ROLLBACK/}]);await assert.rejects(()=>changeProposal(d.client,provider,r,p,input),refusal('PROPOSAL_NOT_RESENDABLE',status));assert.ok(!d.commands.some(q=>/^(UPDATE|INSERT)/.test(q)));d.done();}
 const stale=db([{match:/BEGIN/},request(),proposal('Pendente',2),{match:/ROLLBACK/}]);await assert.rejects(()=>changeProposal(stale.client,provider,r,p,input),(e:unknown)=>e instanceof AcceptanceError&&e.status===409&&e.details?.code==='PROPOSAL_VERSION_CHANGED'&&e.details?.currentVersion===2);stale.done();
});
test('retirada só de proposta "Pendente" e válida: "Expirada" e demais status são recusadas com o status atual',async()=>{
 for(const [status,expired,shown] of [['Expirada',true,'Expirada'],['Pendente',true,'Expirada'],['Aceita',false,'Aceita'],['Não selecionada',false,'Não selecionada'],['Cancelada',false,'Cancelada'],['Substituída',false,'Substituída']] as const){
  const d=db([{match:/BEGIN/},request(),proposal(status,1,expired),{match:/ROLLBACK/}]);await assert.rejects(()=>changeProposal(d.client,provider,r,p,{version:1},true),refusal('PROPOSAL_NOT_WITHDRAWABLE',shown));assert.ok(!d.commands.some(q=>q.startsWith('UPDATE')));d.done();
 }
});
test('falha de gravação e data que expira provocam rollback, sem deixar versão guardada',async()=>{
 const lost=db([{match:/BEGIN/},request(),proposal(),snapshot(1,[]),{match:/ROLLBACK/}]);await assert.rejects(()=>changeProposal(lost.client,provider,r,p,input),AcceptanceError);lost.done();
 for(const fail of [false,true]){const d=db([{match:/BEGIN/},request(),proposal(),snapshot(),{match:/UPDATE/,fail,rowCount:0},{match:/ROLLBACK/}]);await assert.rejects(()=>changeProposal(d.client,provider,r,p,input));assert.ok(!d.commands.includes('COMMIT'));d.done();}
});
test('reenvio que vence a disputa impede aceite com valor antigo',async()=>{
 const d=db([{match:/BEGIN/},{match:/customer_id=\$2 FOR UPDATE/,rows:[{status:'Aberta',selected_proposal_id:null}]},{match:/FOR UPDATE/,rows:[{status:'Pendente',expired:false,version:2}]},{match:/ROLLBACK/}]);await assert.rejects(()=>acceptProposal(d.client,customer,r,p,{version:1}),(e:unknown)=>e instanceof AcceptanceError&&e.details?.code==='PROPOSAL_VERSION_CHANGED'&&e.details?.currentVersion===2);assert.ok(!d.commands.some(q=>q.startsWith('UPDATE')));d.done();
});
test('histórico pagina e inclui encerrados, sem oportunidades ou propostas concorrentes',()=>{
 const first=historyQuery(customer,{}),second=historyQuery(customer,{page:'2'}),third=historyQuery(provider,{page:'3'});
 assert.deepEqual(first.values,[customer.id,0]);assert.deepEqual(second.values,[customer.id,20]);assert.deepEqual(third.values,[provider.id,40]);assert.match(first.text,/WHERE r.customer_id=\$1/);assert.match(first.text,/o.id=r.selected_proposal_id/);assert.match(third.text,/ON o.request_id=r.id AND o.provider_id=\$1/);assert.match(third.text,/WHERE o.provider_id=\$1/);assert.match(third.text,/ORDER BY r.created_at DESC,r.id DESC LIMIT 21 OFFSET \$2/);assert.ok(!third.text.includes("r.status='Aberta'"));
 // UC09.3: o histórico informa a versão vigente e se há versões anteriores para consultar.
 for(const query of [first,third])for(const field of ['proposal_version','proposal_versions_count','proposal_has_previous_versions'])assert.match(query.text,new RegExp(`AS ${field}\\b`));
 for(const secret of ['email','phone','password_hash','document_encrypted'])assert.ok(!third.text.includes(secret));
 for(const query of [{page:'0'},{page:'10000'},{page:['1']},{customerId:'outro'},{role:'customer'}])assert.throws(()=>historyQuery(provider,query));assert.throws(()=>historyQuery({...provider,role:undefined},{}));
});
