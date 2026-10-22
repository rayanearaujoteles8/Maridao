import type {PoolClient} from 'pg';
import {validRequestId} from './proposal-validation.ts';
import type {Profile} from './auth.ts';
export class AcceptanceError extends Error {
 status:number;
 constructor(status:number,message:string){super(message);this.status=status;}
}
export function validateAcceptance(user:Profile,requestId:unknown,proposalId:unknown,input:unknown){
 if(user.role!=='customer')throw new AcceptanceError(403,'Somente o cliente do pedido pode aceitar uma proposta.');
 if(!validRequestId(requestId)||!validRequestId(proposalId))throw new AcceptanceError(400,'Pedido ou proposta inválidos.');
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new AcceptanceError(400,'Envie apenas a confirmação, sem outros dados.');
}
export async function acceptProposal(client:Pick<PoolClient,'query'>,user:Profile,requestId:string,proposalId:string,input:unknown={}){
 validateAcceptance(user,requestId,proposalId,input);
 await client.query('BEGIN');
 try{
  // Sending and acceptance both lock this row first, so they serialize per request.
  const request=(await client.query<{status:string;selected_proposal_id:string|null}>(
   'SELECT status,selected_proposal_id FROM maridao.service_requests WHERE id=$1 AND customer_id=$2 FOR UPDATE',[requestId,user.id])).rows[0];
  if(!request)throw new AcceptanceError(404,'Solicitação indisponível.');
  if(request.status!=='Aberta'&&request.selected_proposal_id===proposalId){await client.query('COMMIT');return {status:request.status,proposalId};}
  if(request.status!=='Aberta')throw new AcceptanceError(409,'Este pedido já tem uma proposta aceita. Atualize a lista.');
  const proposal=(await client.query<{status:string;expired:boolean}>(
   `SELECT status,(valid_until < (clock_timestamp() AT TIME ZONE 'America/Araguaina')::date) AS expired FROM maridao.proposals WHERE request_id=$1 AND id=$2 FOR UPDATE`,[requestId,proposalId])).rows[0];
  if(!proposal)throw new AcceptanceError(404,'Proposta indisponível para este pedido.');
  if(proposal.status!=='Pendente')throw new AcceptanceError(409,'Esta proposta não está mais pendente. Atualize a lista.');
  if(proposal.expired)throw new AcceptanceError(409,'A validade desta proposta terminou. Escolha uma proposta válida.');
  await client.query(`UPDATE maridao.proposals SET status='Não selecionada' WHERE request_id=$1 AND id<>$2 AND status='Pendente'`,[requestId,proposalId]);
  const chosen=await client.query(`UPDATE maridao.proposals SET status='Aceita' WHERE request_id=$1 AND id=$2 AND status='Pendente'`,[requestId,proposalId]);
  if(chosen.rowCount!==1)throw new AcceptanceError(409,'A proposta mudou. Atualize a lista e tente novamente.');
  const linked=await client.query(`UPDATE maridao.service_requests SET status='Aceita',selected_proposal_id=$2 WHERE id=$1 AND customer_id=$3 AND status='Aberta'`,[requestId,proposalId,user.id]);
  if(linked.rowCount!==1)throw new AcceptanceError(409,'O pedido mudou. Atualize a lista.');
  await client.query('COMMIT');
  return {status:'Aceita',proposalId};
 }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
}
