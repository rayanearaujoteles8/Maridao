import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeChat, POLL_MS } from '../src/lib/live-updates.ts';
const message=(id,mine=false)=>({id:String(id),mine,message:'Mensagem '+id,created_at:'2026-11-20T12:00:00.000Z'});
test('o chat consulta no mesmo ritmo dos avisos (10 s), dentro do prazo de 30 s do RNF01.1',()=>{assert.equal(POLL_MS,10000);assert.ok(POLL_MS*2<=30000);});
test('chat: sem mensagem nova devolve o mesmo objeto e a mesma lista',()=>{
 const old={messages:[message(1),message(2,true)],hasMore:false,canSend:true,counterpart:{removed:false}};
 assert.equal(mergeChat(old,{messages:[message(1),message(2,true)],hasMore:false,canSend:true,counterpart:{removed:false}}),old);
});
test('chat: mensagem nova entra no fim e as anteriores já carregadas continuam na tela',()=>{
 const old={messages:[message(1),message(2),message(3)],hasMore:false,canSend:true};
 const merged=mergeChat(old,{messages:[message(2),message(3),message(4)],hasMore:true,canSend:true});
 assert.deepEqual(merged.messages.map(m=>m.id),['1','2','3','4']);assert.equal(merged.hasMore,false);
 assert.equal(merged.messages[0],old.messages[0]);
});
test('chat: conversa encerrada some com o campo de envio sem mexer nas mensagens',()=>{
 const old={messages:[message(1)],hasMore:false,canSend:true,counterpart:{removed:false}};
 const closed=mergeChat(old,{messages:[message(1)],hasMore:false,canSend:false,counterpart:{removed:false}});
 assert.equal(closed.canSend,false);assert.equal(closed.messages,old.messages);
 assert.equal(mergeChat(old,{messages:[message(1)],hasMore:false,canSend:true,counterpart:{removed:true}}).counterpart.removed,true);
});
