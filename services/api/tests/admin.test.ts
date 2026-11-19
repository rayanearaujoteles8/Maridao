import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import type {PoolClient} from 'pg';
import {login,type AuthStore,type Profile} from '../src/auth.ts';
import {hashPassword} from '../src/password.ts';
import {accessDecision,sessionGuard} from '../src/session-guard.ts';
import {documentFingerprint,formatCpf,maskCpf,protectDocument,revealDocument} from '../src/document-security.ts';
import {validateProvider,ProviderInputError} from '../src/provider-validation.ts';
import {decideProvider,deactivateUser,deleteCustomer,reasonText,requireAdmin,userListQuery,userSummary,validateAdmin} from '../src/admin.ts';
import {replaceProvisionalPassword} from '../src/account-management.ts';
import {approvalBlock} from '../src/proposals.ts';
import {searchQuery} from '../src/provider-search.ts';
import {WorkflowError} from '../src/workflow-error.ts';
const id='11111111-1111-4111-8111-111111111111',admin={id:'admin-da-sessao',role:'admin'} as Profile;
const failure=(status:number,code?:string)=>(e:unknown)=>e instanceof WorkflowError&&e.status===status&&(code===undefined||e.details?.code===code);
// Banco roteirizado: cada consulta deve casar com o próximo passo, na ordem.
function scripted(steps:{match:RegExp;rows?:unknown[]}[]){
 const commands:{sql:string;values?:unknown[]}[]=[];let index=0;
 const client={query:async(sql:string,values?:unknown[])=>{const step=steps[index++];assert.ok(step,`consulta inesperada: ${sql}`);assert.match(sql,step.match);commands.push({sql,values});return {rows:step.rows??[],rowCount:step.rows?.length??0};}} as unknown as Pick<PoolClient,'query'>;
 return {client,commands,done:()=>assert.equal(index,steps.length)};
}
function withDocumentKeys(run:()=>void){
 const old=[process.env.DOCUMENT_ENCRYPTION_KEY,process.env.DOCUMENT_INDEX_KEY];process.env.DOCUMENT_ENCRYPTION_KEY='11'.repeat(32);process.env.DOCUMENT_INDEX_KEY='22'.repeat(32);
 try{run();}finally{for(const [i,name] of ['DOCUMENT_ENCRYPTION_KEY','DOCUMENT_INDEX_KEY'].entries()){if(old[i]===undefined)delete process.env[name];else process.env[name]=old[i];}}
}

