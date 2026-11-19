import type {PoolClient} from 'pg';
import {validRequestId} from './proposal-validation.ts';
import type {Profile} from './auth.ts';
import {WorkflowError} from './workflow-error.ts';
import {localDateSql,proposalDecision,requestNotOpen} from './proposal-versions.ts';
// Erro das rotas de proposta; "details" leva os campos extras da resposta (code, status...).
export class AcceptanceError extends WorkflowError {}
export function validateAcceptance(user:Profile,requestId:unknown,proposalId:unknown,input:unknown){
 if(user.role!=='customer')throw new AcceptanceError(403,'Somente o cliente do pedido pode aceitar uma proposta.',{code:'PROPOSAL_NOT_ALLOWED'});
 if(!validRequestId(requestId)||!validRequestId(proposalId))throw new AcceptanceError(400,'Pedido ou proposta inválidos.');
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='version')||(!('version' in input)||!Number.isSafeInteger(input.version)||Number(input.version)<1))throw new AcceptanceError(400,'Envie apenas a confirmação, sem outros dados.');
}
export async function acceptProposal(client:Pick<PoolClient,'query'>,user:Profile,requestId:string,proposalId:string,input:unknown={version:1}){
 validateAcceptance(user,requestId,proposalId,input);
 await client.query('BEGIN');
 try{
  // Sending and acceptance both lock this row first, so they serialize per request.
  const request=(await client.query<{status:string;selected_proposal_id:string|null}>(
   'SELECT status,selected_proposal_id FROM maridao.service_requests WHERE id=$1 AND customer_id=$2 FOR UPDATE',[requestId,user.id])).rows[0];
  if(!request)throw new AcceptanceError(404,'Solicitação indisponível.');
  if(request.status!=='Aberta'&&request.selected_proposal_id===proposalId){await client.query('COMMIT');return {status:request.status,proposalId};}
  if(request.status!=='Aberta')throw requestNotOpen('accept',request.status);
  const proposal=(await client.query<{status:string;expired:boolean;version:number}>(
   `SELECT status,version,(valid_until < ${localDateSql()}) AS expired FROM maridao.proposals WHERE request_id=$1 AND id=$2 FOR UPDATE`,[requestId,proposalId])).rows[0];
  if(!proposal)throw new AcceptanceError(404,'Proposta indisponível para este pedido.');
  // RN01: só "Pendente" é aceita; a "Expirada" (gravada) é recusada aqui, antes de comparar a versão.
  proposalDecision('accept','customer',true,proposal.status,request.status);
  if(input&&typeof input==='object'&&'version'in input&&input.version!==proposal.version)throw new AcceptanceError(409,'A proposta foi alterada. Atualize e confira valor, prazo e validade antes de aceitar.',{code:'PROPOSAL_VERSION_CHANGED',status:proposal.status,currentVersion:proposal.version});
  proposalDecision('accept','customer',true,proposal.status,request.status,proposal.expired);
  // RN03 / UC06.3: só as demais pendentes ainda válidas passam a "Não selecionada". Retiradas e expiradas mantêm o próprio status;
  // a pendente com validade vencida ainda não gravada fica para a passada da expiração.
  await client.query(`UPDATE maridao.proposals SET status='Não selecionada' WHERE request_id=$1 AND id<>$2 AND status='Pendente' AND valid_until >= ${localDateSql()}`,[requestId,proposalId]);
  const chosen=await client.query(`UPDATE maridao.proposals SET status='Aceita' WHERE request_id=$1 AND id=$2 AND status='Pendente'`,[requestId,proposalId]);
  if(chosen.rowCount!==1)throw new AcceptanceError(409,'A proposta mudou. Atualize a lista e tente novamente.',{code:'PROPOSAL_CHANGED'});
  const linked=await client.query(`UPDATE maridao.service_requests SET status='Aceita',selected_proposal_id=$2 WHERE id=$1 AND customer_id=$3 AND status='Aberta'`,[requestId,proposalId,user.id]);
  if(linked.rowCount!==1)throw new AcceptanceError(409,'O pedido mudou. Atualize a lista.');
  await client.query('COMMIT');
  return {status:'Aceita',proposalId};
 }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
}
