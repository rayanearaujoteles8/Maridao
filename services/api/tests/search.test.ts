import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchQuery,customerAccess} from '../src/provider-search.ts';
import type {AuthStore} from '../src/auth.ts';
test('busca usa parâmetros, limita resultados e não seleciona dados privados',()=>{
 const query=searchQuery({category:"x' OR 1=1 --",neighborhood:'Centro',page:'2'});
 assert.equal(query.values[0],"x' OR 1=1 --");assert.equal(query.values[2],20);
 assert.ok(!query.text.includes("x' OR 1=1 --"));
 for(const secret of ['document_encrypted','document_fingerprint','password_hash','phone','email'])assert.ok(!query.text.includes(secret));
 assert.match(query.text,/LIMIT 21/);
 assert.throws(()=>searchQuery({category:[]}));assert.throws(()=>searchQuery({page:'0'}));assert.throws(()=>searchQuery({category:'a'.repeat(101)}));
});
test('busca exige sessão válida de cliente',async()=>{
 const store={findSession:async()=>undefined} as unknown as AuthStore;
 assert.equal(await customerAccess(undefined,store),401);
 assert.equal(await customerAccess('Bearer '+'a'.repeat(64),store),401);
 store.findSession=async()=>({id:'id',name:'Pessoa',email:'teste@example.com',city:'Palmas',state:'TO',neighborhood:'Centro',role:'provider'});
 assert.equal(await customerAccess('Bearer '+'a'.repeat(64),store),403);
 store.findSession=async()=>({id:'id',name:'Pessoa',email:'teste@example.com',city:'Palmas',state:'TO',neighborhood:'Centro',role:'customer'});
 assert.equal(await customerAccess('Bearer '+'a'.repeat(64),store),200);
});
