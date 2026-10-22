import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProposal,ProposalInputError,validRequestId} from '../src/proposal-validation.ts';
import {insertProposalQuery,proposalAccessQuery,listProposalsQuery,sendProposal} from '../src/proposals.ts';
import {acceptProposal,validateAcceptance,AcceptanceError} from '../src/proposal-acceptance.ts';
import type {Profile} from '../src/auth.ts';
import type {PoolClient} from 'pg';
const id='11111111-1111-4111-8111-111111111111';
const sample={amount:'150,25',description:'Pintura de uma parede',estimatedDuration:'Um dia',validUntil:'2099-12-31'};
const proposalId='22222222-2222-4222-8222-222222222222';
const customer={id:'cliente-da-sessao',role:'customer'} as Profile;
function scriptedDatabase(steps:{match:RegExp;rows?:unknown[];rowCount?:number;fail?:boolean;values?:unknown[]}[]){
 const commands:string[]=[];
 const query=async(text:string,values?:unknown[])=>{
  commands.push(text);
  const step=steps.shift();assert.ok(step,`Comando inesperado: ${text}`);assert.match(text,step.match);
  if(step.values)assert.deepEqual(values,step.values);
  if(step.fail)throw new Error('Falha simulada');
  return {rows:step.rows??[],rowCount:step.rowCount??0};
 };
 return {client:{query} as unknown as Pick<PoolClient,'query'>,commands,done:()=>assert.equal(steps.length,0)};
}

test('aceite exige cliente, identificadores válidos e formulário sem conta/status enviados',()=>{
 assert.throws(()=>validateAcceptance({...customer,role:'provider'},id,proposalId,{}),AcceptanceError);
 assert.throws(()=>validateAcceptance(customer,'outro',proposalId,{}),AcceptanceError);
 for(const input of [undefined,[],{customerId:'outro'},{status:'Aceita'}])assert.throws(()=>validateAcceptance(customer,id,proposalId,input),AcceptanceError);
 validateAcceptance(customer,id,proposalId,{});
});

test('aceite bloqueia pedido, confere validade e grava escolha e demais status juntos',async()=>{
 const db=scriptedDatabase([
  {match:/^BEGIN$/},
  {match:/customer_id=\$2 FOR UPDATE/,values:[id,customer.id],rows:[{status:'Aberta',selected_proposal_id:null}]},
  {match:/clock_timestamp\(\).*request_id=\$1 AND id=\$2 FOR UPDATE/,values:[id,proposalId],rows:[{status:'Pendente',expired:false}]},
  {match:/SET status='Não selecionada'.*status='Pendente'/,values:[id,proposalId],rowCount:2},
  {match:/SET status='Aceita'/,values:[id,proposalId],rowCount:1},
  {match:/selected_proposal_id=\$2.*customer_id=\$3/,values:[id,proposalId,customer.id],rowCount:1},
  {match:/^COMMIT$/},
 ]);
 assert.deepEqual(await acceptProposal(db.client,customer,id,proposalId),{status:'Aceita',proposalId});db.done();
});

test('pedido de outro cliente, proposta de outro pedido, expirada ou retirada não grava nada',async()=>{
 for(const state of ['other-customer','other-request','expired','withdrawn','already-selected']){
  const steps:{match:RegExp;rows?:unknown[]}[]=[{match:/^BEGIN$/},{match:/customer_id=\$2 FOR UPDATE/,rows:state==='other-customer'?[]:[{status:state==='already-selected'?'Aceita':'Aberta',selected_proposal_id:'outra'}]}];
  if(!['other-customer','already-selected'].includes(state))steps.push({match:/request_id=\$1 AND id=\$2 FOR UPDATE/,rows:state==='other-request'?[]:[{status:state==='withdrawn'?'Retirada':'Pendente',expired:state==='expired'}]});
  steps.push({match:/^ROLLBACK$/});
  const db=scriptedDatabase(steps);
  await assert.rejects(()=>acceptProposal(db.client,customer,id,proposalId),AcceptanceError);
  assert.ok(!db.commands.some(command=>command.startsWith('UPDATE')));db.done();
 }
});

test('repetir a confirmação da mesma proposta é seguro mesmo após o fim da validade',async()=>{
 const db=scriptedDatabase([{match:/BEGIN/},{match:/FOR UPDATE/,rows:[{status:'Aceita',selected_proposal_id:proposalId}]},{match:/COMMIT/}]);
 assert.equal((await acceptProposal(db.client,customer,id,proposalId)).proposalId,proposalId);db.done();
});

