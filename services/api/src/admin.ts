import type {PoolClient} from 'pg';
import type {Profile} from './auth.ts';
import {hashPassword} from './password.ts';
import {validateCustomer,validCpf} from './customer-validation.ts';
import {validateProvider} from './provider-validation.ts';
import {documentFingerprint,formatCpf,maskCpf,protectDocument,revealDocument} from './document-security.ts';
import {coverageLabel} from './coverage.ts';
import {WorkflowError} from './workflow-error.ts';
import {object,requireId} from './team-workflows.ts';
import {closeAccountWork,endAccess,eraseCustomer,lockAccountRequests,recordAccountEvent,validateProfileFields,writeProfile,REMOVED_NAME,type AccountAction} from './account-management.ts';
type DB=Pick<PoolClient,'query'>;
type Admin=Pick<Profile,'id'|'role'>;
export {REMOVED_NAME};

export function requireAdmin<T extends Pick<Profile,'role'>>(user:T){
 if(user.role!=='admin')throw new WorkflowError(403,'Área restrita a administradores.',{code:'ADMIN_ONLY'});return user;
}
// RNF02.3 / RNF02.4: toda decisão fica registrada com data, administrador, conta e motivo.
const recordAdminEvent=(db:DB,adminId:string|null,targetId:string,action:AccountAction,reason='')=>recordAccountEvent(db,{adminId,kind:'administration'},targetId,action,reason);
const duplicates:Record<string,Record<string,string>>={
 accounts_email_unique:{email:'E-mail já cadastrado.'},
 customer_profiles_cpf_key:{cpf:'CPF já cadastrado.'},
 provider_profiles_document_fingerprint_key:{document:'CPF já cadastrado.'},
};
async function transaction<T>(db:DB,work:()=>Promise<T>){
 await db.query('BEGIN');
 try{const result=await work();await db.query('COMMIT');return result;}
 catch(error){
  try{await db.query('ROLLBACK');}catch{}
  if(error&&typeof error==='object'&&'code' in error&&error.code==='23505'){
   const fields=duplicates[String((error as {constraint?:unknown}).constraint)];
   throw new WorkflowError(409,fields?Object.values(fields)[0]:'Já existe cadastro com os dados informados.',fields&&{fields});
  }
  throw error;
 }
}
export function reasonText(value:unknown){
 if(typeof value!=='string'||!value.trim()||value.trim().length>500)throw new WorkflowError(400,'Informe o motivo, com até 500 caracteres.',{fields:{reason:'Informe o motivo, com até 500 caracteres.'}});
 return value.trim();
}
function pageNumber(value:unknown){
 const page=value??'1';if(typeof page!=='string'||!/^\d{1,4}$/.test(page)||Number(page)<1)throw new WorkflowError(400,'Página inválida.');return Number(page);
}
const accountStatus=(row:{disabled_at:unknown;deleted_at:unknown})=>row.deleted_at?'Excluída':row.disabled_at?'Inativa':'Ativa';
// O documento do prestador fica criptografado; nas listas só aparece mascarado.
function providerCpf(encrypted:string){try{const document=revealDocument(encrypted);return document.type==='CPF'?document.value:null;}catch{return null;}}

