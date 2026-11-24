import {test} from 'node:test';
import assert from 'node:assert/strict';
import {smtpSettings,mailMode,mailContent} from '../src/mail-delivery.ts';
import {requestChallenge} from '../src/account-management.ts';
import type {PoolClient} from 'pg';

const settings={MAIL_MODE:'smtp',SMTP_HOST:'smtp.gmail.com',SMTP_PORT:'465',SMTP_USER:'sender@example.com',SMTP_PASSWORD:'secret-for-test',MAIL_FROM:'sender@example.com'};
test('SMTP exige credenciais completas e TLS; teste local é recusado em produção',()=>{
 const config=smtpSettings(settings);assert.equal(config.secure,true);assert.equal(config.requireTLS,true);assert.equal(config.debug,false);
 assert.equal(smtpSettings({...settings,SMTP_PORT:'587'}).secure,false);
 for(const values of [{...settings,SMTP_PASSWORD:''},{...settings,SMTP_PORT:'25'},{...settings,MAIL_FROM:'sender@example.com\r\nBcc: another@example.com'},{...settings,SMTP_HOST:'smtp://example.com'}])assert.throws(()=>smtpSettings(values));
 assert.equal(mailMode({...settings,NODE_ENV:'production'}),'smtp');assert.equal(mailMode({MAIL_MODE:'local',NODE_ENV:'production'}),'unconfigured');assert.equal(mailMode({MAIL_MODE:'local'}),'local');
});
test('e-mail inclui código de uso único e instruções, sem senha ou links arbitrários',()=>{
 const token='ab'.repeat(32),mail=mailContent({to:'customer@example.com',purpose:'password_reset',token,expiresInMinutes:15});
 assert.ok(mail.text.includes(token));assert.match(mail.text,/15 minutos/);assert.match(mail.subject,/Recuperar/);assert.ok(!mail.text.includes(settings.SMTP_PASSWORD));
 assert.throws(()=>mailContent({to:'customer@example.com\r\nBcc: other@example.com',purpose:'password_reset',token,expiresInMinutes:15}));
});
test('recuperação SMTP envia apenas para conta ativa e não expõe token ou existência da conta',async()=>{
 const previous={...process.env};Object.assign(process.env,settings);
 try{
  const request=async(exists:boolean,fail=false)=>{
   const commands:{sql:string;values?:unknown[]}[]=[];let deliveries=0;
   const db={query:async(sql:string,values?:unknown[])=>{commands.push({sql,values});return {rows:sql.startsWith('SELECT')&&exists?[{id:'id',email:'customer@example.com'}]:[],rowCount:1};}} as unknown as Pick<PoolClient,'query'>;
   const result=await requestChallenge(db,{email:'customer@example.com'},'password_reset',undefined,async mail=>{deliveries++;assert.equal(mail.to,'customer@example.com');assert.match(mail.token,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(commands).includes(mail.token));if(fail)throw new Error('SMTP unavailable');});
   assert.ok(!JSON.stringify(result).includes('token'));return {result,deliveries};
  };
  const present=await request(true),absent=await request(false);
  assert.deepEqual(present.result,absent.result);assert.equal(present.deliveries,1);assert.equal(absent.deliveries,0);assert.equal(present.result.delivery,'smtp');
  assert.deepEqual((await request(true,true)).result,absent.result);
 }finally{for(const key of Object.keys(settings)){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