test('CPF aparece mascarado nas listas e o documento completo só sai da leitura protegida',()=>{
 assert.equal(maskCpf('52998224725'),'***.982.247-**');assert.equal(formatCpf('52998224725'),'529.982.247-25');
 for(const value of [null,undefined,'','5299822472','abc'])assert.equal(maskCpf(value),null);
 withDocumentKeys(()=>{
  const document=protectDocument('CPF','52998224725');
  assert.deepEqual(revealDocument(document.encrypted),{type:'CPF',value:'52998224725'});
  assert.equal(documentFingerprint('CPF','52998224725'),document.fingerprint);
  const parts=document.encrypted.split('.');parts[2]=Buffer.alloc(16).toString('base64');assert.throws(()=>revealDocument(parts.join('.')));assert.throws(()=>revealDocument('texto'));
  const created=new Date(),provider=userSummary({id,email:'p@example.invalid',created_at:created,disabled_at:null,deleted_at:null,name:'Prestador',type:'provider',cpf:null,document_encrypted:document.encrypted,approval_status:'Em análise'});
  assert.deepEqual(provider,{id,type:'provider',name:'Prestador',email:'p@example.invalid',cpf:'***.982.247-**',accountStatus:'Ativa',approvalStatus:'Em análise',createdAt:created});
  assert.ok(!JSON.stringify(provider).includes('52998224725'));
  const removed=userSummary({id,email:null,created_at:created,disabled_at:created,deleted_at:created,name:'Usuário removido',type:'customer',cpf:null,document_encrypted:null,approval_status:null});
  assert.equal(removed.accountStatus,'Excluída');assert.equal(removed.cpf,null);assert.ok(!('approvalStatus' in removed));
  assert.equal(userSummary({id,email:'c@example.invalid',created_at:created,disabled_at:created,deleted_at:null,name:'Cliente',type:'customer',cpf:'52998224725',document_encrypted:null,approval_status:null}).accountStatus,'Inativa');
 });
});
test('autocadastro de prestador aceita somente CPF',()=>{
 const sample={name:'Prestador de teste',email:'teste@example.com',phone:'(63) 99999-9999',password:'teste123',documentType:'CPF',document:'529.982.247-25',categories:['Montagem e desmontagem de móveis'],specialties:['Montagem de guarda-roupas'],neighborhoods:['JARDIM AURENY I'],availability:'Segunda a sexta'};
 assert.equal(validateProvider(sample).documentType,'CPF');
 assert.throws(()=>validateProvider({...sample,documentType:'CNPJ',document:'11.222.333/0001-81'}),(e:unknown)=>e instanceof ProviderInputError&&e.fields.documentType==='O cadastro de prestador aceita somente CPF.');
 assert.throws(()=>validateProvider({...sample,document:'529.982.247-26'}),(e:unknown)=>e instanceof ProviderInputError&&'document' in e.fields);
});
test('senha provisória pendente libera só consulta da sessão, saída e troca',()=>{
 for(const role of ['customer','provider','admin'] as const){
  const user={role,mustChangePassword:true};
  for(const [method,path] of [['GET','/auth/me'],['POST','/auth/logout'],['POST','/auth/provisional-password'],['POST','/auth/provisional-password/'],['GET','/health'],['GET','/catalog']])assert.equal(accessDecision(user,method,path),null,`${method} ${path}`);
  for(const [method,path] of [['GET','/requests'],['POST','/requests'],['GET','/account'],['POST','/account/password'],['GET','/notifications'],['GET','/admin/users'],['POST','/admin/admins'],['POST','/auth/me'],['GET','/auth/provisional-password'],['GET','/providers'],['POST','/customers'],['GET','/AUTH/ME/extra']])
   assert.equal(accessDecision(user,method,path)?.code,'PASSWORD_CHANGE_REQUIRED',`${method} ${path}`);
 }
});
test('administrador fica restrito a /auth e /admin e nunca alcança chat, pedidos ou propostas',()=>{
 const user={role:'admin' as const,mustChangePassword:false};
 for(const [method,path] of [['GET','/auth/me'],['POST','/auth/logout'],['GET','/admin/users'],['POST','/admin/providers/'+id+'/approve'],['POST','/account/password'],['GET','/catalog']])assert.equal(accessDecision(user,method,path),null,`${method} ${path}`);
 for(const [method,path] of [['GET','/requests/'+id+'/messages'],['POST','/requests/'+id+'/messages'],['GET','/requests'],['GET','/requests/'+id+'/proposals'],['GET','/notifications'],['GET','/account'],['PATCH','/account'],['POST','/account/close'],['GET','/providers'],['GET','/providers/'+id+'/profile'],['POST','/customers'],['POST','/providers'],['GET','/administracao'],['GET','/authx']])
  assert.equal(accessDecision(user,method,path)?.code,'ADMIN_AREA_ONLY',`${method} ${path}`);
 for(const role of ['customer','provider'] as const)for(const path of ['/requests','/account','/notifications','/admin/users'])assert.equal(accessDecision({role,mustChangePassword:false},'GET',path),null);
 assert.equal(accessDecision(undefined,'GET','/requests'),null);
 assert.throws(()=>requireAdmin({role:'customer'}),failure(403,'ADMIN_ONLY'));assert.throws(()=>requireAdmin({role:'provider'}),failure(403));assert.throws(()=>requireAdmin({}),failure(403));assert.equal(requireAdmin(admin),admin);
});
test('trava central responde 403 antes das rotas e não interfere em requisições sem sessão',async()=>{
 const token='a'.repeat(64);let lookups=0,current:Partial<Profile>|undefined;
 const app=express();app.use(sessionGuard({findSession:async()=>{lookups++;return current as Profile|undefined;}}));app.use((_req,res)=>{res.json({reached:true});});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
  const call=async(path:string,auth?:string)=>{const r=await fetch(base+path,auth?{headers:{Authorization:auth}}:undefined);return {status:r.status,body:await r.json() as Record<string,unknown>};};
  assert.deepEqual(await call('/requests'),{status:200,body:{reached:true}});assert.deepEqual(await call('/requests','Bearer invalido'),{status:200,body:{reached:true}});assert.equal(lookups,0);
  assert.deepEqual(await call('/requests','Bearer '+token),{status:200,body:{reached:true}});assert.equal(lookups,1);
  current={role:'provider',mustChangePassword:true};
  assert.deepEqual(await call('/requests','Bearer '+token),{status:403,body:{error:'Troque a senha provisória para continuar.',code:'PASSWORD_CHANGE_REQUIRED'}});
  assert.equal((await call('/auth/me','Bearer '+token)).status,200);
  current={role:'admin',mustChangePassword:false};
  assert.deepEqual(await call('/requests/'+id+'/messages','Bearer '+token),{status:403,body:{error:'Esta área não está disponível para administradores.',code:'ADMIN_AREA_ONLY'}});
  assert.equal((await call('/admin/users','Bearer '+token)).status,200);
 }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
test('login devolve papel, troca obrigatória e situação do cadastro sem o hash',async()=>{
 const password='senha provisória de teste',hash=await hashPassword(password);
 const base={id:'conta',name:'Pessoa',neighborhood:'',city:'',state:'',password_hash:hash};
 const accounts:Record<string,object>={'admin@example.com':{...base,email:'admin@example.com',role:'admin',mustChangePassword:true},'prestador@example.com':{...base,email:'prestador@example.com',role:'provider',mustChangePassword:false,approvalStatus:'Rejeitado',approvalReason:'Documento ilegível'}};
 const store={findAccount:async(email:string)=>accounts[email],createSession:async()=>{},findSession:async()=>undefined,deleteSession:async()=>{}} as unknown as AuthStore;
 const first=await login({email:'admin@example.com',password},store);
 assert.equal(first.user.role,'admin');assert.equal(first.user.mustChangePassword,true);assert.ok(!('password_hash' in first.user));assert.ok(!('approvalStatus' in first.user));
 const second=await login({email:'prestador@example.com',password},store);
 assert.equal(second.user.approvalStatus,'Rejeitado');assert.equal(second.user.approvalReason,'Documento ilegível');assert.equal(second.user.mustChangePassword,false);
});
test('troca da provisória recusa a mesma senha, senha fraca e conta sem pendência, e mantém só a sessão atual',async()=>{
 const provisional='senha provisória de teste',hash=await hashPassword(provisional),user={id:'conta',role:'customer'} as Profile,session='b'.repeat(64);
 for(const input of [null,{},{newPassword:'curta'},{newPassword:'x'.repeat(129)},{newPassword:'senha nova de teste',currentPassword:provisional}]){
  const db=scripted([]);await assert.rejects(()=>replaceProvisionalPassword(db.client,user,session,input),failure(400));db.done();
 }
 const same=scripted([{match:/^BEGIN$/},{match:/must_change_password FROM maridao.accounts WHERE id=\$1 AND disabled_at IS NULL FOR UPDATE/,rows:[{password_hash:hash,must_change_password:true}]},{match:/^ROLLBACK$/}]);
 await assert.rejects(()=>replaceProvisionalPassword(same.client,user,session,{newPassword:provisional}),failure(400,'SAME_AS_PROVISIONAL'));same.done();
 const settled=scripted([{match:/^BEGIN$/},{match:/FOR UPDATE/,rows:[{password_hash:hash,must_change_password:false}]},{match:/^ROLLBACK$/}]);
 await assert.rejects(()=>replaceProvisionalPassword(settled.client,user,session,{newPassword:'senha nova de teste'}),failure(409));settled.done();
 const ok=scripted([{match:/^BEGIN$/},{match:/FOR UPDATE/,rows:[{password_hash:hash,must_change_password:true}]},{match:/SET password_hash=\$2,must_change_password=false/},{match:/DELETE FROM maridao.sessions WHERE account_id=\$1 AND token_hash<>\$2/},{match:/DELETE FROM maridao.account_challenges/},{match:/^COMMIT$/}]);
 await replaceProvisionalPassword(ok.client,user,session,{newPassword:'senha nova de teste'});ok.done();
 assert.deepEqual(ok.commands[3].values,['conta',session]);assert.match(String(ok.commands[2].values?.[1]),/^scrypt\$/);assert.ok(!JSON.stringify(ok.commands).includes('senha nova de teste'));
});
test('consulta administrativa usa parâmetros, busca CPF por igualdade e rejeita filtros desconhecidos',()=>{
 withDocumentKeys(()=>{
  const byName=userListQuery({q:"maria' OR 1=1 --",type:'provider',status:'em_analise',page:'3'});
  assert.deepEqual(byName.values,['provider','','Em análise',"maria' OR 1=1 --",'','',40]);assert.ok(!byName.text.includes('maria'));assert.match(byName.text,/LIMIT 21/);
  for(const secret of ['password_hash','phone'])assert.ok(!byName.text.includes(secret));
  assert.match(byName.text,/NOT EXISTS\(SELECT 1 FROM maridao.admin_profiles/);
  const byCpf=userListQuery({q:'529.982.247-25',status:'inativa'});
  assert.deepEqual(byCpf.values,['','Inativa','','','52998224725',documentFingerprint('CPF','52998224725'),0]);
  assert.equal(userListQuery({q:'529.982.247-26'}).values[4],'');assert.deepEqual(userListQuery({}).values,['','','','','','',0]);
  for(const query of [{type:'admin'},{status:'bloqueada'},{page:'0'},{q:['a']},{q:'a'.repeat(101)},{role:'admin'},{status:['ativa']}])assert.throws(()=>userListQuery(query),failure(400));
 });
 assert.match(searchQuery({}).text,/approval_status='Aprovado'/);
});
test('cadastro de administrador e motivos são validados antes de qualquer gravação',async()=>{
 assert.deepEqual(validateAdmin({name:' Admin Teste ',email:' ADMIN@Example.com ',password:'senha de teste'}),{name:'Admin Teste',email:'admin@example.com',password:'senha de teste'});
 for(const input of [null,{name:'A',email:'a@example.com',password:'senha de teste',role:'admin'},{name:'',email:'a@example.com',password:'senha de teste'},{name:'A',email:'incorreto',password:'senha de teste'},{name:'A',email:'a@example.com',password:'curta'},{name:'a'.repeat(151),email:'a@example.com',password:'senha de teste'}])assert.throws(()=>validateAdmin(input),failure(400));
 assert.throws(()=>validateAdmin({name:'',email:'',password:''}),(e:unknown)=>e instanceof WorkflowError&&Object.keys(e.details?.fields as object).join()==='name,email,password');
 assert.equal(reasonText('  Dados falsos  '),'Dados falsos');for(const value of [undefined,'','   ','x'.repeat(501),5])assert.throws(()=>reasonText(value),failure(400));
 const untouched=scripted([]);
 await assert.rejects(()=>decideProvider(untouched.client,admin,id,{},false),failure(400));
 await assert.rejects(()=>decideProvider(untouched.client,admin,id,{reason:'  '},false),failure(400));
 await assert.rejects(()=>decideProvider(untouched.client,admin,id,{reason:'sobrando'},true),failure(400));
 await assert.rejects(()=>decideProvider(untouched.client,admin,'../accounts',{},true),failure(400));
 await assert.rejects(()=>deactivateUser(untouched.client,admin,id,{}),failure(400));
 await assert.rejects(()=>deleteCustomer(untouched.client,admin,id,{reason:''}),failure(400));untouched.done();
});
test('decisão sobre cadastro que saiu de análise informa o status atual e exclusão recusa prestador',async()=>{
 for(const status of ['Aprovado','Rejeitado']){
  const db=scripted([{match:/^BEGIN$/},{match:/approval_status.*FOR UPDATE OF p/,rows:[{approval_status:status,disabled_at:null}]},{match:/^ROLLBACK$/}]);
  await assert.rejects(()=>decideProvider(db.client,admin,id,{},true),(e:unknown)=>failure(409,'NOT_PENDING')(e)&&(e as WorkflowError).details?.approvalStatus===status&&(e as WorkflowError).message.includes(status));db.done();
 }
 const missing=scripted([{match:/^BEGIN$/},{match:/FOR UPDATE OF p/,rows:[]},{match:/^ROLLBACK$/}]);await assert.rejects(()=>decideProvider(missing.client,admin,id,{reason:'Motivo'},false),failure(404));missing.done();
 const approved=scripted([{match:/^BEGIN$/},{match:/FOR UPDATE OF p/,rows:[{approval_status:'Em análise',disabled_at:null}]},{match:/UPDATE maridao.provider_profiles SET approval_status=\$2/},{match:/INSERT INTO maridao.admin_events/},{match:/^COMMIT$/}]);
 assert.deepEqual(await decideProvider(approved.client,admin,id,{},true),{id,approvalStatus:'Aprovado'});approved.done();
 assert.deepEqual(approved.commands[2].values,[id,'Aprovado',null,admin.id]);assert.deepEqual(approved.commands[3].values,[admin.id,id,'provider_approved','','administration']);
 const provider=scripted([{match:/^BEGIN$/},{match:/FOR UPDATE OF r/},{match:/FOR UPDATE OF a/,rows:[{id,role:'provider',disabled_at:null,deleted_at:null}]},{match:/^ROLLBACK$/}]);
 await assert.rejects(()=>deleteCustomer(provider.client,admin,id,{reason:'Pedido do titular'}),failure(409,'PROVIDER_CANNOT_BE_DELETED'));provider.done();
});
test('prestador em análise ou rejeitado recebe aviso claro ao tentar propor',()=>{
 assert.equal(approvalBlock({role:'provider',approvalStatus:'Aprovado'} as Profile),null);assert.equal(approvalBlock({role:'customer'} as Profile),null);
 const pending=approvalBlock({role:'provider',approvalStatus:'Em análise'} as Profile),rejected=approvalBlock({role:'provider',approvalStatus:'Rejeitado'} as Profile);
 assert.equal(pending?.code,'PROVIDER_NOT_APPROVED');assert.match(pending?.error??'',/em análise/);assert.match(rejected?.error??'',/rejeitado/);assert.equal(rejected?.approvalStatus,'Rejeitado');
 assert.equal(approvalBlock({role:'provider'} as Profile)?.code,'PROVIDER_NOT_APPROVED');
});