// ---- UC14.1: consulta de usuários ----
const accountStatuses:Record<string,string>={ativa:'Ativa',inativa:'Inativa',excluida:'Excluída'};
const approvalStatuses:Record<string,string>={em_analise:'Em análise',aprovado:'Aprovado',rejeitado:'Rejeitado'};
export function userListQuery(query:Record<string,unknown>){
 if(Object.keys(query).some(key=>!['q','type','status','page'].includes(key)))throw new WorkflowError(400,'Filtro inválido.');
 const filter=(name:string)=>{const value=query[name]??'';if(typeof value!=='string'||value.length>100)throw new WorkflowError(400,'Filtro inválido.');return value.trim();};
 const q=filter('q'),type=filter('type'),status=filter('status'),page=pageNumber(query.page);
 if(type&&type!=='customer'&&type!=='provider')throw new WorkflowError(400,'Tipo inválido. Use customer ou provider.');
 if(status&&!(status in accountStatuses)&&!(status in approvalStatuses))throw new WorkflowError(400,'Status inválido. Use ativa, inativa, excluida, em_analise, aprovado ou rejeitado.');
 // Um CPF completo (com ou sem pontuação) é comparado por igualdade; qualquer outro texto busca em nome e e-mail.
 const digits=q.replace(/\D/g,''),cpf=/^[\d.\s-]+$/.test(q)&&validCpf(digits)?digits:'';
 return {text:`SELECT u.* FROM (
  SELECT a.id,a.email,a.created_at,a.disabled_at,a.deleted_at,c.full_name AS name,'customer' AS type,c.cpf,NULL::text AS document_encrypted,NULL::text AS document_fingerprint,NULL::text AS approval_status
   FROM maridao.accounts a JOIN maridao.customer_profiles c ON c.account_id=a.id
  UNION ALL
  SELECT a.id,a.email,a.created_at,a.disabled_at,a.deleted_at,p.full_name,'provider',NULL,p.document_encrypted,p.document_fingerprint,p.approval_status
   FROM maridao.accounts a JOIN maridao.provider_profiles p ON p.account_id=a.id) u
  WHERE NOT EXISTS(SELECT 1 FROM maridao.admin_profiles ad WHERE ad.account_id=u.id)
   AND ($1='' OR u.type=$1)
   AND ($2='' OR CASE WHEN u.deleted_at IS NOT NULL THEN 'Excluída' WHEN u.disabled_at IS NOT NULL THEN 'Inativa' ELSE 'Ativa' END=$2)
   AND ($3='' OR u.approval_status=$3)
   AND ($4='' OR strpos(lower(u.name),lower($4))>0 OR strpos(lower(COALESCE(u.email,'')),lower($4))>0)
   AND ($5='' OR u.cpf=$5 OR u.document_fingerprint=$6)
  ORDER BY lower(u.name),u.id LIMIT 21 OFFSET $7`,
  values:[type,accountStatuses[status]??'',approvalStatuses[status]??'',cpf?'':q,cpf,cpf?documentFingerprint('CPF',cpf):'',(page-1)*20],page};
}
type ListRow={id:string;email:string|null;created_at:Date;disabled_at:Date|null;deleted_at:Date|null;name:string;type:'customer'|'provider';cpf:string|null;document_encrypted:string|null;approval_status:string|null};
export function userSummary(row:ListRow){
 return {id:row.id,type:row.type,name:row.name,email:row.email,cpf:maskCpf(row.type==='provider'&&row.document_encrypted?providerCpf(row.document_encrypted):row.cpf),
  accountStatus:accountStatus(row),...(row.type==='provider'?{approvalStatus:row.approval_status}:{}),createdAt:row.created_at};
}
export async function listUsers(db:DB,query:Record<string,unknown>){
 const list=userListQuery(query),rows=(await db.query<ListRow>(list.text,list.values)).rows;
 return {users:rows.slice(0,20).map(userSummary),page:list.page,hasMore:rows.length>20};
}