test('falha ao vincular pedido desfaz toda a transação',async()=>{
 const db=scriptedDatabase([{match:/BEGIN/},{match:/FOR UPDATE/,rows:[{status:'Aberta'}]},{match:/FOR UPDATE/,rows:[{status:'Pendente',expired:false}]},{match:/Não selecionada/},{match:/SET status='Aceita'/,rowCount:1},{match:/selected_proposal_id/,fail:true},{match:/ROLLBACK/}]);
 await assert.rejects(()=>acceptProposal(db.client,customer,id,proposalId));
 assert.ok(!db.commands.includes('COMMIT'));db.done();
});

test('envio bloqueia a mesma solicitação antes do INSERT e rejeita pedido já aceito',async()=>{
 const sent={id:proposalId,status:'Pendente'};
 const db=scriptedDatabase([{match:/BEGIN/},{match:/r.status='Aberta'.*FOR UPDATE OF r/s,rows:[{id}]},{match:/INSERT INTO maridao.proposals/,rows:[sent]},{match:/COMMIT/}]);
 assert.deepEqual(await sendProposal(db.client,'prestador',id,sample),sent);db.done();
 const closed=scriptedDatabase([{match:/BEGIN/},{match:/FOR UPDATE OF r/,rows:[]},{match:/ROLLBACK/}]);
 await assert.rejects(()=>sendProposal(closed.client,'prestador',id,sample),AcceptanceError);closed.done();
});
test('proposta mantém centavos exatos e valida valor, prazo e validade',()=>{
 assert.equal(validateProposal(sample).amount,'150.25');
 assert.equal(validateProposal({...sample,amount:'0,01'}).amount,'0.01');
 assert.equal(validateProposal({...sample,amount:'999999.99'}).amount,'999999.99');
 for(const amount of ['0','-1','1.000,00','1e3','NaN','1.234','1000000',150])assert.throws(()=>validateProposal({...sample,amount}),ProposalInputError);
 for(const validUntil of ['2026-02-30','2026-10-19','20/10/2026',''])assert.throws(()=>validateProposal({...sample,validUntil},'2026-10-20'),ProposalInputError);
 assert.equal(validateProposal({...sample,validUntil:'2026-10-20'},'2026-10-20').validUntil,'2026-10-20');
 for(const input of [{...sample,description:''},{...sample,estimatedDuration:''},{...sample,providerId:'outro'},{...sample,status:'Aceita'}])assert.throws(()=>validateProposal(input),ProposalInputError);
});
test('envio deriva prestador da sessão e verifica compatibilidade no mesmo INSERT',()=>{
 const query=insertProposalQuery('prestador-da-sessao',id,{...sample,description:"x'); DROP TABLE accounts;--"});
 assert.equal(query.values[0],'prestador-da-sessao');assert.equal(query.values[1],id);
 assert.ok(!query.text.includes('DROP TABLE'));
 assert.match(query.text,/r.status='Aberta'/);assert.match(query.text,/r.category=ANY\(p.categories\)/);
 assert.match(query.text,/area.value=ANY\(p.neighborhoods\)/);
 assert.ok(!query.text.includes("'Aceita'"));
 assert.equal(validRequestId('../accounts'),false);
 assert.throws(()=>insertProposalQuery('id','invalid',sample),ProposalInputError);
});
test('cliente vê apenas propostas dos seus pedidos e prestador apenas a própria',()=>{
 const customer={id:'cliente',role:'customer'} as Profile,provider={id:'prestador',role:'provider'} as Profile;
 const access=proposalAccessQuery(customer,id);
 assert.match(access.text,/r.customer_id=\$1/);assert.deepEqual(access.values,['cliente',id]);
 const own=proposalAccessQuery(provider,id);assert.match(own.text,/own.provider_id=\$1/);
 const received=listProposalsQuery(customer,id,'2'),sent=listProposalsQuery(provider,id);
 assert.match(received.text,/r.customer_id=\$2/);assert.deepEqual(received.values,[id,'cliente',20]);
 assert.match(sent.text,/o.provider_id=\$2/);
 for(const secret of ['document_encrypted','password_hash','phone','email'])assert.ok(!received.text.includes(secret));
 assert.throws(()=>listProposalsQuery(customer,id,'0'));
 assert.throws(()=>listProposalsQuery({...customer,role:undefined},id));
});
