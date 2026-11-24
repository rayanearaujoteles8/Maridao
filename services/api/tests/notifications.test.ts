import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notificationQuery} from '../src/notification-query.ts';
import {WorkflowError} from '../src/workflow-error.ts';

test('avisos incrementais preservam ordem, paginação e a conta da sessão',()=>{
 const initial=notificationQuery('conta-da-sessao',{});
 assert.deepEqual(initial.values,['conta-da-sessao',null]);assert.equal(initial.limit,30);assert.match(initial.text,/account_id=\$1/);assert.match(initial.text,/ORDER BY id DESC LIMIT 31/);
 const next=notificationQuery('conta-da-sessao',{after:'123'});
 assert.deepEqual(next.values,['conta-da-sessao','123']);assert.equal(next.limit,100);assert.match(next.text,/id>\$2::bigint ORDER BY id ASC LIMIT 101/);
 assert.deepEqual(notificationQuery('conta-da-sessao',{after:'0'}).values,['conta-da-sessao','0']);
 assert.deepEqual(notificationQuery('conta-da-sessao',{before:'12'}).values,['conta-da-sessao','12']);
 for(const query of [{after:'1',before:'2'},{after:'1 OR 1=1'},{after:['1']},{after:'-1'},{after:'1',accountId:'outra-conta'},{before:'0'}])assert.throws(()=>notificationQuery('conta-da-sessao',query),WorkflowError);
});
