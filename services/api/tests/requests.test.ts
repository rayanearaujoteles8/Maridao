import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRequest,RequestInputError,localToday} from '../src/request-validation.ts';
import {insertRequestQuery,requestCustomer} from '../src/requests.ts';
import type {AuthStore} from '../src/auth.ts';
const sample={category:'Montagem e desmontagem de móveis',description:'Montar uma estante',neighborhood:'JARDIM AURENY I'};
test('solicitação aceita preferência opcional e rejeita data passada ou inexistente',()=>{
 assert.equal(validateRequest(sample,'2026-10-20').preferredDate,null);
 assert.equal(validateRequest({...sample,preferredDate:'2026-10-20'},'2026-10-20').preferredDate,'2026-10-20');
 assert.equal(validateRequest({...sample,preferredPeriod:'Fim de semana'},'2026-10-20').preferredPeriod,'Fim de semana');
 for(const date of ['2026-10-19','2026-02-30','2026-13-01','20/10/2026'])assert.throws(()=>validateRequest({...sample,preferredDate:date},'2026-10-20'),RequestInputError);
 assert.equal(localToday(new Date('2026-10-21T01:00:00Z')),'2026-10-20');
});
test('cliente e status não podem ser escolhidos pelo formulário; consulta é parametrizada',()=>{
 for(const input of [{...sample,status:'Concluída'},{...sample,customerId:'outro'},{...sample,city:'Outra'}, {...sample,description:''},{...sample,category:'a'.repeat(101)}])assert.throws(()=>validateRequest(input),RequestInputError);
 const query=insertRequestQuery('cliente-autenticado',{...sample,description:"teste'); DROP TABLE accounts;--"});
 assert.equal(query.values[0],'cliente-autenticado');assert.ok(!query.text.includes('DROP TABLE'));assert.ok(!query.text.includes('INSERT INTO maridao.accounts'));
});
test('criação de solicitação exige sessão de cliente',async()=>{
 const store={findSession:async()=>undefined} as unknown as AuthStore;
 assert.equal((await requestCustomer(undefined,store)).status,401);
 assert.equal((await requestCustomer('Bearer '+'a'.repeat(64),store)).status,401);
 store.findSession=async()=>({id:'id',name:'Teste',email:'teste@example.com',city:'Palmas',state:'TO',neighborhood:'JARDIM AURENY I',role:'provider'});
 assert.equal((await requestCustomer('Bearer '+'a'.repeat(64),store)).status,403);
 store.findSession=async()=>({id:'id',name:'Teste',email:'teste@example.com',city:'Palmas',state:'TO',neighborhood:'JARDIM AURENY I',role:'customer'});
 assert.equal((await requestCustomer('Bearer '+'a'.repeat(64),store)).user?.id,'id');
});
