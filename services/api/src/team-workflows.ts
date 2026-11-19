import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Profile} from './auth.ts';
import {validRequestId} from './proposal-validation.ts';
import {WorkflowError} from './workflow-error.ts';
type DB=Pick<PoolClient,'query'>;
export function requireId(id:unknown):asserts id is string {if(!validRequestId(id))throw new WorkflowError(400,'Identificador inválido.');}
export function object(input:unknown,keys:string[]){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))throw new WorkflowError(400,'Confira os campos enviados.');
 return input as Record<string,unknown>;
}
export function text(value:unknown,max:number,label:string){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new WorkflowError(400,`${label}: use de 1 a ${max} caracteres.`);return value.trim();}
export function cursor(value:unknown){if(value===undefined)return null;if(typeof value!=='string'||!/^\d{1,18}$/.test(value)||BigInt(value)<1n)throw new WorkflowError(400,'Página inválida.');return value;}
export function validateReview(input:unknown){const v=object(input,['rating','comment']);if(!Number.isInteger(v.rating)||Number(v.rating)<1||Number(v.rating)>5||typeof v.comment!=='string'||v.comment.trim().length>1000)throw new WorkflowError(400,'Escolha uma nota de 1 a 5 e comentário com até 1000 caracteres.');return {rating:Number(v.rating),comment:v.comment.trim()};}
export async function reviewService(db:DB,user:Profile,id:string,input:unknown){
 requireId(id);if(user.role!=='customer')throw new WorkflowError(403,'Somente o cliente pode avaliar.');const data=validateReview(input);
 await db.query('BEGIN');try{
  const r=(await db.query(`SELECT r.status,p.provider_id FROM maridao.service_requests r LEFT JOIN maridao.proposals p ON p.id=r.selected_proposal_id WHERE r.id=$1 AND r.customer_id=$2 FOR UPDATE OF r`,[id,user.id])).rows[0];
  if(!r)throw new WorkflowError(404,'Atendimento indisponível.');if(r.status!=='Concluída'||!r.provider_id)throw new WorkflowError(409,'A avaliação fica disponível após a conclusão confirmada.');
  const result=await db.query(`INSERT INTO maridao.service_reviews(request_id,customer_id,provider_id,rating,comment) VALUES($1,$2,$3,$4,$5) ON CONFLICT(request_id) DO NOTHING RETURNING id,rating,comment,created_at`,[id,user.id,r.provider_id,data.rating,data.comment]);
  if(!result.rowCount)throw new WorkflowError(409,'Este atendimento já foi avaliado.');await db.query('COMMIT');return result.rows[0];
 }catch(e){await db.query('ROLLBACK');throw e;}
}
// O chat aceita mensagens enquanto o atendimento não foi concluído nem cancelado (inclui "Aguardando confirmação").
export const chatOpen=(status:string)=>['Aceita','Em andamento','Aguardando confirmação'].includes(status);
export async function chatAccess(db:DB,user:Profile,id:string,lock=false){
 requireId(id);
 const r=(await db.query(`SELECT r.id,r.status,r.customer_id,p.provider_id FROM maridao.service_requests r JOIN maridao.proposals p ON p.id=r.selected_proposal_id AND p.request_id=r.id WHERE r.id=$1 AND (r.customer_id=$2 OR p.provider_id=$2)${lock?' FOR UPDATE OF r':''}`,[id,user.id])).rows[0];
 if(!r)throw new WorkflowError(404,'Conversa indisponível.');return r;
}
function chatKey(){const value=process.env.CHAT_ENCRYPTION_KEY;if(!value||! /^[a-f0-9]{64}$/.test(value))throw new WorkflowError(503,'O chat precisa ser configurado no servidor.');return Buffer.from(value,'hex');}
export function encryptMessage(requestId:string,message:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',chatKey(),iv);c.setAAD(Buffer.from(requestId));const encrypted=Buffer.concat([c.update(message,'utf8'),c.final()]);return ['v1',iv.toString('base64'),c.getAuthTag().toString('base64'),encrypted.toString('base64')].join('.');}
export function decryptMessage(requestId:string,payload:string){const [version,iv,tag,body]=payload.split('.');if(version!=='v1'||!iv||!tag||!body)throw Error('Mensagem inválida');const c=createDecipheriv('aes-256-gcm',chatKey(),Buffer.from(iv,'base64'));c.setAAD(Buffer.from(requestId));c.setAuthTag(Buffer.from(tag,'base64'));return Buffer.concat([c.update(Buffer.from(body,'base64')),c.final()]).toString('utf8');}
export async function sendMessage(db:DB,user:Profile,id:string,input:unknown){
 const data=object(input,['clientId','message']);requireId(data.clientId);const message=text(data.message,2000,'Mensagem');
 await db.query('BEGIN');try{
  const r=await chatAccess(db,user,id,true);
  const existing=await db.query('SELECT id,created_at FROM maridao.chat_messages WHERE request_id=$1 AND sender_id=$2 AND client_id=$3',[id,user.id,data.clientId]);
  if(existing.rowCount){await db.query('COMMIT');return existing.rows[0];}
  if(!chatOpen(r.status))throw new WorkflowError(409,'Esta conversa está encerrada para novas mensagens.');
  const result=await db.query('INSERT INTO maridao.chat_messages(request_id,sender_id,client_id,ciphertext) VALUES($1,$2,$3,$4) RETURNING id,created_at',[id,user.id,data.clientId,encryptMessage(id,message)]);
  await db.query('COMMIT');return result.rows[0];
 }catch(e){await db.query('ROLLBACK');throw e;}
}
