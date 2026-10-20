import { test } from 'node:test';
import assert from 'node:assert/strict';
import { services, neighborhoods, isNeighborhood, isCategory } from '../src/catalog.ts';
import { validateCustomer, InputError } from '../src/customer-validation.ts';
import { validateProvider, ProviderInputError } from '../src/provider-validation.ts';
import { coverageOptions, matchingCoverage } from '../src/coverage.ts';
import { searchQuery } from '../src/provider-search.ts';

test('cobertura regional associa localidades e não amplia filtros desconhecidos', () => {
 assert.deepEqual(matchingCoverage('ARNE 63'),['CIDADE:PALMAS','REGIAO:CENTRO']);
 assert.deepEqual(matchingCoverage('TAQ. 1A ETAPA FL.01'),['CIDADE:PALMAS','REGIAO:TAQUARALTO']);
 assert.deepEqual(matchingCoverage('JARDIM AURENY III'),['CIDADE:PALMAS','REGIAO:AURENYS']);
 assert.deepEqual(matchingCoverage('TAQUARUSSU'),['CIDADE:PALMAS']);
 assert.deepEqual(matchingCoverage("x' OR 1=1 --"),[]);
 for(const region of coverageOptions) {
  assert.ok(region.neighborhoods.length>0);
  assert.ok(region.neighborhoods.every(isNeighborhood));
 }
 const query=searchQuery({neighborhood:'ARNE 63'});
 assert.deepEqual(query.values[3],['CIDADE:PALMAS','REGIAO:CENTRO']);
 assert.match(query.text,/neighborhoods && \$4::text\[\]/);
});

test('prestador pode escolher regiões mas cliente precisa de uma localidade', () => {
 const provider={name:'Pessoa',email:'teste@example.com',phone:'63999999999',password:'teste123',documentType:'CPF',document:'52998224725',categories:['Pintura'],specialties:services.find(item=>item.value==='Pintura')!.specialties.slice(0,1),neighborhoods:['REGIAO:CENTRO','REGIAO:TAQUARALTO'],availability:'Segunda a sexta'};
 assert.deepEqual(validateProvider(provider).neighborhoods,provider.neighborhoods);
 assert.deepEqual(validateProvider({...provider,neighborhoods:['CIDADE:PALMAS']}).neighborhoods,['CIDADE:PALMAS']);
 assert.throws(()=>validateProvider({...provider,neighborhoods:['CIDADE:PALMAS','ARNE 63']}),ProviderInputError);
 assert.throws(()=>validateProvider({...provider,neighborhoods:['REGIAO:INVENTADA']}),ProviderInputError);
 assert.throws(()=>validateCustomer({name:'Pessoa',email:'teste@example.com',phone:'63999999999',cpf:'52998224725',password:'teste123',neighborhood:'CIDADE:PALMAS'}),InputError);
});
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
