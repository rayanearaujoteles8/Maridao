import { test } from 'node:test';
import assert from 'node:assert/strict';
import { services, neighborhoods, isNeighborhood, isCategory } from '../src/catalog.ts';
import { validateCustomer, InputError } from '../src/customer-validation.ts';
import { validateProvider, ProviderInputError } from '../src/provider-validation.ts';
test('catálogo contém localidades municipais únicas e categorias com especialidades', () => {
 assert.equal(neighborhoods.length,380);
 assert.equal(new Set(neighborhoods.map(item=>item.value)).size,380);
 assert.ok(neighborhoods.every(item=>item.value.length<=100&&!item.value.includes('CANCELAD')));
 assert.ok(isNeighborhood('JARDIM AURENY I'));
 assert.ok(isNeighborhood('TAQUARUSSU'));
 assert.equal(isNeighborhood('bairro inventado'),false);
 assert.ok(isCategory('Plotagem e comunicação visual'));
 assert.equal(services.length,26);
 assert.equal(services.flatMap(item=>item.specialties).length,156);
});
test('API rejeita localidade inventada e especialidade incompatível', () => {
 const customer={name:'Pessoa',email:'teste@example.com',phone:'63999999999',cpf:'52998224725',password:'teste123',neighborhood:'bairro inventado'};
 assert.throws(()=>validateCustomer(customer),InputError);
 const provider={name:'Pessoa',email:'teste@example.com',phone:'63999999999',password:'teste123',documentType:'CPF',document:'52998224725',categories:['Pintura'],specialties:['Troca de sifões'],neighborhoods:['JARDIM AURENY I'],availability:'Segunda a sexta'};
 assert.throws(()=>validateProvider(provider),ProviderInputError);
});
