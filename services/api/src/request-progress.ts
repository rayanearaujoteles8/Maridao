import type {PoolClient} from 'pg';
import {checkCompletionCode,recordEvent,type CompletionState} from './customer-confirmation.ts';
import type {Profile} from './auth.ts';
import {validRequestId} from './proposal-validation.ts';
export class ProgressError extends Error {
 status:number;
 constructor(status:number,message:string){super(message);this.status=status;}
}
export type ProgressStatus='Em andamento'|'Concluída';
export const progressUpdateSql = `UPDATE maridao.service_requests SET status=$2::varchar(30),
   started_at=CASE WHEN $2::varchar(30)='Em andamento' THEN clock_timestamp() ELSE started_at END,
   completed_at=CASE WHEN $2::varchar(30)='Concluída' THEN clock_timestamp() ELSE completed_at END,
   completion_code_hash=CASE WHEN $2::varchar(30)='Concluída' THEN NULL ELSE completion_code_hash END,
   completion_code_salt=CASE WHEN $2::varchar(30)='Concluída' THEN NULL ELSE completion_code_salt END,
   completion_code_expires_at=CASE WHEN $2::varchar(30)='Concluída' THEN NULL ELSE completion_code_expires_at END
   WHERE id=$1 AND status=$3 RETURNING id,status,started_at,completed_at`;
export function validateProgress(user:Profile,id:unknown,input:unknown):ProgressStatus{
 if(user.role!=='provider')throw new ProgressError(403,'Somente o prestador escolhido pode atualizar o atendimento.');
 if(!validRequestId(id))throw new ProgressError(400,'Solicitação inválida.');
 if(!input||typeof input!=='object'||Array.isArray(input))throw new ProgressError(400,'Informe a etapa do atendimento.');
 const data=input as Record<string,unknown>;
 if(!Object.hasOwn(data,'status')||!['Em andamento','Concluída'].includes(data.status as string)||Object.keys(data).some(key=>key!=='status'&&(data.status!=='Concluída'||key!=='code')))throw new ProgressError(400,'Escolha iniciar ou concluir o atendimento.');
 if(data.status==='Concluída'&&(typeof data.code!=='string'||!/^\d{6}$/.test(data.code)))throw new ProgressError(400,'Informe o código de seis dígitos fornecido pelo cliente.');
 return data.status as ProgressStatus;
}
export const progressPermissionSql=(role:Profile['role'])=>role==='provider'
 ? `EXISTS (SELECT 1 FROM maridao.proposals chosen WHERE chosen.id=r.selected_proposal_id AND chosen.request_id=r.id AND chosen.provider_id=$1 AND chosen.status='Aceita') AS can_manage`
 : `false AS can_manage`;
export async function updateProgress(client:Pick<PoolClient,'query'>,user:Profile,id:string,input:unknown){
 const target=validateProgress(user,id,input);
 await client.query('BEGIN');let committed=false;
 try{
  const current=(await client.query<{status:string;started_at:string|null;completed_at:string|null}&CompletionState>(
   `SELECT r.status,r.started_at,r.completed_at,r.completion_code_hash,r.completion_code_salt,r.completion_code_attempts,
    COALESCE(r.completion_code_expires_at<=clock_timestamp(),true) AS code_expired,
    EXISTS(SELECT 1 FROM maridao.service_support s WHERE s.request_id=r.id AND s.status='Aberto') AS support_open FROM maridao.service_requests r
    JOIN maridao.proposals chosen ON chosen.id=r.selected_proposal_id AND chosen.request_id=r.id
    WHERE r.id=$1 AND chosen.provider_id=$2 AND chosen.status='Aceita' FOR UPDATE OF r`,[id,user.id])).rows[0];
  if(!current)throw new ProgressError(404,'Atendimento indisponível para esta conta.');
  if(current.status===target){await client.query('COMMIT');return {id,status:current.status,started_at:current.started_at,completed_at:current.completed_at};}
  const previous=target==='Em andamento'?'Aceita':'Em andamento';
  if(current.status!==previous)throw new ProgressError(409,target==='Concluída'?'Inicie o atendimento antes de concluir.':'Este atendimento não pode ser iniciado nesta etapa.');
  if(target==='Concluída'){
   const failure=await checkCompletionCode(client,current,id,(input as {code:string}).code);
   if(failure){await client.query('COMMIT');committed=true;throw failure;}
  }
  const result=await client.query(progressUpdateSql,[id,target,previous]);
  if(result.rowCount!==1)throw new ProgressError(409,'O atendimento mudou. Atualize a lista.');
  if(target==='Concluída')await recordEvent(client,id,user,'service_completed',previous,target,'Conclusão validada com código autorizado pelo cliente.');
  await client.query('COMMIT');return result.rows[0];
 }catch(error){if(!committed){try{await client.query('ROLLBACK');}catch{}}throw error;}
}