// ---- UC14.2: gerenciar contas ----
type Target={id:string;role:'customer'|'provider';disabled_at:Date|null;deleted_at:Date|null};
// Administradores não são gerenciados por estas rotas: para elas, a conta não existe.
async function findTarget(db:DB,id:string,lock=false){
 requireId(id);
 const row=(await db.query<Target>(`SELECT a.id,a.disabled_at,a.deleted_at,CASE WHEN c.account_id IS NOT NULL THEN 'customer' ELSE 'provider' END AS role
  FROM maridao.accounts a LEFT JOIN maridao.customer_profiles c ON c.account_id=a.id LEFT JOIN maridao.provider_profiles p ON p.account_id=a.id
  WHERE a.id=$1 AND (c.account_id IS NOT NULL OR p.account_id IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM maridao.admin_profiles ad WHERE ad.account_id=a.id)${lock?' FOR UPDATE OF a':''}`,[id])).rows[0];
 if(!row)throw new WorkflowError(404,'Usuário não encontrado.');return row;
}
export async function userDetail(db:DB,id:string){
 const target=await findTarget(db,id);
 const account=(await db.query('SELECT email,created_at,disabled_at,deleted_at,must_change_password,email_verified_at FROM maridao.accounts WHERE id=$1',[id])).rows[0];
 const base={id,type:target.role,email:account.email,accountStatus:accountStatus(account),mustChangePassword:account.must_change_password,emailVerified:Boolean(account.email_verified_at),createdAt:account.created_at,disabledAt:account.disabled_at,deletedAt:account.deleted_at};
 let user:Record<string,unknown>;
 if(target.role==='customer'){
  const c=(await db.query('SELECT full_name,phone,cpf,neighborhood,city,state FROM maridao.customer_profiles WHERE account_id=$1',[id])).rows[0];
  user={...base,name:c.full_name,phone:c.phone,cpf:maskCpf(c.cpf),neighborhood:c.neighborhood,city:c.city,state:c.state};
 }else{
  const p=(await db.query('SELECT full_name,phone,document_encrypted,categories,specialties,neighborhoods,availability,city,state,approval_status,approval_reason,approval_decided_at FROM maridao.provider_profiles WHERE account_id=$1',[id])).rows[0];
  user={...base,name:p.full_name,phone:p.phone,cpf:maskCpf(providerCpf(p.document_encrypted)),categories:p.categories,specialties:p.specialties,neighborhoods:p.neighborhoods,coverageLabels:(p.neighborhoods as string[]).map(coverageLabel),
   availability:p.availability,city:p.city,state:p.state,approvalStatus:p.approval_status,approvalReason:p.approval_reason,approvalDecidedAt:p.approval_decided_at};
 }
 const events=(await db.query(`SELECT e.id,e.action,e.reason,e.created_at AS "createdAt",e.actor_kind AS "by",ad.full_name AS "adminName" FROM maridao.admin_events e LEFT JOIN maridao.admin_profiles ad ON ad.account_id=e.admin_id WHERE e.target_account_id=$1 ORDER BY e.id DESC LIMIT 50`,[id])).rows;
 // RNF02.4: cancelamentos de pedidos em que a conta é cliente, prestador escolhido ou autora, com data, autor e motivo.
 const cancellations=(await db.query(`SELECT e.id,e.request_id AS "requestId",r.category,e.action,e.actor_kind AS "by",COALESCE(ec.full_name,ep.full_name,ea.full_name) AS "actorName",e.previous_status AS "previousStatus",e.reason,e.created_at AS "createdAt"
  FROM maridao.request_events e JOIN maridao.service_requests r ON r.id=e.request_id
  LEFT JOIN maridao.customer_profiles ec ON ec.account_id=e.actor_account_id LEFT JOIN maridao.provider_profiles ep ON ep.account_id=e.actor_account_id LEFT JOIN maridao.admin_profiles ea ON ea.account_id=e.actor_account_id
  WHERE e.next_status='Cancelada' AND e.previous_status IS DISTINCT FROM 'Cancelada' AND (r.customer_id=$1 OR e.actor_account_id=$1 OR EXISTS(SELECT 1 FROM maridao.proposals sp WHERE sp.id=r.selected_proposal_id AND sp.provider_id=$1))
  ORDER BY e.created_at DESC,e.id DESC LIMIT 50`,[id])).rows;
 return {user,events,cancellations};
}
// UC01.1 fluxo 2: mesmas validações do autocadastro; a senha informada é provisória.
export async function createCustomer(db:DB,admin:Admin,input:unknown){
 const data=validateCustomer(input),hash=await hashPassword(data.password);
 return transaction(db,async()=>{
  const id=(await db.query<{id:string}>('INSERT INTO maridao.accounts(email,password_hash,must_change_password) VALUES($1,$2,true) RETURNING id',[data.email,hash])).rows[0].id;
  await db.query('INSERT INTO maridao.customer_profiles(account_id,full_name,phone,cpf,neighborhood) VALUES($1,$2,$3,$4,$5)',[id,data.name,data.phone,data.cpf,data.neighborhood]);
  await recordAdminEvent(db,admin.id,id,'account_created','Cliente cadastrado pela administração.');
  return {id,name:data.name,email:data.email,city:'Palmas',state:'TO',mustChangePassword:true};
 });
}
// UC02.1 fluxo 2: o cadastro feito pelo administrador já nasce aprovado.
export async function createProvider(db:DB,admin:Admin,input:unknown){
 const data=validateProvider(input),document=protectDocument(data.documentType,data.document),hash=await hashPassword(data.password);
 return transaction(db,async()=>{
  const id=(await db.query<{id:string}>('INSERT INTO maridao.accounts(email,password_hash,must_change_password) VALUES($1,$2,true) RETURNING id',[data.email,hash])).rows[0].id;
  await db.query(`INSERT INTO maridao.provider_profiles(account_id,full_name,phone,document_type,document_encrypted,document_fingerprint,categories,specialties,neighborhoods,availability,approval_status,approval_decided_at,approval_decided_by)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Aprovado',clock_timestamp(),$11)`,[id,data.name,data.phone,data.documentType,document.encrypted,document.fingerprint,data.categories,data.specialties,data.neighborhoods,data.availability,admin.id]);
  await recordAdminEvent(db,admin.id,id,'account_created','Prestador cadastrado pela administração, já aprovado.');
  return {id,name:data.name,email:data.email,city:'Palmas',state:'TO',approvalStatus:'Aprovado',mustChangePassword:true};
 });
}
export function validateAdmin(input:unknown){
 const v=object(input,['name','email','password']),fields:Record<string,string>={};
 const name=typeof v.name==='string'?v.name.trim():'',email=typeof v.email==='string'?v.email.trim().toLowerCase():'',password=typeof v.password==='string'?v.password:'';
 if(!name||name.length>150)fields.name='Preencha este campo com até 150 caracteres.';
 if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fields.email='Informe um e-mail válido.';
 if(!password.trim()||[...password].length<8||[...password].length>128)fields.password='Use uma senha de 8 a 128 caracteres.';
 if(Object.keys(fields).length)throw new WorkflowError(400,'Revise os campos informados.',{fields});
 return {name,email,password};
}
// UC14.4. admin=null só é usado por npm run admin:create, para o primeiro administrador.
export async function createAdmin(db:DB,admin:Admin|null,input:unknown){
 const data=validateAdmin(input),hash=await hashPassword(data.password);
 return transaction(db,async()=>{
  const id=(await db.query<{id:string}>('INSERT INTO maridao.accounts(email,password_hash,must_change_password) VALUES($1,$2,true) RETURNING id',[data.email,hash])).rows[0].id;
  await db.query('INSERT INTO maridao.admin_profiles(account_id,full_name,created_by) VALUES($1,$2,$3)',[id,data.name,admin?.id??null]);
  await recordAdminEvent(db,admin?.id??null,id,'admin_created',admin?'Administrador cadastrado por outro administrador.':'Primeiro administrador, criado por npm run admin:create.');
  return {id,name:data.name,email:data.email,mustChangePassword:true};
 });
}
function requireActive(target:Target,action:string){
 if(target.deleted_at)throw new WorkflowError(409,`Esta conta foi excluída e não pode ser ${action}.`);
 if(target.disabled_at)throw new WorkflowError(409,`Esta conta está inativa e não pode ser ${action}.`);
}
// UC01.2 / UC02.2 fluxo 2: mesmos campos da edição feita pelo próprio usuário, sem a senha atual.
export async function editUser(db:DB,admin:Admin,id:string,input:unknown){
 const role=(await findTarget(db,id)).role;
 const data=validateProfileFields(role,object(input,role==='provider'?['name','phone','categories','specialties','neighborhoods','availability']:['name','phone','neighborhood']));
 await transaction(db,async()=>{
  requireActive(await findTarget(db,id,true),'editada');
  await writeProfile(db,id,role,data);
  await recordAdminEvent(db,admin.id,id,'account_edited');
 });
}
const activeService='Esta conta tem solicitação aceita ou em andamento. A operação só será possível depois que essas solicitações forem concluídas ou canceladas.';
// UC02.3 e inativação de cliente: a conta deixa de acessar o sistema e o histórico é preservado.
export async function deactivateUser(db:DB,admin:Admin,id:string,input:unknown){
 const reason=reasonText(object(input,['reason']).reason);
 await transaction(db,async()=>{
  const requests=await lockAccountRequests(db,id),target=await findTarget(db,id,true);
  if(target.deleted_at)throw new WorkflowError(409,'Esta conta já foi excluída.');
  if(target.disabled_at)throw new WorkflowError(409,'Esta conta já está inativa.');
  await closeAccountWork(db,target,{id:admin.id,role:'administration'},requests,activeService);
  await db.query('UPDATE maridao.accounts SET disabled_at=clock_timestamp() WHERE id=$1',[id]);
  await endAccess(db,id);
  await recordAdminEvent(db,admin.id,id,'account_deactivated',reason);
 });
}
// UC01.3 fluxo 2: só cliente; os dados pessoais são eliminados e o histórico passa a exibir "Usuário removido".
export async function deleteCustomer(db:DB,admin:Admin,id:string,input:unknown){
 const reason=reasonText(object(input,['reason']).reason);
 await transaction(db,async()=>{
  const requests=await lockAccountRequests(db,id),target=await findTarget(db,id,true);
  if(target.role!=='customer')throw new WorkflowError(409,'Conta de prestador não pode ser excluída, apenas inativada.',{code:'PROVIDER_CANNOT_BE_DELETED'});
  if(target.deleted_at)throw new WorkflowError(409,'Esta conta já foi excluída.');
  await closeAccountWork(db,target,{id:admin.id,role:'administration'},requests,activeService);
  await eraseCustomer(db,id);
  await recordAdminEvent(db,admin.id,id,'account_deleted',reason);
 });
}

