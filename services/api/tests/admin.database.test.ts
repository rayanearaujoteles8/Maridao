import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomInt,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
import {createDatabasePool} from '../src/database.ts';
import {verifyPassword} from '../src/password.ts';
import {protectDocument,formatCpf} from '../src/document-security.ts';
import {neighborhoods,services} from '../src/catalog.ts';
import {searchQuery} from '../src/provider-search.ts';
import {sendProposal} from '../src/proposals.ts';
import {acceptProposal,AcceptanceError} from '../src/proposal-acceptance.ts';
import {replaceProvisionalPassword} from '../src/account-management.ts';
import {createAdmin,createCustomer,createProvider,deactivateUser,decideProvider,deleteCustomer,editUser,listUsers,pendingProviderDetail,pendingProviders,userDetail,REMOVED_NAME} from '../src/admin.ts';
import {WorkflowError} from '../src/workflow-error.ts';

function fakeCpf(){
 for(;;){
  const digits=Array.from({length:9},()=>randomInt(10));
  for(const length of [9,10]){const check=(digits.reduce((sum,digit,i)=>sum+digit*(length+1-i),0)*10)%11;digits.push(check===10?0:check);}
  if(new Set(digits).size>1)return digits.join('');
 }
}
const failure=(status:number,code?:string)=>(e:unknown)=>e instanceof WorkflowError&&e.status===status&&(code===undefined||e.details?.code===code);
// Roda nas tabelas reais com o usuário maridao_api (confere também os GRANTs e o gatilho da migração 012).
// Tudo acontece dentro de uma única transação que é desfeita ao final: nenhum dado fictício permanece.
test('PostgreSQL: área administrativa, aprovação de prestadores, exclusão de cliente e senha provisória',{skip:process.env.MARIDAO_DB_TEST!=='1'},async()=>{
 const pool=createDatabasePool(),raw=await pool.connect();
 const db={query:async(sql:string,values?:unknown[])=>{
  if(sql==='BEGIN')return raw.query('SAVEPOINT operation');if(sql==='COMMIT')return raw.query('RELEASE SAVEPOINT operation');
  if(sql==='ROLLBACK'){await raw.query('ROLLBACK TO SAVEPOINT operation');return raw.query('RELEASE SAVEPOINT operation');}return raw.query(sql,values);
 }} as unknown as Pick<PoolClient,'query'>;
 const one=async(sql:string,values?:unknown[])=>(await raw.query(sql,values)).rows[0];
 try{
  await raw.query('BEGIN');
  const tag=randomUUID().slice(0,8),mail=(name:string)=>`${name}-${tag}@example.invalid`,provisional='senha provisória fictícia',area=neighborhoods[0].value;
  // UC14.4 e primeiro administrador (admin_id nulo só neste caso).
  const first=await createAdmin(db,null,{name:'Admin fictício',email:mail('admin'),password:provisional}),admin={id:first.id,role:'admin'} as Profile;
  const second=await createAdmin(db,admin,{name:'Outra admin fictícia',email:mail('admin2'),password:provisional});
  await assert.rejects(()=>createAdmin(db,admin,{name:'Repetido',email:mail('admin'),password:provisional}),(e:unknown)=>failure(409)(e)&&'email' in ((e as WorkflowError).details?.fields as object));
  assert.equal((await one('SELECT must_change_password FROM maridao.accounts WHERE id=$1',[second.id])).must_change_password,true);
  assert.deepEqual((await raw.query('SELECT admin_id,action FROM maridao.admin_events WHERE target_account_id=ANY($1::uuid[]) ORDER BY id',[[first.id,second.id]])).rows,[{admin_id:null,action:'admin_created'},{admin_id:first.id,action:'admin_created'}]);
  // UC01.1 fluxo 2 + UC10.4 fluxo 2: cliente criado pelo administrador troca a senha provisória.
  const cpf=fakeCpf(),form={name:'Cliente fictício',email:mail('cliente'),phone:'(63) 99912-0345',cpf,neighborhood:area,password:provisional};
  const created=await createCustomer(db,admin,form),customer={id:created.id,role:'customer'} as Profile;
  await assert.rejects(()=>createCustomer(db,admin,{...form,email:mail('outro')}),(e:unknown)=>failure(409)(e)&&'cpf' in ((e as WorkflowError).details?.fields as object));
  const [current,other]=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')];
  for(const hash of [current,other])await raw.query("INSERT INTO maridao.sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[hash,customer.id]);
  await assert.rejects(()=>replaceProvisionalPassword(db,customer,current,{newPassword:provisional}),failure(400,'SAME_AS_PROVISIONAL'));
  await assert.rejects(()=>replaceProvisionalPassword(db,customer,current,{newPassword:'curta'}),failure(400));
  await replaceProvisionalPassword(db,customer,current,{newPassword:'senha definitiva fictícia'});
  const account=await one('SELECT password_hash,must_change_password FROM maridao.accounts WHERE id=$1',[customer.id]);
  assert.equal(account.must_change_password,false);assert.ok(await verifyPassword('senha definitiva fictícia',account.password_hash));assert.ok(!await verifyPassword(provisional,account.password_hash));
  assert.deepEqual((await raw.query('SELECT token_hash FROM maridao.sessions WHERE account_id=$1',[customer.id])).rows,[{token_hash:current}]);
  await assert.rejects(()=>replaceProvisionalPassword(db,customer,current,{newPassword:'outra senha fictícia'}),failure(409));
  // Autocadastro: sem informar approval_status o prestador nasce 'Em análise'.
  const providers:{id:string;cpf:string;name:string}[]=[];
  for(const name of ['Prestador fictício A','Prestador fictício B']){
   const id=randomUUID(),providerCpf=fakeCpf(),document=protectDocument('CPF',providerCpf);providers.push({id,cpf:providerCpf,name:`${name} ${tag}`});
   await raw.query('INSERT INTO maridao.accounts(id,email,password_hash) VALUES($1,$2,$3)',[id,`${id}@example.invalid`,'ficticio-sem-login-'.repeat(3)]);
   await raw.query("INSERT INTO maridao.provider_profiles(account_id,full_name,phone,document_type,document_encrypted,document_fingerprint,categories,specialties,neighborhoods,availability) VALUES($1,$2,'63999999999','CPF',$3,$4,ARRAY['Pintura'],ARRAY['Pintura interna'],ARRAY[$5::text],'A combinar')",[id,`${name} ${tag}`,document.encrypted,document.fingerprint,area]);
  }
  const [a,b]=providers;
  assert.equal((await one('SELECT approval_status FROM maridao.provider_profiles WHERE account_id=$1',[a.id])).approval_status,'Em análise');
  const search=searchQuery({}),inSearch=async(id:string)=>(await raw.query(search.text.replace('LIMIT 21','LIMIT 100000'),search.values)).rows.some(row=>row.id===id);
  assert.equal(await inSearch(a.id),false);
  const pending=async()=>{const ids:string[]=[];for(let page=1;;page++){const result=await pendingProviders(db,{page:String(page)});ids.push(...result.providers.map(p=>p.id));assert.ok(result.providers.every(p=>p.cpf===null||/^\*{3}\.\d{3}\.\d{3}-\*{2}$/.test(p.cpf)));if(!result.hasMore)return ids;}};
  assert.ok((await pending()).includes(a.id));
  // UC14.3: CPF completo só no detalhe do cadastro em análise; mascarado na consulta.
  assert.equal((await pendingProviderDetail(db,a.id)).provider.cpf,formatCpf(a.cpf));
  const found=await listUsers(db,{q:formatCpf(a.cpf)});assert.deepEqual(found.users.map(u=>[u.id,u.cpf,u.accountStatus,u.approvalStatus]),[[a.id,`***.${a.cpf.slice(3,6)}.${a.cpf.slice(6,9)}-**`,'Ativa','Em análise']]);
  assert.ok(!JSON.stringify([found,await userDetail(db,a.id)]).includes(a.cpf));
  assert.deepEqual((await listUsers(db,{q:tag,status:'em_analise',type:'provider'})).users.map(u=>u.id).sort(),[a.id,b.id].sort());
  assert.deepEqual((await listUsers(db,{q:mail('cliente').toUpperCase(),type:'customer',status:'ativa'})).users.map(u=>u.id),[customer.id]);
  assert.equal((await listUsers(db,{q:mail('admin')})).users.length,0);
  // Prestador em análise não envia proposta.
  const request=randomUUID(),proposalForm={amount:'150,25',description:'Proposta fictícia',estimatedDuration:'Um dia',validUntil:'2099-12-31'};
  await raw.query("INSERT INTO maridao.service_requests(id,customer_id,category,description,neighborhood) VALUES($1,$2,'Pintura','Pedido fictício',$3)",[request,customer.id,area]);
  await assert.rejects(()=>sendProposal(db,a.id,request,proposalForm),AcceptanceError);
  // Aprovação: status, registro (RNF02.3) e notificação sem pedido.
  await assert.rejects(()=>decideProvider(db,customer,a.id,{reason:''},false),failure(400));
  assert.deepEqual(await decideProvider(db,admin,a.id,{reason:'Dados conferidos'},true),{id:a.id,approvalStatus:'Aprovado',approvalReason:'Dados conferidos'});
  const decided=await one('SELECT approval_status,approval_reason,approval_decided_by,approval_decided_at FROM maridao.provider_profiles WHERE account_id=$1',[a.id]);
  assert.equal(decided.approval_status,'Aprovado');assert.equal(decided.approval_reason,'Dados conferidos');assert.equal(decided.approval_decided_by,admin.id);assert.ok(decided.approval_decided_at);
  assert.deepEqual((await raw.query('SELECT admin_id,action,reason,created_at IS NOT NULL AS dated FROM maridao.admin_events WHERE target_account_id=$1',[a.id])).rows,[{admin_id:admin.id,action:'provider_approved',reason:'Dados conferidos',dated:true}]);
  // Mesma consulta de GET /notifications.
  const notifications=async(id:string)=>{
   // A 017 entrega fora da operação principal. Nesta transação de teste, processa
   // a fila antes da leitura; o ROLLBACK final desfaz também essas entregas.
   if((await raw.query("SELECT to_regprocedure('maridao.deliver_notifications(integer)') IS NOT NULL AS ready")).rows[0].ready)await raw.query('SELECT * FROM maridao.deliver_notifications(100)');
   return (await raw.query('SELECT id,request_id,title,created_at,read_at FROM maridao.notifications WHERE account_id=$1 AND ($2::bigint IS NULL OR id<$2::bigint) ORDER BY id DESC LIMIT 31',[id,null])).rows;
  };
  assert.deepEqual((await notifications(a.id)).map(n=>[n.request_id,n.title,n.read_at]),[[null,'Cadastro aprovado: seu perfil aparece nas buscas e você já pode enviar propostas',null]]);
  await assert.rejects(()=>decideProvider(db,admin,a.id,{reason:'Dados conferidos'},true),(e:unknown)=>failure(409,'NOT_PENDING')(e)&&(e as WorkflowError).details?.approvalStatus==='Aprovado');
  await assert.rejects(()=>pendingProviderDetail(db,a.id),failure(409,'NOT_PENDING'));
  assert.equal(await inSearch(a.id),true);assert.ok(!(await pending()).includes(a.id));
  const proposal=await sendProposal(db,a.id,request,proposalForm);assert.equal(proposal.status,'Pendente');
  // Rejeição exige motivo e também notifica.
  assert.deepEqual(await decideProvider(db,admin,b.id,{reason:' Documento não confere '},false),{id:b.id,approvalStatus:'Rejeitado',approvalReason:'Documento não confere'});
  assert.deepEqual((await raw.query('SELECT admin_id,action,reason FROM maridao.admin_events WHERE target_account_id=$1',[b.id])).rows,[{admin_id:admin.id,action:'provider_rejected',reason:'Documento não confere'}]);
  assert.deepEqual((await notifications(b.id)).map(n=>[n.request_id,n.title]),[[null,'Cadastro rejeitado: veja o motivo no seu perfil']]);
  assert.equal(await inSearch(b.id),false);await assert.rejects(()=>sendProposal(db,b.id,request,proposalForm),AcceptanceError);
  assert.equal((await userDetail(db,b.id)).user.approvalReason,'Documento não confere');
  // UC02.1 fluxo 2: prestador criado pelo administrador já nasce aprovado, com senha provisória e sem notificação.
  const providerForm={name:'Prestador fictício C',email:mail('prestador-c'),phone:'63999999999',password:provisional,documentType:'CPF',document:fakeCpf(),categories:[services[0].value],specialties:[services[0].specialties[0]],neighborhoods:[area],availability:'A combinar'};
  await assert.rejects(()=>createProvider(db,admin,{...providerForm,categories:[]}),(e:unknown)=>e instanceof Error&&'fields' in e);
  const preapproved=await createProvider(db,admin,providerForm);
  assert.deepEqual(await one('SELECT p.approval_status,p.approval_decided_by,a.must_change_password FROM maridao.provider_profiles p JOIN maridao.accounts a ON a.id=p.account_id WHERE a.id=$1',[preapproved.id]),{approval_status:'Aprovado',approval_decided_by:admin.id,must_change_password:true});
  assert.equal((await notifications(preapproved.id)).length,0);assert.equal(await inSearch(preapproved.id),true);
  await assert.rejects(()=>createProvider(db,admin,{...providerForm,email:mail('prestador-e')}),(e:unknown)=>failure(409)(e)&&'document' in ((e as WorkflowError).details?.fields as object));
  // UC01.3 fluxo 2: exclusão bloqueada com solicitação aceita; prestador só pode ser inativado.
  await editUser(db,admin,customer.id,{name:'Cliente fictício editado',phone:'63999120345',neighborhood:area});
  assert.equal((await userDetail(db,customer.id)).user.name,'Cliente fictício editado');
  await assert.rejects(()=>editUser(db,admin,customer.id,{name:'X',phone:'63999120345',neighborhood:area,cpf}),failure(400));
  await acceptProposal(db,customer,request,proposal.id,{version:1});
  await assert.rejects(()=>deleteCustomer(db,admin,customer.id,{reason:'Pedido do titular'}),failure(409));
  await assert.rejects(()=>deactivateUser(db,admin,customer.id,{reason:'Teste'}),failure(409));
  await assert.rejects(()=>deactivateUser(db,admin,a.id,{reason:'Teste'}),failure(409));
  await assert.rejects(()=>deleteCustomer(db,admin,a.id,{reason:'Teste'}),failure(409,'PROVIDER_CANNOT_BE_DELETED'));
  await assert.rejects(()=>deleteCustomer(db,admin,first.id,{reason:'Teste'}),failure(404));
  assert.equal((await one('SELECT disabled_at FROM maridao.accounts WHERE id=$1',[customer.id])).disabled_at,null);
  // Exclusão permitida: pedido aberto é cancelado, dados pessoais eliminados, motivo registrado.
  const cpf2=fakeCpf(),form2={...form,name:'Cliente fictício 2',email:mail('cliente2'),cpf:cpf2},removed=await createCustomer(db,admin,form2);
  const open=randomUUID();
  await raw.query("INSERT INTO maridao.service_requests(id,customer_id,category,description,neighborhood) VALUES($1,$2,'Pintura','Pedido aberto fictício',$3)",[open,removed.id,area]);
  const pendingProposal=await sendProposal(db,a.id,open,proposalForm);
  await raw.query("INSERT INTO maridao.sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[randomBytes(32).toString('hex'),removed.id]);
  await deleteCustomer(db,admin,removed.id,{reason:'Pedido do titular dos dados'});
  const gone=await one('SELECT a.email,a.disabled_at,a.deleted_at,a.password_hash,a.must_change_password,c.full_name,c.phone,c.cpf,c.neighborhood FROM maridao.accounts a JOIN maridao.customer_profiles c ON c.account_id=a.id WHERE a.id=$1',[removed.id]);
  assert.deepEqual([gone.email,gone.full_name,gone.phone,gone.cpf,gone.neighborhood,gone.must_change_password],[null,REMOVED_NAME,null,null,null,false]);assert.ok(gone.disabled_at&&gone.deleted_at);
  assert.equal(await verifyPassword(provisional,gone.password_hash),false);
  assert.equal((await one('SELECT status FROM maridao.service_requests WHERE id=$1',[open])).status,'Cancelada');assert.equal((await one('SELECT status FROM maridao.proposals WHERE id=$1',[pendingProposal.id])).status,'Não selecionada');
  // 016: o prestador com proposta pendente é avisado uma vez; a conta excluída não recebe aviso.
  await notifications(a.id);
  assert.deepEqual((await raw.query('SELECT account_id,title FROM maridao.notifications WHERE request_id=$1 AND id>(SELECT max(id) FROM maridao.notifications WHERE request_id=$1 AND title=$2)',[open,'Nova proposta recebida'])).rows,[{account_id:a.id,title:'Solicitação cancelada: sua proposta foi encerrada'}]);
  assert.deepEqual((await raw.query('SELECT actor_account_id,actor_kind,action FROM maridao.request_events WHERE request_id=$1',[open])).rows,[{actor_account_id:admin.id,actor_kind:'administration',action:'account_closed'}]);
  assert.equal((await one('SELECT count(*)::integer AS count FROM maridao.sessions WHERE account_id=$1',[removed.id])).count,0);
  assert.deepEqual((await raw.query("SELECT admin_id,reason FROM maridao.admin_events WHERE target_account_id=$1 AND action='account_deleted'",[removed.id])).rows,[{admin_id:admin.id,reason:'Pedido do titular dos dados'}]);
  const detail=await userDetail(db,removed.id);assert.equal(detail.user.accountStatus,'Excluída');assert.equal(detail.user.name,REMOVED_NAME);assert.deepEqual(detail.events.map(e=>e.action),['account_deleted','account_created']);assert.equal(detail.events[0].adminName,'Admin fictício');assert.equal(detail.events[0].by,'administration');
  assert.deepEqual((await listUsers(db,{status:'excluida',q:REMOVED_NAME})).users.filter(u=>u.id===removed.id).map(u=>[u.email,u.cpf]),[[null,null]]);
  await assert.rejects(()=>deleteCustomer(db,admin,removed.id,{reason:'Repetida'}),failure(409));await assert.rejects(()=>editUser(db,admin,removed.id,{name:'X',phone:'63999120345',neighborhood:area}),failure(409));
  // E-mail e CPF eliminados ficam livres para um novo cadastro.
  assert.ok((await createCustomer(db,admin,form2)).id);
  // RNF02.4: inativação com motivo, sessões encerradas.
  await raw.query("INSERT INTO maridao.sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[randomBytes(32).toString('hex'),b.id]);
  await deactivateUser(db,admin,b.id,{reason:'Cadastro duplicado'});
  assert.ok((await one('SELECT disabled_at FROM maridao.accounts WHERE id=$1',[b.id])).disabled_at);assert.equal((await one('SELECT count(*)::integer AS count FROM maridao.sessions WHERE account_id=$1',[b.id])).count,0);
  assert.equal((await one("SELECT reason FROM maridao.admin_events WHERE target_account_id=$1 AND action='account_deactivated'",[b.id])).reason,'Cadastro duplicado');
  assert.equal((await userDetail(db,b.id)).user.accountStatus,'Inativa');await assert.rejects(()=>deactivateUser(db,admin,b.id,{reason:'De novo'}),failure(409));
  // O registro administrativo não pode ser alterado nem apagado pela API.
  for(const sql of ["UPDATE maridao.admin_events SET reason='x'",'DELETE FROM maridao.admin_events']){
   await raw.query('SAVEPOINT denied');await assert.rejects(()=>raw.query(sql),(e:unknown)=>typeof e==='object'&&e!==null&&'code' in e&&e.code==='42501');await raw.query('ROLLBACK TO SAVEPOINT denied');
  }
 }finally{try{await raw.query('ROLLBACK');}finally{raw.release();await pool.end();}}
});
