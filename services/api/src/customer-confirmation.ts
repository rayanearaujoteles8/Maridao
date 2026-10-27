import {createHash,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Profile} from './auth.ts';
import {validRequestId} from './proposal-validation.ts';
export class CompletionError extends Error{status:number;constructor(status:number,message:string){super(message);this.status=status;}}
type DB=Pick<PoolClient,'query'>;
export function codeDigest(id:string,salt:string,code:string){return createHash('sha256').update(`${id}:${salt}:${code}`).digest('hex');}
export const completionPermissionSql=(role:Profile['role'])=>`${role==='customer'?'r.customer_id=$1':'false'} AS can_confirm,
 EXISTS(SELECT 1 FROM maridao.service_support support WHERE support.request_id=r.id AND support.status='Aberto') AS support_open`;
export async function recordEvent(client:DB,id:string,user:Profile,action:string,previous:string|null,next:string|null,reason:string,related:string|null=null){
 await client.query(`INSERT INTO maridao.request_events(request_id,actor_account_id,actor_kind,action,previous_status,next_status,reason,related_request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,user.id,user.role,action,previous,next,reason,related]);
}
export function validateCustomerAction(user:Profile,id:unknown){
 if(user.role!=='customer')throw new CompletionError(403,'Somente o cliente do pedido pode realizar esta ação.');
 if(!validRequestId(id))throw new CompletionError(400,'Solicitação inválida.');
}
async function lockCustomerRequest(client:DB,user:Profile,id:string){
 const row=(await client.query(`SELECT r.status,EXISTS(SELECT 1 FROM maridao.service_support s WHERE s.request_id=r.id AND s.status='Aberto') AS support_open FROM maridao.service_requests r WHERE r.id=$1 AND r.customer_id=$2 FOR UPDATE OF r`,[id,user.id])).rows[0];
 if(!row)throw new CompletionError(404,'Atendimento indisponível.');
 if(row.status!=='Em andamento')throw new CompletionError(409,'Esta ação exige um atendimento em andamento.');
 return row;
}
export async function issueCompletionCode(client:DB,user:Profile,id:string,input:unknown){
 validateCustomerAction(user,id);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new CompletionError(400,'Envie somente a confirmação.');
 await client.query('BEGIN');
 try{
  const row=await lockCustomerRequest(client,user,id);
  if(row.support_open)throw new CompletionError(409,'Existe um protocolo aberto. Aguarde a análise antes de confirmar a conclusão.');
  const code=String(randomInt(0,1000000)).padStart(6,'0'),salt=randomBytes(16).toString('hex');
  const result=await client.query(`UPDATE maridao.service_requests SET completion_code_hash=$2,completion_code_salt=$3,completion_code_expires_at=clock_timestamp()+interval '10 minutes',completion_code_attempts=0,completion_authorized_by=$4 WHERE id=$1 RETURNING completion_code_expires_at`,[id,codeDigest(id,salt,code),salt,user.id]);
  await recordEvent(client,id,user,'confirmation_code_issued','Em andamento','Em andamento','Cliente gerou um código de conclusão; valor não armazenado no evento.');
  await client.query('COMMIT');return {code,expiresAt:result.rows[0].completion_code_expires_at};
 }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
}
export type CompletionState={completion_code_hash?:string|null;completion_code_salt?:string|null;completion_code_attempts?:number;code_expired?:boolean;support_open?:boolean};
export async function checkCompletionCode(client:DB,current:CompletionState,id:string,code:string):Promise<CompletionError|null>{
 if(current.support_open)throw new CompletionError(409,'Existe um protocolo de suporte aberto. A conclusão aguarda análise.');
 if(!current.completion_code_hash||!current.completion_code_salt||current.code_expired)throw new CompletionError(409,'Peça ao cliente um novo código de conclusão.');
 if((current.completion_code_attempts??0)>=5)throw new CompletionError(429,'Limite de tentativas atingido. O cliente precisa gerar outro código.');
 const expected=Buffer.from(current.completion_code_hash,'hex'),received=Buffer.from(codeDigest(id,current.completion_code_salt,code),'hex');
 if(expected.length===received.length&&timingSafeEqual(expected,received))return null;
 await client.query('UPDATE maridao.service_requests SET completion_code_attempts=completion_code_attempts+1 WHERE id=$1',[id]);
 return new CompletionError(400,'Código incorreto. Confira com o cliente; após cinco tentativas será necessário gerar outro.');
}
export function validateSupportInput(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new CompletionError(400,'Informe o motivo e o relato.');
 const data=input as Record<string,unknown>;
 if(Object.keys(data).some(key=>!['reason','description'].includes(key))||!['discordancia','nao_realizado'].includes(data.reason as string)||typeof data.description!=='string'||!data.description.trim()||data.description.trim().length>3000)throw new CompletionError(400,'Escolha o motivo e descreva o problema com até 3000 caracteres.');
 return {reason:data.reason as string,description:data.description.trim()};
}
export async function openSupport(client:DB,user:Profile,id:string,input:unknown){
 validateCustomerAction(user,id);const data=validateSupportInput(input);
 await client.query('BEGIN');
 try{
  const row=await lockCustomerRequest(client,user,id);
  if(row.support_open)throw new CompletionError(409,'Já existe um protocolo aberto para este atendimento. Consulte o andamento.');
  const result=await client.query(`INSERT INTO maridao.service_support(request_id,customer_id,reason,description) VALUES($1,$2,$3,$4) RETURNING id,status,created_at`,[id,user.id,data.reason,data.description]);
  await client.query('UPDATE maridao.service_requests SET completion_code_hash=NULL,completion_code_salt=NULL,completion_code_expires_at=NULL WHERE id=$1',[id]);
  await recordEvent(client,id,user,'support_opened','Em andamento','Em andamento',data.reason==='nao_realizado'?'Cliente relatou serviço não realizado.':'Cliente discordou da conclusão.');
  await client.query('COMMIT');return result.rows[0];
 }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
}
export function supportQuery(user:Profile,id:string){
 validateCustomerAction(user,id);
 return {text:`SELECT s.id,s.reason,s.description,s.status,s.created_at,s.resolution,s.resolved_at FROM maridao.service_support s JOIN maridao.service_requests r ON r.id=s.request_id WHERE r.id=$1 AND r.customer_id=$2 AND s.customer_id=$2 ORDER BY s.created_at DESC,s.id DESC LIMIT 20`,values:[id,user.id]};
}