// ---- UC14.3: aprovar cadastro de prestador ----
export async function pendingProviders(db:DB,query:Record<string,unknown>){
 if(Object.keys(query).some(key=>key!=='page'))throw new WorkflowError(400,'Filtro inválido.');
 const page=pageNumber(query.page);
 const rows=(await db.query(`SELECT p.account_id AS id,p.full_name AS name,a.email,p.document_encrypted,p.categories,p.neighborhoods,p.created_at FROM maridao.provider_profiles p JOIN maridao.accounts a ON a.id=p.account_id
  WHERE p.approval_status='Em análise' AND a.disabled_at IS NULL ORDER BY p.created_at,p.account_id LIMIT 21 OFFSET $1`,[(page-1)*20])).rows;
 return {providers:rows.slice(0,20).map(r=>({id:r.id,name:r.name,email:r.email,cpf:maskCpf(providerCpf(r.document_encrypted)),categories:r.categories,coverageLabels:(r.neighborhoods as string[]).map(coverageLabel),createdAt:r.created_at})),page,hasMore:rows.length>20};
}
const notPending=(status:string)=>new WorkflowError(409,`Este cadastro não está mais em análise. Status atual: ${status}.`,{code:'NOT_PENDING',approvalStatus:status});
// Único ponto da API que devolve o CPF completo, e só enquanto o cadastro está em análise.
export async function pendingProviderDetail(db:DB,id:string){
 requireId(id);
 const p=(await db.query(`SELECT p.full_name,a.email,p.phone,p.document_encrypted,p.categories,p.specialties,p.neighborhoods,p.availability,p.city,p.state,p.approval_status,p.created_at,a.disabled_at FROM maridao.provider_profiles p JOIN maridao.accounts a ON a.id=p.account_id WHERE p.account_id=$1`,[id])).rows[0];
 if(!p)throw new WorkflowError(404,'Cadastro de prestador não encontrado.');
 if(p.approval_status!=='Em análise')throw notPending(p.approval_status);
 if(p.disabled_at)throw new WorkflowError(409,'A conta deste prestador está inativa.');
 let document;try{document=revealDocument(p.document_encrypted);}catch{throw new WorkflowError(503,'Não foi possível ler o documento. Confira as chaves de proteção de documentos no servidor.');}
 return {provider:{id,name:p.full_name,email:p.email,phone:p.phone,cpf:formatCpf(document.value),categories:p.categories,specialties:p.specialties,neighborhoods:p.neighborhoods,coverageLabels:(p.neighborhoods as string[]).map(coverageLabel),
  availability:p.availability,city:p.city,state:p.state,approvalStatus:p.approval_status,createdAt:p.created_at}};
}
export async function decideProvider(db:DB,admin:Admin,id:string,input:unknown,approve:boolean){
 requireId(id);
 const reason=approve?(object(input,[]),null):reasonText(object(input,['reason']).reason);
 return transaction(db,async()=>{
  const p=(await db.query('SELECT p.approval_status,a.disabled_at FROM maridao.provider_profiles p JOIN maridao.accounts a ON a.id=p.account_id WHERE p.account_id=$1 FOR UPDATE OF p',[id])).rows[0];
  if(!p)throw new WorkflowError(404,'Cadastro de prestador não encontrado.');
  if(p.approval_status!=='Em análise')throw notPending(p.approval_status);
  if(p.disabled_at)throw new WorkflowError(409,'A conta deste prestador está inativa.');
  const status=approve?'Aprovado':'Rejeitado';
  // O gatilho notify_provider_approval avisa o prestador na mesma transação.
  await db.query('UPDATE maridao.provider_profiles SET approval_status=$2,approval_reason=$3,approval_decided_at=clock_timestamp(),approval_decided_by=$4 WHERE account_id=$1',[id,status,reason,admin.id]);
  await recordAdminEvent(db,admin.id,id,approve?'provider_approved':'provider_rejected',reason??'');
  return {id,approvalStatus:status,...(reason?{approvalReason:reason}:{})};
 });
}
