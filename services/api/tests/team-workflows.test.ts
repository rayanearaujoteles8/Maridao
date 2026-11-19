import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chatOpen,encryptMessage,decryptMessage,validateReview,cursor,reviewService,sendMessage} from '../src/team-workflows.ts';
import {WorkflowError} from '../src/workflow-error.ts';
import {mailEnabled,password} from '../src/account-management.ts';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
const id='11111111-1111-4111-8111-111111111111',provider={id:'provider',role:'provider'} as Profile,customer={id:'customer',role:'customer'} as Profile;
test('chat aceita mensagens enquanto o atendimento não foi concluído nem cancelado',()=>{
 for(const status of ['Aceita','Em andamento','Aguardando confirmação'])assert.equal(chatOpen(status),true);
 for(const status of ['Aberta','Concluída','Cancelada',''])assert.equal(chatOpen(status),false);
});
test('avaliação rejeita autoria injetada, notas fracionárias e comentários acima do limite',()=>{
 for(const v of [{rating:0,comment:''},{rating:6,comment:''},{rating:2.5,comment:''},{rating:5,comment:'x'.repeat(1001)},{rating:5,comment:'',providerId:id}])assert.throws(()=>validateReview(v),WorkflowError);
 assert.deepEqual(validateReview({rating:5,comment:' bom '}),{rating:5,comment:'bom'});
 for(const v of ['0','-1','1 OR 1=1',[],['2'],'9999999999999999999'])assert.throws(()=>cursor(v),WorkflowError);assert.equal(cursor('123'),'123');
});
test('mensagem é criptografada com IV aleatório, autenticada e vinculada ao pedido',()=>{
 const old=process.env.CHAT_ENCRYPTION_KEY;process.env.CHAT_ENCRYPTION_KEY='12'.repeat(32);
 try{const a=encryptMessage(id,'Mensagem privada'),b=encryptMessage(id,'Mensagem privada');assert.notEqual(a,b);assert.ok(!a.includes('Mensagem privada'));assert.equal(decryptMessage(id,a),'Mensagem privada');assert.throws(()=>decryptMessage('outro-pedido',a));const parts=a.split('.');parts[2]=Buffer.alloc(16).toString('base64');assert.throws(()=>decryptMessage(id,parts.join('.')));}finally{if(old===undefined)delete process.env.CHAT_ENCRYPTION_KEY;else process.env.CHAT_ENCRYPTION_KEY=old;}
});
test('prestador não avalia e conversa de terceiro não insere mensagem',async()=>{
 const commands:string[]=[];const db={query:async(sql:string)=>{commands.push(sql);return {rows:[],rowCount:0};}} as unknown as Pick<PoolClient,'query'>;
 await assert.rejects(()=>reviewService(db,provider,id,{rating:5,comment:''}),e=>e instanceof WorkflowError&&e.status===403);assert.equal(commands.length,0);
 await assert.rejects(()=>sendMessage(db,customer,id,{clientId:id,message:'Teste'}),e=>e instanceof WorkflowError&&e.status===404);assert.deepEqual(commands.map(s=>s.split(' ')[0]),['BEGIN','SELECT','ROLLBACK']);
});
test('modo de correio local não é habilitado em produção e senha preserva política vigente',()=>{
 const oldMode=process.env.MAIL_MODE,oldEnv=process.env.NODE_ENV;process.env.MAIL_MODE='local';process.env.NODE_ENV='production';assert.equal(mailEnabled(),false);process.env.NODE_ENV='development';assert.equal(mailEnabled(),true);for(const v of ['1234567',' '.repeat(10),'x'.repeat(129)])assert.throws(()=>password(v),WorkflowError);assert.equal(password('frase de teste'),'frase de teste');if(oldMode===undefined)delete process.env.MAIL_MODE;else process.env.MAIL_MODE=oldMode;if(oldEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv;
});
