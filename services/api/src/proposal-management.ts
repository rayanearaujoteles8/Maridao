import {recordEvent} from './customer-confirmation.ts';
import type {PoolClient} from 'pg';
import type {Profile} from './auth.ts';
import {AcceptanceError} from './proposal-acceptance.ts';
import {validateProposal,validRequestId} from './proposal-validation.ts';
import {localDateSql,proposalDecision,snapshotVersionSql,SUPERSEDED} from './proposal-versions.ts';

export function validateProposalChange(user:Profile,requestId:unknown,proposalId:unknown,input:unknown,withdraw=false){
 if(user.role!=='provider')throw new AcceptanceError(403,'Somente o prestador pode reenviar ou retirar sua proposta.',{code:'PROPOSAL_NOT_ALLOWED'});
 if(!validRequestId(requestId)||!validRequestId(proposalId))throw new AcceptanceError(400,'Pedido ou proposta inválidos.');
 if(!input||typeof input!=='object'||Array.isArray(input))throw new AcceptanceError(400,'Confira os dados da proposta.');
 const {version,...fields}=input as Record<string,unknown>;
 if(!Number.isSafeInteger(version)||Number(version)<1)throw new AcceptanceError(400,'Atualize a proposta antes de continuar.');
 if(withdraw&&Object.keys(fields).length)throw new AcceptanceError(400,'Envie somente a confirmação de retirada.');
 return {version:version as number,data:withdraw?undefined:validateProposal(fields)};
}
// UC05.3: o reenvio grava os novos dados na proposta vigente, que volta a "Pendente" (inclusive a "Expirada"), e incrementa a versão.
export const proposalUpdateSql=`UPDATE maridao.proposals SET amount=$4,description=$5,estimated_duration=$6,valid_until=$7,status='Pendente',version=version+1,updated_at=clock_timestamp()
 WHERE request_id=$1 AND id=$2 AND provider_id=$3 AND status IN ('Pendente','Expirada') AND version=$8
 AND $7::date >= ${localDateSql()} RETURNING id,status,version`;
// UC05.4: a retirada não cria versão; "version" conta só os reenvios.
export const proposalWithdrawSql=`UPDATE maridao.proposals SET status='Retirada',updated_at=clock_timestamp(),withdrawn_at=clock_timestamp()
 WHERE request_id=$1 AND id=$2 AND provider_id=$3 AND status='Pendente' AND version=$4 RETURNING id,status,version`;
// Reenvio (UC05.3) ou retirada (UC05.4) da proposta pelo prestador que a enviou.
export async function changeProposal(client:Pick<PoolClient,'query'>,user:Profile,requestId:string,proposalId:string,input:unknown,withdraw=false){
 const {version,data}=validateProposalChange(user,requestId,proposalId,input,withdraw);
 await client.query('BEGIN');
 try{
  // Competing flows always lock the request before any proposal.
  const request=(await client.query(`SELECT r.status FROM maridao.service_requests r WHERE r.id=$1 AND EXISTS
   (SELECT 1 FROM maridao.proposals o WHERE o.request_id=r.id AND o.id=$2 AND o.provider_id=$3) FOR UPDATE OF r`,[requestId,proposalId,user.id])).rows[0];
  if(!request)throw new AcceptanceError(404,'Proposta indisponível.');
  const proposal=(await client.query(`SELECT status,version,(valid_until < ${localDateSql()}) AS expired FROM maridao.proposals WHERE request_id=$1 AND id=$2 AND provider_id=$3 FOR UPDATE`,[requestId,proposalId,user.id])).rows[0];
  if(!proposal)throw new AcceptanceError(404,'Proposta indisponível.');
  if(withdraw&&proposal.status==='Retirada'){
   await client.query('COMMIT');return {id:proposalId,status:proposal.status,version:proposal.version};
  }
  // RN01 / RN02: recusa informando o status atual da proposta ou do pedido.
  proposalDecision(withdraw?'withdraw':'resend','provider',true,proposal.status,request.status,proposal.expired===true);
  if(proposal.version!==version)throw new AcceptanceError(409,'Esta proposta foi alterada. Atualize a lista e confira os novos dados.',{code:'PROPOSAL_VERSION_CHANGED',status:proposal.status,currentVersion:proposal.version});
  let previous:{version:number;status:string;replaced_at:Date}|undefined;
  if(data){
   // RN02: a versão anterior entra no histórico como "Substituída" antes de a proposta receber os novos dados.
   previous=(await client.query(snapshotVersionSql,[requestId,proposalId,user.id,version])).rows[0];
   if(!previous)throw new AcceptanceError(409,'A proposta mudou. Atualize a lista.',{code:'PROPOSAL_CHANGED'});
  }
  const result=data
   ? await client.query(proposalUpdateSql,[requestId,proposalId,user.id,data.amount,data.description,data.estimatedDuration,data.validUntil,version])
   : await client.query(proposalWithdrawSql,[requestId,proposalId,user.id,version]);
  if(result.rowCount!==1)throw new AcceptanceError(409,'A proposta ou sua validade mudou. Atualize a lista.',{code:'PROPOSAL_CHANGED'});
  await recordEvent(client,requestId,user,withdraw?'proposal_withdrawn':'proposal_resent','Aberta','Aberta',withdraw?'Prestador retirou a própria proposta.':`Prestador reenviou a proposta: a versão ${version} passou a "${SUPERSEDED}" e a versão ${version+1} entrou como "Pendente".`);
  await client.query('COMMIT');
  return previous?{...result.rows[0],previous:{version:previous.version,status:previous.status,replaced_at:previous.replaced_at}}:result.rows[0];
 }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
}
