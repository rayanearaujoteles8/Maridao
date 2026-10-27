import {recordEvent} from './customer-confirmation.ts';
import type {PoolClient} from 'pg';
import type {Profile} from './auth.ts';
import {AcceptanceError} from './proposal-acceptance.ts';
import {validateProposal,validRequestId} from './proposal-validation.ts';

export function validateProposalChange(user:Profile,requestId:unknown,proposalId:unknown,input:unknown,withdraw=false){
 if(user.role!=='provider')throw new AcceptanceError(403,'Somente o prestador pode alterar sua proposta.');
 if(!validRequestId(requestId)||!validRequestId(proposalId))throw new AcceptanceError(400,'Pedido ou proposta inválidos.');
 if(!input||typeof input!=='object'||Array.isArray(input))throw new AcceptanceError(400,'Confira os dados da proposta.');
 const {version,...fields}=input as Record<string,unknown>;
 if(!Number.isSafeInteger(version)||Number(version)<1)throw new AcceptanceError(400,'Atualize a proposta antes de continuar.');
 if(withdraw&&Object.keys(fields).length)throw new AcceptanceError(400,'Envie somente a confirmação de retirada.');
 return {version:version as number,data:withdraw?undefined:validateProposal(fields)};
}
export const proposalUpdateSql=`UPDATE maridao.proposals SET amount=$4,description=$5,estimated_duration=$6,valid_until=$7,version=version+1,updated_at=clock_timestamp()
 WHERE request_id=$1 AND id=$2 AND provider_id=$3 AND status='Pendente' AND version=$8
 AND $7::date >= (clock_timestamp() AT TIME ZONE 'America/Araguaina')::date RETURNING id,status,version`;
export const proposalWithdrawSql=`UPDATE maridao.proposals SET status='Retirada',version=version+1,updated_at=clock_timestamp(),withdrawn_at=clock_timestamp()
 WHERE request_id=$1 AND id=$2 AND provider_id=$3 AND status='Pendente' AND version=$4 RETURNING id,status,version`;
export async function changeProposal(client:Pick<PoolClient,'query'>,user:Profile,requestId:string,proposalId:string,input:unknown,withdraw=false){
 const {version,data}=validateProposalChange(user,requestId,proposalId,input,withdraw);
 await client.query('BEGIN');
 try{
  // Competing flows always lock the request before any proposal.
  const request=(await client.query(`SELECT r.status FROM maridao.service_requests r WHERE r.id=$1 AND EXISTS
   (SELECT 1 FROM maridao.proposals o WHERE o.request_id=r.id AND o.id=$2 AND o.provider_id=$3) FOR UPDATE OF r`,[requestId,proposalId,user.id])).rows[0];
  if(!request)throw new AcceptanceError(404,'Proposta indisponível.');
  if(request.status!=='Aberta')throw new AcceptanceError(409,'O pedido não está mais aberto. Atualize as propostas.');
  const proposal=(await client.query('SELECT status,version FROM maridao.proposals WHERE request_id=$1 AND id=$2 AND provider_id=$3 FOR UPDATE',[requestId,proposalId,user.id])).rows[0];
  if(!proposal)throw new AcceptanceError(404,'Proposta indisponível.');
  if(withdraw&&proposal.status==='Retirada'){
   await client.query('COMMIT');return {id:proposalId,status:proposal.status,version:proposal.version};
  }
  if(proposal.status!=='Pendente')throw new AcceptanceError(409,'Somente uma proposta pendente pode ser alterada ou retirada.');
  if(proposal.version!==version)throw new AcceptanceError(409,'Esta proposta foi alterada. Atualize a lista e confira os novos dados.');
  const result=data
   ? await client.query(proposalUpdateSql,[requestId,proposalId,user.id,data.amount,data.description,data.estimatedDuration,data.validUntil,version])
   : await client.query(proposalWithdrawSql,[requestId,proposalId,user.id,version]);
  if(result.rowCount!==1)throw new AcceptanceError(409,'A proposta ou sua validade mudou. Atualize a lista.');
  await recordEvent(client,requestId,user,withdraw?'proposal_withdrawn':'proposal_edited','Aberta','Aberta',withdraw?'Prestador retirou a própria proposta.':'Prestador atualizou a própria proposta.');
  await client.query('COMMIT');return result.rows[0];
 }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
}
