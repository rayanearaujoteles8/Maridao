import {randomBytes} from 'node:crypto';
import {deliverMail,mailMode,type Mail} from './mail-delivery.ts';
import type {PoolClient} from 'pg';
import {tokenHash,type Profile} from './auth.ts';
import {hashPassword,verifyPassword} from './password.ts';
import {validateCustomer} from './customer-validation.ts';
import {validateProvider} from './provider-validation.ts';
import {WorkflowError} from './workflow-error.ts';
import {object,text} from './team-workflows.ts';
import {recordEvent} from './customer-confirmation.ts';
import {localDateSql} from './proposal-versions.ts';
type DB=Pick<PoolClient,'query'>;
export function password(value:unknown){if(typeof value!=='string'||!value.trim()||[...value].length<8||[...value].length>128)throw new WorkflowError(400,'Use uma senha de 8 a 128 caracteres.');return value;}
async function lockAccount(db:DB,id:string,current:unknown){
 const row=(await db.query('SELECT password_hash FROM maridao.accounts WHERE id=$1 AND disabled_at IS NULL FOR UPDATE',[id])).rows[0];
 if(!row||typeof current!=='string'||current.length>256||!await verifyPassword(current,row.password_hash))throw new WorkflowError(403,'Confira sua senha atual.',{code:'WRONG_PASSWORD'});return row;
}
// Mesmas regras do cadastro; e-mail, senha e CPF não fazem parte da edição.
export function validateProfileFields(role:Profile['role'],fields:Record<string,unknown>){
 const common={email:'validation@example.invalid',password:'validation-only'};
 return role==='provider'?validateProvider({...common,...fields,documentType:'CPF',document:'52998224725'}):validateCustomer({...common,...fields,cpf:'52998224725'});
}
export async function writeProfile(db:DB,id:string,role:Profile['role'],data:ReturnType<typeof validateProfileFields>){
 if(role==='provider'){
  const p=data as ReturnType<typeof validateProvider>;
  await db.query('UPDATE maridao.provider_profiles SET full_name=$2,phone=$3,categories=$4,specialties=$5,neighborhoods=$6,availability=$7 WHERE account_id=$1',[id,p.name,p.phone,p.categories,p.specialties,p.neighborhoods,p.availability]);
 }else{
  const c=data as ReturnType<typeof validateCustomer>;
  await db.query('UPDATE maridao.customer_profiles SET full_name=$2,phone=$3,neighborhood=$4 WHERE account_id=$1',[id,c.name,c.phone,c.neighborhood]);
 }
}
export async function updateProfile(db:DB,user:Profile,input:unknown){
 const allowed=user.role==='provider'?['name','phone','categories','specialties','neighborhoods','availability','currentPassword']:['name','phone','neighborhood','currentPassword'];
 const v=object(input,allowed),{currentPassword,...fields}=v;
 const data=validateProfileFields(user.role,fields);
 await db.query('BEGIN');try{
  await lockAccount(db,user.id,currentPassword);
  await writeProfile(db,user.id,user.role,data);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}
}
export async function changePassword(db:DB,user:Profile,input:unknown){
 const v=object(input,['currentPassword','newPassword']),next=password(v.newPassword);
 await db.query('BEGIN');try{
  await lockAccount(db,user.id,v.currentPassword);const hash=await hashPassword(next);
  await db.query('UPDATE maridao.accounts SET password_hash=$2 WHERE id=$1',[user.id,hash]);await db.query('DELETE FROM maridao.sessions WHERE account_id=$1',[user.id]);await db.query('DELETE FROM maridao.account_challenges WHERE account_id=$1',[user.id]);await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}
}
// Pedidos do cliente e pedidos em que o prestador foi escolhido ou tem proposta pendente, sempre bloqueados antes da conta.
export async function lockAccountRequests(db:DB,id:string){
 return (await db.query(`SELECT r.id,r.status,r.customer_id,EXISTS(SELECT 1 FROM maridao.proposals p WHERE p.id=r.selected_proposal_id AND p.provider_id=$1) AS chosen FROM maridao.service_requests r WHERE r.customer_id=$1 OR EXISTS(SELECT 1 FROM maridao.proposals p WHERE p.request_id=r.id AND p.provider_id=$1 AND (p.id=r.selected_proposal_id OR p.status='Pendente')) ORDER BY r.id FOR UPDATE OF r`,[id])).rows;
}
// "Aguardando confirmação" conta como atendimento em curso, como "Aceita" e "Em andamento" (RN10).
export const activeStatuses=['Aceita','Em andamento','Aguardando confirmação'];
// Encerramento pelo próprio usuário ou pela administração (actor.role='administration'): recusa com atendimento ativo, cancela pedidos abertos e retira propostas pendentes.
export async function closeAccountWork(db:DB,target:{id:string;role?:string},actor:{id:string;role?:string},requests:{id:string;status:string;customer_id:string;chosen:boolean}[],blocked='Resolva os atendimentos aceitos ou em andamento antes de excluir a conta.'){
 const admin=actor.id!==target.id,code='ACCOUNT_HAS_ACTIVE_REQUESTS';
 if(requests.some(r=>(r.customer_id===target.id||r.chosen)&&activeStatuses.includes(r.status)))throw new WorkflowError(409,blocked,{code});
 const active=(await db.query(`SELECT r.id FROM maridao.service_requests r WHERE r.status=ANY($2::text[]) AND (r.customer_id=$1 OR EXISTS(SELECT 1 FROM maridao.proposals p WHERE p.id=r.selected_proposal_id AND p.provider_id=$1)) LIMIT 1`,[target.id,activeStatuses])).rowCount;
 if(active)throw new WorkflowError(409,admin?blocked:'Um atendimento mudou. Atualize os pedidos antes de excluir a conta.',{code});
 for(const r of requests.filter(r=>r.customer_id===target.id&&r.status==='Aberta')){
  // UC04.4 / 7.5: como no cancelamento pelo cliente, as propostas pendentes ainda válidas passam a "Não selecionada" (a vencida fica para a passada da expiração).
  await db.query("UPDATE maridao.service_requests SET status='Cancelada' WHERE id=$1",[r.id]);await db.query(`UPDATE maridao.proposals SET status='Não selecionada' WHERE request_id=$1 AND status='Pendente' AND valid_until >= ${localDateSql()}`,[r.id]);
  await recordEvent(db,r.id,actor,'account_closed','Aberta','Cancelada',admin?'Administração encerrou a conta do cliente.':'Cliente encerrou a conta.');
 }
 if(target.role==='provider'){
  const withdrawn=await db.query("UPDATE maridao.proposals SET status='Retirada',withdrawn_at=clock_timestamp() WHERE provider_id=$1 AND status='Pendente' RETURNING request_id",[target.id]);
  for(const r of withdrawn.rows)await recordEvent(db,r.request_id,actor,'proposal_withdrawn','Aberta','Aberta',admin?'Proposta retirada: a administração inativou a conta do prestador.':'Prestador retirou a proposta ao encerrar a conta.');
 }
}
export const REMOVED_NAME='Usuário removido';
// Histórico visto pelo prestador (pedidos, propostas, chat, avaliações): o cliente excluído aparece como "Usuário removido".
// A API não entrega o nome de cliente ativo ao prestador; por isso o nome só vem preenchido quando a conta foi excluída.
export const customerRemovedSql=(customer='r.customer_id')=>`EXISTS(SELECT 1 FROM maridao.accounts removed WHERE removed.id=${customer} AND removed.deleted_at IS NOT NULL)`;
export const customerAuthorSql=(customer='r.customer_id',prefix='customer')=>`${customerRemovedSql(customer)} AS ${prefix}_removed,CASE WHEN ${customerRemovedSql(customer)} THEN '${REMOVED_NAME}' END AS ${prefix}_name`;
export type AccountAction='admin_created'|'account_created'|'account_edited'|'account_deactivated'|'account_deleted'|'provider_approved'|'provider_rejected';
// RNF02.3 / RNF02.4: data, autor, conta e motivo. Quando o próprio titular age, adminId é nulo e kind diz o papel dele.
export async function recordAccountEvent(db:DB,actor:{adminId:string|null;kind:'administration'|'customer'|'provider'},targetId:string,action:AccountAction,reason=''){
 await db.query('INSERT INTO maridao.admin_events(admin_id,target_account_id,action,reason,actor_kind) VALUES($1,$2,$3,$4,$5)',[actor.adminId,targetId,action,reason,actor.kind]);
}
export async function endAccess(db:DB,id:string){
 await db.query('DELETE FROM maridao.sessions WHERE account_id=$1',[id]);await db.query('DELETE FROM maridao.account_challenges WHERE account_id=$1',[id]);
}
// UC01.3 (fluxos 1 e 2): desativa a conta, elimina nome, e-mail, telefone, CPF e endereço e encerra todas as sessões.
// A linha da conta fica só como referência do histórico; o hash antigo é trocado por um valor que nenhuma senha confere.
export async function eraseCustomer(db:DB,id:string){
 await db.query(`UPDATE maridao.accounts SET disabled_at=COALESCE(disabled_at,clock_timestamp()),deleted_at=clock_timestamp(),email=NULL,email_verified_at=NULL,must_change_password=false,password_hash='removido$'||md5(random()::text)||md5(random()::text) WHERE id=$1`,[id]);
 await db.query('UPDATE maridao.customer_profiles SET full_name=$2,phone=NULL,cpf=NULL,neighborhood=NULL WHERE account_id=$1',[id,REMOVED_NAME]);
 await endAccess(db,id);
}
const closure={
 customer:{action:'deleted',event:'account_deleted',reason:'Exclusão solicitada pelo próprio cliente.',done:'Conta excluída. Seus dados pessoais foram eliminados.',
  blocked:'Você tem solicitação aceita ou em andamento. A exclusão só será possível depois que essas solicitações forem concluídas ou canceladas.'},
 provider:{action:'deactivated',event:'account_deactivated',reason:'Inativação solicitada pelo próprio prestador.',done:'Conta inativada. O histórico dos serviços foi preservado.',
  blocked:'Você tem atendimento aceito ou em andamento. A inativação só será possível depois que esses atendimentos forem concluídos ou cancelados.'},
} as const;
function closureFor(user:Pick<Profile,'role'>){
 if(user.role!=='customer'&&user.role!=='provider')throw new WorkflowError(403,'Esta conta não pode ser encerrada por aqui.',{code:'ACCOUNT_CLOSE_NOT_ALLOWED'});
 return closure[user.role];
}
const reasonField='Informe o motivo com até 500 caracteres.';
// GET /account: diz à tela o que "encerrar a conta" fará e se já é possível (RN10).
export async function closureStatus(db:DB,user:Pick<Profile,'id'|'role'>){
 const kind=closureFor(user);
 const counts=(await db.query<{active:number;open:number}>(`SELECT count(*) FILTER(WHERE r.status=ANY($2::text[]) AND (r.customer_id=$1 OR EXISTS(SELECT 1 FROM maridao.proposals p WHERE p.id=r.selected_proposal_id AND p.provider_id=$1)))::integer AS active,
  count(*) FILTER(WHERE r.status='Aberta' AND r.customer_id=$1)::integer AS open FROM maridao.service_requests r WHERE r.customer_id=$1 OR EXISTS(SELECT 1 FROM maridao.proposals p WHERE p.id=r.selected_proposal_id AND p.provider_id=$1)`,[user.id,activeStatuses])).rows[0];
 return {action:kind.action==='deleted'?'delete':'deactivate',allowed:counts.active===0,activeRequests:counts.active,openRequests:counts.open,...(counts.active?{code:'ACCOUNT_HAS_ACTIVE_REQUESTS',reason:kind.blocked}:{})};
}
// POST /account/close. Cliente: UC01.3 fluxo 1 (exclusão, com os dados pessoais eliminados). Prestador: UC02.3 (só inativação; prestador nunca é excluído).
export async function deactivateAccount(db:DB,user:Profile,input:unknown){
 const v=object(input,['currentPassword','reason']),kind=closureFor(user);
 if(v.reason!==undefined&&v.reason!==null&&(typeof v.reason!=='string'||v.reason.trim().length>500))throw new WorkflowError(400,reasonField,{fields:{reason:reasonField}});
 const reason=typeof v.reason==='string'&&v.reason.trim()?v.reason.trim():kind.reason;
 await db.query('BEGIN');try{
  const requests=await lockAccountRequests(db,user.id);
  await lockAccount(db,user.id,v.currentPassword);
  await closeAccountWork(db,user,user,requests,kind.blocked);
  if(user.role==='customer')await eraseCustomer(db,user.id);
  else{await db.query('UPDATE maridao.accounts SET disabled_at=clock_timestamp() WHERE id=$1',[user.id]);await endAccess(db,user.id);}
  await recordAccountEvent(db,{adminId:null,kind:user.role as 'customer'|'provider'},user.id,kind.event,reason);
  await db.query('COMMIT');
 }catch(e){try{await db.query('ROLLBACK');}catch{}throw e;}
 return {action:kind.action,message:kind.done};
}
// UC10.4 fluxo 2: troca obrigatória da senha provisória definida pelo administrador.
export async function replaceProvisionalPassword(db:DB,user:Profile,sessionHash:string,input:unknown){
 const next=password(object(input,['newPassword']).newPassword);
 await db.query('BEGIN');try{
  const row=(await db.query('SELECT password_hash,must_change_password FROM maridao.accounts WHERE id=$1 AND disabled_at IS NULL FOR UPDATE',[user.id])).rows[0];
  if(!row)throw new WorkflowError(401,'Sua sessão expirou. Entre novamente.');
  if(!row.must_change_password)throw new WorkflowError(409,'Esta conta não tem senha provisória para trocar.');
  if(await verifyPassword(next,row.password_hash))throw new WorkflowError(400,'A nova senha deve ser diferente da senha provisória.',{code:'SAME_AS_PROVISIONAL'});
  await db.query('UPDATE maridao.accounts SET password_hash=$2,must_change_password=false WHERE id=$1',[user.id,await hashPassword(next)]);
  await db.query('DELETE FROM maridao.sessions WHERE account_id=$1 AND token_hash<>$2',[user.id,sessionHash]);await db.query('DELETE FROM maridao.account_challenges WHERE account_id=$1',[user.id]);await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}
}
type Purpose='password_reset'|'verify_email';
export function mailEnabled(){return mailMode()!=='unconfigured';}

