import type {PoolClient} from 'pg';
import type {Profile} from './auth.ts';
import {validRequestId} from './proposal-validation.ts';
export class CompletionError extends Error{status:number;constructor(status:number,message:string){super(message);this.status=status;}}
type DB=Pick<PoolClient,'query'>;
// A conclusão é confirmada pelo cliente em request-completion.ts; aqui ficam o registro de eventos e o protocolo de suporte,
// que serve só para "serviço não realizado" antes do início do atendimento (pedido "Aceita").
export const supportPermissionSql=(role:Profile['role'])=>`${role==='customer'?'(r.customer_id=$1 AND r.selected_proposal_id IS NOT NULL)':"EXISTS(SELECT 1 FROM maridao.proposals cp WHERE cp.id=r.selected_proposal_id AND cp.provider_id=$1)"} AS can_chat,
 EXISTS(SELECT 1 FROM maridao.service_support support WHERE support.request_id=r.id AND support.status='Aberto') AS support_open,
 ${role==='customer'?"(r.customer_id=$1 AND r.status='Aceita' AND NOT EXISTS(SELECT 1 FROM maridao.service_support mine WHERE mine.request_id=r.id AND mine.status='Aberto'))":'false'} AS can_open_support`;
export async function recordEvent(client:DB,id:string,user:{id:string;role?:string},action:string,previous:string|null,next:string|null,reason:string,related:string|null=null){
 await client.query(`INSERT INTO maridao.request_events(request_id,actor_account_id,actor_kind,action,previous_status,next_status,reason,related_request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,user.id,user.role,action,previous,next,reason,related]);
}
export function validateCustomerAction(user:Profile,id:unknown){
 if(user.role!=='customer')throw new CompletionError(403,'Somente o cliente do pedido pode realizar esta ação.');
 if(!validRequestId(id))throw new CompletionError(400,'Solicitação inválida.');
}
export function validateSupportInput(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new CompletionError(400,'Informe o motivo e o relato.');
 const data=input as Record<string,unknown>;
 if(Object.keys(data).some(key=>!['reason','description'].includes(key))||data.reason!=='nao_realizado'||typeof data.description!=='string'||!data.description.trim()||data.description.trim().length>3000)throw new CompletionError(400,'O protocolo de suporte é para serviço não realizado: descreva o problema com até 3000 caracteres.');
 return {reason:data.reason as string,description:data.description.trim()};
}
export async function openSupport(client:DB,user:Profile,id:string,input:unknown){
 validateCustomerAction(user,id);const data=validateSupportInput(input);
 await client.query('BEGIN');
 try{
  const row=(await client.query(`SELECT r.status,EXISTS(SELECT 1 FROM maridao.service_support s WHERE s.request_id=r.id AND s.status='Aberto') AS support_open FROM maridao.service_requests r WHERE r.id=$1 AND r.customer_id=$2 FOR UPDATE OF r`,[id,user.id])).rows[0];
  if(!row)throw new CompletionError(404,'Atendimento indisponível.');
  if(row.status!=='Aceita')throw new CompletionError(409,row.status==='Em andamento'?'O protocolo de suporte só pode ser aberto antes do início do atendimento. Depois que o prestador registrar a conclusão, você poderá confirmá-la ou contestá-la.':row.status==='Aguardando confirmação'?'O protocolo de suporte só pode ser aberto antes do início do atendimento. Confirme ou conteste a conclusão registrada pelo prestador.':'Esta ação não está disponível nesta etapa do atendimento.');
  if(row.support_open)throw new CompletionError(409,'Já existe um protocolo aberto para este atendimento. Consulte o andamento.');
  const result=await client.query(`INSERT INTO maridao.service_support(request_id,customer_id,reason,description) VALUES($1,$2,$3,$4) RETURNING id,status,created_at`,[id,user.id,data.reason,data.description]);
  await recordEvent(client,id,user,'support_opened',row.status,row.status,'Cliente relatou serviço não realizado.');
  await client.query('COMMIT');return result.rows[0];
 }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
}
export function supportQuery(user:Profile,id:string){
 validateCustomerAction(user,id);
 return {text:`SELECT s.id,s.reason,s.description,s.status,s.created_at,s.resolution,s.resolved_at FROM maridao.service_support s JOIN maridao.service_requests r ON r.id=s.request_id WHERE r.id=$1 AND r.customer_id=$2 AND s.customer_id=$2 ORDER BY s.created_at DESC,s.id DESC LIMIT 20`,values:[id,user.id]};
}
