import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProposal,ProposalInputError,validRequestId} from '../src/proposal-validation.ts';
import {insertProposalQuery,proposalAccessQuery,listProposalsQuery} from '../src/proposals.ts';
import type {Profile} from '../src/auth.ts';
const id='11111111-1111-4111-8111-111111111111';
const sample={amount:'150,25',description:'Pintura de uma parede',estimatedDuration:'Um dia',validUntil:'2099-12-31'};
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
