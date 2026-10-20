import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterOptions } from '../src/lib/selection.ts';
test('busca opções por nome ou alias preservando o valor oficial',()=>{
 const options=[{value:'TAQUARUSSU',label:'TAQUARUSSU (Taquaruçu)',aliases:['Taquaruçu']},{value:'ARNE 51',label:'ARNE 51 (404 Norte)',aliases:['404 Norte']},{value:'Elétrica',label:'Elétrica'}];
 assert.equal(filterOptions(options,'taquarucu')[0].value,'TAQUARUSSU');
 assert.equal(filterOptions(options,'404 NORTE')[0].value,'ARNE 51');
 assert.equal(filterOptions(options,'eletrica')[0].value,'Elétrica');
 assert.equal(filterOptions(options,'inexistente').length,0);
 assert.equal(filterOptions(options,'').length,3);
});
