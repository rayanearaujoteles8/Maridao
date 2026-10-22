import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRequest,RequestInputError,localToday} from '../src/request-validation.ts';
import {insertRequestQuery,requestCustomer} from '../src/requests.ts';
import type {AuthStore} from '../src/auth.ts';
import {listRequestsQuery,requestListUser} from '../src/request-listing.ts';
import type {Profile} from '../src/auth.ts';
const sample={category:'Montagem e desmontagem de móveis',description:'Montar uma estante',neighborhood:'JARDIM AURENY I'};

test('listagem limita cliente à própria conta e não aceita identidade ou perfil enviados na URL',()=>{
 const user={id:'conta-da-sessao',role:'customer'} as Profile;
 const query=listRequestsQuery(user,{page:'2'});
 assert.deepEqual(query.values,['conta-da-sessao',20]);
 assert.match(query.text,/WHERE r.customer_id=\$1/);
 assert.match(query.text,/LIMIT 21 OFFSET \$2/);
 for(const filter of [{customerId:'outra'},{role:'provider'},{page:['1']},{page:'0'},{page:'1 OR 1=1'}])assert.throws(()=>listRequestsQuery(user,filter));
 assert.throws(()=>listRequestsQuery({...user,role:undefined},{}));
 for(const field of ['customer_id,','password_hash','email','phone','document_encrypted'])assert.ok(!query.text.includes(field));
});

test('prestador vê pedidos abertos compatíveis ou pedidos com a própria proposta',()=>{
 const query=listRequestsQuery({id:'prestador-da-sessao',role:'provider'} as Profile,{});
 assert.equal(query.values[0],'prestador-da-sessao');
 assert.match(query.text,/p.account_id=\$1/);
 assert.match(query.text,/r.status='Aberta'/);
 assert.match(query.text,/r.category=ANY\(p.categories\)/);
 assert.match(query.text,/r.neighborhood=ANY\(p.neighborhoods\)/);
 assert.match(query.text,/area.value=ANY\(p.neighborhoods\)/);
 assert.match(query.text,/own.request_id=r.id AND own.provider_id=p.account_id/);
 const membership=JSON.parse(query.values[2] as string);
 assert.deepEqual(membership['ARNE 63'],['CIDADE:PALMAS','REGIAO:CENTRO']);
 assert.deepEqual(membership['JARDIM AURENY I'],['CIDADE:PALMAS','REGIAO:AURENYS']);
 assert.equal(membership['bairro inventado'],undefined);
});

test('listagem exige token válido e usa o perfil encontrado no servidor',async()=>{
 let calls=0;
 const user={id:'conta-da-sessao',role:'provider'} as Profile;
 const store={findSession:async(hash:string)=>{calls++;assert.equal(hash.length,64);return user;}} as unknown as AuthStore;
 assert.equal(await requestListUser(undefined,store),undefined);
 assert.equal(await requestListUser('Bearer invalido',store),undefined);
 assert.equal(calls,0);
 assert.equal(await requestListUser('Bearer '+'a'.repeat(64),store),user);
});
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
