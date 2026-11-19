import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createDatabasePool} from '../src/database.ts';
import {hashPassword,verifyPassword} from '../src/password.ts';
import {acceptProposal} from '../src/proposal-acceptance.ts';
import {updateProgress} from '../src/request-progress.ts';
import {completionAction} from '../src/request-completion.ts';
import {completionConstraints,completionRoutine} from './temporary-schema.ts';
import {chatAccess,decryptMessage,reviewService,sendMessage} from '../src/team-workflows.ts';
import {changePassword,consumeChallenge,deactivateAccount,requestChallenge,updateProfile} from '../src/account-management.ts';
import {WorkflowError} from '../src/workflow-error.ts';
import {neighborhoods} from '../src/catalog.ts';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
test('PostgreSQL temporário: chat privado, avaliação, notificações, perfil, recuperação e encerramento',{skip:process.env.MARIDAO_DB_TEST!=='1'},async()=>{
 const pool=createDatabasePool(),raw=await pool.connect(),oldMail=process.env.MAIL_MODE,oldEnv=process.env.NODE_ENV;process.env.MAIL_MODE='local';process.env.NODE_ENV='test';
 try{
  await raw.query('BEGIN');
  for(const table of ['accounts','customer_profiles','provider_profiles','sessions','service_requests','proposals','admin_events'])await raw.query(`CREATE TEMP TABLE ${table}(LIKE maridao.${table} INCLUDING ALL) ON COMMIT DROP`);
  await raw.query('ALTER TABLE pg_temp.proposals ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS updated_at timestamptz, ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz');
  const migration10=readFileSync(new URL('../migrations/010_customer_confirmation.sql',import.meta.url),'utf8');
  for(const statement of migration10.split(';')){
   const sql=statement.trim();if(sql.startsWith('ALTER TABLE maridao.service_requests')||sql.startsWith('UPDATE maridao.service_requests SET status='))await raw.query(sql.replaceAll('maridao.','pg_temp.'));
   if(sql.startsWith('CREATE TABLE IF NOT EXISTS maridao.'))await raw.query(sql.replace('CREATE TABLE','CREATE TEMP TABLE').replaceAll('maridao.','pg_temp.'));
  }
  const migration11=readFileSync(new URL('../migrations/011_team_workflows.sql',import.meta.url),'utf8').replace(/^\\.*$/gm,'').replace(/^(BEGIN|COMMIT);$/gm,'').replace(/^(GRANT|REVOKE) .*;$/gm,'').replaceAll('maridao.','pg_temp.').replaceAll('CREATE TABLE IF NOT EXISTS','CREATE TEMP TABLE IF NOT EXISTS');
  await raw.query(migration11);
  // 014: regras do novo status e avisos próprios da conclusão.
  for(const sql of completionConstraints())await raw.query(sql);
  await raw.query(completionRoutine('notify_workflow'));
  const query=(sql:string,values?:unknown[])=>raw.query(sql.replaceAll('maridao.','pg_temp.'),values);
  const db={query:async(sql:string,values?:unknown[])=>{
   if(sql==='BEGIN')return raw.query('SAVEPOINT operation');if(sql==='COMMIT')return raw.query('RELEASE SAVEPOINT operation');if(sql==='ROLLBACK'){await raw.query('ROLLBACK TO SAVEPOINT operation');return raw.query('RELEASE SAVEPOINT operation');}return query(sql,values);
  }} as unknown as Pick<PoolClient,'query'>;
  const ids=[randomUUID(),randomUUID(),randomUUID()],secret='senha exclusiva de teste',hash=await hashPassword(secret);
  for(const id of ids)await query('INSERT INTO maridao.accounts(id,email,password_hash) VALUES($1,$2,$3)',[id,id+'@example.invalid',hash]);
  for(const [i,id] of ids.slice(0,2).entries())await query("INSERT INTO maridao.customer_profiles(account_id,full_name,phone,cpf,neighborhood) VALUES($1,'Cliente fictício','63999120345',$2,'Plano Diretor Sul')",[id,String(i+1).padStart(11,'0')]);
  await query("INSERT INTO maridao.provider_profiles(account_id,full_name,phone,document_type,document_encrypted,document_fingerprint,categories,specialties,neighborhoods,availability) VALUES($1,'Prestador fictício','63999999999','CPF','v1.fixture',$2,ARRAY['Pintura'],ARRAY['Pintura interna'],ARRAY['Plano Diretor Sul'],'A combinar')",[ids[2],'a'.repeat(64)]);
  const customer={id:ids[0],email:ids[0]+'@example.invalid',role:'customer'} as Profile,other={id:ids[1],email:ids[1]+'@example.invalid',role:'customer'} as Profile,provider={id:ids[2],email:ids[2]+'@example.invalid',role:'provider'} as Profile;
  const request=randomUUID(),proposal=randomUUID();
  await query("INSERT INTO maridao.service_requests(id,customer_id,category,description,neighborhood) VALUES($1,$2,'Pintura','Pedido de teste','Plano Diretor Sul')",[request,customer.id]);
  await query("INSERT INTO maridao.proposals(id,request_id,provider_id,amount,description,estimated_duration,valid_until) VALUES($1,$2,$3,100,'Proposta fictícia','Um dia','2099-12-31')",[proposal,request,provider.id]);
  await assert.rejects(()=>chatAccess(db,customer,request),WorkflowError);
  await assert.rejects(()=>reviewService(db,customer,request,{rating:5,comment:''}),WorkflowError);
  await acceptProposal(db,customer,request,proposal,{version:1});
  const clientId=randomUUID(),message=await sendMessage(db,customer,request,{clientId,message:'Mensagem privada de teste'});
  assert.equal((await sendMessage(db,customer,request,{clientId,message:'Mensagem privada de teste'})).id,message.id);
  await assert.rejects(()=>sendMessage(db,other,request,{clientId:randomUUID(),message:'Invasão'}),WorkflowError);
  const messages=(await query('SELECT ciphertext FROM maridao.chat_messages WHERE request_id=$1',[request])).rows;assert.equal(messages.length,1);assert.ok(!messages[0].ciphertext.includes('Mensagem privada'));assert.equal(decryptMessage(request,messages[0].ciphertext),'Mensagem privada de teste');
  const notifications=(await query('SELECT account_id,title FROM maridao.notifications ORDER BY id')).rows;assert.ok(notifications.some(n=>n.account_id===customer.id&&n.title==='Nova proposta recebida'));assert.equal(notifications.filter(n=>n.title==='Nova mensagem no atendimento'&&n.account_id===provider.id).length,1);assert.ok(!notifications.some(n=>n.account_id===other.id));
  await assert.rejects(()=>deactivateAccount(db,provider,{currentPassword:secret}),WorkflowError);
  await updateProgress(db,provider,request,{status:'Em andamento'});
  // Conclusão registrada pelo prestador: chat segue aberto, avaliação e encerramento de conta seguem bloqueados até a confirmação.
  await completionAction(db,provider,request,'report',{});
  await sendMessage(db,provider,request,{clientId:randomUUID(),message:'Aguardando a sua confirmação'});
  await assert.rejects(()=>reviewService(db,customer,request,{rating:5,comment:''}),WorkflowError);
  for(const [account,pass] of [[provider,secret],[customer,secret]] as const)await assert.rejects(()=>deactivateAccount(db,account,{currentPassword:pass}),(e:unknown)=>e instanceof WorkflowError&&e.status===409);
  await completionAction(db,customer,request,'confirm',{});
  const notices=(await query('SELECT account_id,title FROM maridao.notifications WHERE request_id=$1 ORDER BY id',[request])).rows;
  assert.ok(notices.some(n=>n.account_id===customer.id&&n.title==='Conclusão registrada pelo prestador: confirme ou conteste'));assert.ok(notices.some(n=>n.account_id===provider.id&&n.title==='Conclusão confirmada pelo cliente'));
  await assert.rejects(()=>sendMessage(db,customer,request,{clientId:randomUUID(),message:'Após conclusão'}),WorkflowError);assert.equal((await chatAccess(db,customer,request)).status,'Concluída');
  await assert.rejects(()=>reviewService(db,other,request,{rating:5,comment:'Invasão'}),WorkflowError);
  await reviewService(db,customer,request,{rating:4,comment:'Serviço realizado'});await assert.rejects(()=>reviewService(db,customer,request,{rating:1,comment:'Duplicada'}),WorkflowError);assert.equal((await query('SELECT avg(rating)::numeric(2,1) AS rating FROM maridao.service_reviews WHERE provider_id=$1',[provider.id])).rows[0].rating,'4.0');
  await assert.rejects(()=>updateProfile(db,other,{name:'Outro cliente',phone:'63999120000',neighborhood:neighborhoods[0].value,currentPassword:'errada'}),WorkflowError);
  await updateProfile(db,other,{name:'Outro cliente atualizado',phone:'63999120000',neighborhood:neighborhoods[0].value,currentPassword:secret});assert.equal((await query('SELECT full_name FROM maridao.customer_profiles WHERE account_id=$1',[other.id])).rows[0].full_name,'Outro cliente atualizado');
  const mails:{to:string;purpose:string;token:string}[]=[],deliver=async(m:{to:string;purpose:string;token:string})=>{mails.push(m);};
  const unknown=await requestChallenge(db,{email:'nao-existe@example.invalid'},'password_reset',undefined,deliver);assert.equal(mails.length,0);
  const known=await requestChallenge(db,{email:other.email},'password_reset',undefined,deliver);assert.deepEqual(known,unknown);assert.equal(mails.length,1);assert.ok(!JSON.stringify(known).includes(mails[0].token));
  await assert.rejects(()=>consumeChallenge(db,{email:other.email,token:'f'.repeat(64),newPassword:'senha nova fictícia'},'password_reset'),WorkflowError);assert.equal((await query('SELECT attempts FROM maridao.account_challenges WHERE account_id=$1',[other.id])).rows[0].attempts,1);
  await query('INSERT INTO maridao.sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval \'1 hour\')',['b'.repeat(64),other.id]);
  await consumeChallenge(db,{email:other.email,token:mails[0].token,newPassword:'senha nova fictícia'},'password_reset');await assert.rejects(()=>consumeChallenge(db,{email:other.email,token:mails[0].token,newPassword:'senha nova fictícia'},'password_reset'),WorkflowError);assert.equal((await query('SELECT count(*) FROM maridao.sessions WHERE account_id=$1',[other.id])).rows[0].count,'0');assert.ok(await verifyPassword('senha nova fictícia',(await query('SELECT password_hash FROM maridao.accounts WHERE id=$1',[other.id])).rows[0].password_hash));
  await requestChallenge(db,{},'verify_email',other,deliver);await consumeChallenge(db,{token:mails[1].token},'verify_email',other);assert.ok((await query('SELECT email_verified_at FROM maridao.accounts WHERE id=$1',[other.id])).rows[0].email_verified_at);
  await changePassword(db,other,{currentPassword:'senha nova fictícia',newPassword:'senha final fictícia'});
  await deactivateAccount(db,other,{currentPassword:'senha final fictícia'});assert.ok((await query('SELECT disabled_at FROM maridao.accounts WHERE id=$1',[other.id])).rows[0].disabled_at);
  const pendingRequest=randomUUID(),pendingProposal=randomUUID();
  await query("INSERT INTO maridao.service_requests(id,customer_id,category,description,neighborhood) VALUES($1,$2,'Pintura','Pedido pendente de teste','Plano Diretor Sul')",[pendingRequest,customer.id]);
  await query("INSERT INTO maridao.proposals(id,request_id,provider_id,amount,description,estimated_duration,valid_until) VALUES($1,$2,$3,100,'Proposta pendente','Um dia','2099-12-31')",[pendingProposal,pendingRequest,provider.id]);
  await deactivateAccount(db,provider,{currentPassword:secret});
  assert.equal((await query('SELECT status FROM maridao.proposals WHERE id=$1',[pendingProposal])).rows[0].status,'Retirada');
  assert.equal((await query('SELECT status FROM maridao.service_requests WHERE id=$1',[pendingRequest])).rows[0].status,'Aberta');
  assert.equal((await query("SELECT count(*) FROM maridao.request_events WHERE request_id=$1 AND action='proposal_withdrawn'",[pendingRequest])).rows[0].count,'1');
  await raw.query('SAVEPOINT disabled_guard');
  await assert.rejects(()=>query("INSERT INTO maridao.proposals(request_id,provider_id,amount,description,estimated_duration,valid_until) VALUES($1,$2,100,'Invasão','Um dia','2099-12-31')",[pendingRequest,provider.id]),(e:unknown)=>typeof e==='object'&&e!==null&&'constraint'in e&&e.constraint==='active_workflow_account');
  await raw.query('ROLLBACK TO SAVEPOINT disabled_guard');await raw.query('RELEASE SAVEPOINT disabled_guard');
 }finally{await raw.query('ROLLBACK');raw.release();await pool.end();if(oldMail===undefined)delete process.env.MAIL_MODE;else process.env.MAIL_MODE=oldMail;if(oldEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv;}
});