export async function requestChallenge(db:DB,input:unknown,purpose:Purpose,user?:Profile,deliver:(mail:Mail)=>Promise<void>=deliverMail){
 if(!mailEnabled())throw new WorkflowError(503,'O envio de e-mail ainda não foi configurado.');
 const v=object(input,purpose==='password_reset'?['email']:[]);
 const email=purpose==='password_reset'?text(v.email,254,'E-mail').toLowerCase():user?.email;
 const token=randomBytes(32).toString('hex');
 await db.query('BEGIN');let recipient:string|undefined;
 try{
  const account=(await db.query('SELECT id,email FROM maridao.accounts WHERE email=$1 AND disabled_at IS NULL FOR UPDATE',[email])).rows[0];
  if(account){recipient=account.email;await db.query(`INSERT INTO maridao.account_challenges(account_id,purpose,token_hash,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '15 minutes') ON CONFLICT(account_id,purpose) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,attempts=0`,[account.id,purpose,tokenHash(token)]);}
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}
 const delivery=mailMode();
 if(recipient){try{await deliver({to:recipient,purpose,token,expiresInMinutes:15});}catch(error){
  if(delivery==='local')throw error;
  console.error('Falha no envio de e-mail de autenticação. Confira a configuração de envio.');
 }}
 return {message:delivery==='local'?'Se houver uma conta ativa, as instruções estarão na caixa de e-mail de teste.':'Se houver uma conta ativa, você receberá um código por e-mail. Confira também a pasta de spam.',delivery};
}
export async function consumeChallenge(db:DB,input:unknown,purpose:Purpose,user?:Profile){
 const v=object(input,purpose==='password_reset'?['email','token','newPassword']:['token']);
 const email=purpose==='password_reset'?text(v.email,254,'E-mail').toLowerCase():user?.email;
 if(typeof v.token!=='string'||! /^[a-f0-9]{64}$/.test(v.token))throw new WorkflowError(400,'Código inválido ou expirado.');
 const next=purpose==='password_reset'?password(v.newPassword):null;
 await db.query('BEGIN');let committed=false;
 try{
  const account=(await db.query('SELECT id FROM maridao.accounts WHERE email=$1 AND disabled_at IS NULL FOR UPDATE',[email])).rows[0];
  const challenge=account?(await db.query('SELECT token_hash,attempts,expires_at>clock_timestamp() AS valid FROM maridao.account_challenges WHERE account_id=$1 AND purpose=$2 FOR UPDATE',[account.id,purpose])).rows[0]:null;
  if(!challenge||!challenge.valid||challenge.attempts>=5)throw new WorkflowError(400,'Código inválido ou expirado.');
  if(challenge.token_hash!==tokenHash(v.token)){
   await db.query('UPDATE maridao.account_challenges SET attempts=attempts+1 WHERE account_id=$1 AND purpose=$2',[account.id,purpose]);await db.query('COMMIT');committed=true;throw new WorkflowError(400,'Código inválido ou expirado.');
  }
  if(next){await db.query('UPDATE maridao.accounts SET password_hash=$2,must_change_password=false WHERE id=$1',[account.id,await hashPassword(next)]);await db.query('DELETE FROM maridao.sessions WHERE account_id=$1',[account.id]);}
  else await db.query('UPDATE maridao.accounts SET email_verified_at=clock_timestamp() WHERE id=$1',[account.id]);
  await db.query('DELETE FROM maridao.account_challenges WHERE account_id=$1 AND purpose=$2',[account.id,purpose]);await db.query('COMMIT');
 }catch(e){if(!committed)await db.query('ROLLBACK');throw e;}
}
