import type {PoolClient} from 'pg';
import type {Profile} from './auth.ts';
import {WorkflowError} from './workflow-error.ts';
import {requireId} from './team-workflows.ts';
type DB=Pick<PoolClient,'query'>;
type Party='customer'|'provider';
export type ProposalAction='resend'|'withdraw'|'accept';
export const SUPERSEDED='Substituída';
// Data de referência da validade: o dia em Palmas (mesmo fuso usado no envio da proposta).
export const localDateSql=(moment='clock_timestamp()')=>`(${moment} AT TIME ZONE 'America/Araguaina')::date`;
// A validade já passou, mesmo que a passada da expiração ainda não tenha gravado "Expirada".
export const overdueSql=(alias='o',moment='now()')=>`(${alias}.status='Pendente' AND ${alias}.valid_until < ${localDateSql(moment)})`;
// Contagem de versões: a vigente mais as anteriores guardadas ("Substituída").
export const versionsCountSql=(alias='o')=>`(1+(SELECT count(*) FROM maridao.proposal_versions pv WHERE pv.proposal_id=${alias}.id))::integer`;
// Quando a versão vigente foi enviada: no reenvio que substituiu a anterior ou, sem reenvio, na criação da proposta.
export const versionSentSql=(alias='o')=>`COALESCE((SELECT max(pv.replaced_at) FROM maridao.proposal_versions pv WHERE pv.proposal_id=${alias}.id),${alias}.created_at)`;
// Permissões por papel e status (RN01, RN02) para a lista de propostas do pedido; exige os aliases o (proposta), r (pedido) e p (perfil do autor).
export const proposalPermissionSql=(role:Profile['role'])=>role==='customer'
 ? `false AS can_resend,false AS can_withdraw,(r.status='Aberta' AND o.status='Pendente' AND NOT ${overdueSql()}) AS can_accept`
 : `(r.status='Aberta' AND o.status IN ('Pendente','Expirada') AND p.approval_status='Aprovado') AS can_resend,(r.status='Aberta' AND o.status='Pendente' AND NOT ${overdueSql()}) AS can_withdraw,false AS can_accept`;
const denied={resend:'Somente o prestador que enviou a proposta pode reenviá-la.',withdraw:'Somente o prestador que enviou a proposta pode retirá-la.',accept:'Somente o cliente do pedido pode aceitar uma proposta.'};
// Pedido que não está "Aberta": a resposta leva o status atual do pedido (e o da proposta, quando ela já foi lida).
export const requestNotOpen=(action:ProposalAction,requestStatus:string,proposalStatus?:string)=>new WorkflowError(409,requestStatus==='Cancelada'?'Esta solicitação foi cancelada.':action==='accept'?'Este pedido já tem uma proposta aceita. Atualize a lista.':`A solicitação não está mais aberta (status atual: "${requestStatus}"). Atualize as propostas.`,
 {code:'REQUEST_NOT_OPEN',status:requestStatus,...(proposalStatus?{proposalStatus}:{}),requestStatus});
// UC05.3, UC05.4 e UC06.2: decide se a ação é permitida para o papel, o status da proposta e o status do pedido.
// "mine": o prestador é o autor da proposta; o cliente é o dono do pedido. "overdue": validade vencida ainda não gravada como "Expirada".
export function proposalDecision(action:ProposalAction,party:Party,mine:boolean,proposalStatus:string,requestStatus:string,overdue=false){
 const status=proposalStatus==='Pendente'&&overdue?'Expirada':proposalStatus,details={status,proposalStatus:status,requestStatus};
 if(party!==(action==='accept'?'customer':'provider')||!mine)throw new WorkflowError(403,denied[action],{code:'PROPOSAL_NOT_ALLOWED',...details});
 if(action==='accept'){
  if(requestStatus!=='Aberta')throw requestNotOpen(action,requestStatus,status);
  if(status==='Expirada')throw new WorkflowError(409,'A validade desta proposta terminou. Escolha uma proposta válida.',{code:'PROPOSAL_EXPIRED',...details});
  if(status==='Retirada')throw new WorkflowError(409,'Esta proposta foi retirada pelo prestador e não está mais disponível.',{code:'PROPOSAL_NOT_AVAILABLE',...details});
  if(status!=='Pendente')throw new WorkflowError(409,`Esta proposta não está mais pendente (status atual: "${status}"). Atualize a lista.`,{code:'PROPOSAL_NOT_PENDING',...details});
  return;
 }
 const allowed=action==='resend'?['Pendente','Expirada']:['Pendente'];
 if(!allowed.includes(status))throw new WorkflowError(409,action==='resend'
  ? `O reenvio não é permitido: esta proposta está "${status}". Só é possível reenviar proposta "Pendente" ou "Expirada".`
  : `A retirada não é permitida: esta proposta está "${status}". Só é possível retirar proposta "Pendente".`,{code:action==='resend'?'PROPOSAL_NOT_RESENDABLE':'PROPOSAL_NOT_WITHDRAWABLE',...details});
 if(requestStatus!=='Aberta')throw requestNotOpen(action,requestStatus,status);
}
// RN02: fotografia da versão vigente, gravada como "Substituída" imediatamente antes de a proposta receber os novos dados.
export const snapshotVersionSql=`INSERT INTO maridao.proposal_versions(proposal_id,version,amount,description,estimated_duration,valid_until,status_before,sent_at)
 SELECT o.id,o.version,o.amount,o.description,o.estimated_duration,o.valid_until,o.status,${versionSentSql()} FROM maridao.proposals o
 WHERE o.request_id=$1 AND o.id=$2 AND o.provider_id=$3 AND o.status IN ('Pendente','Expirada') AND o.version=$4 RETURNING version,status,replaced_at`;
const expiredReason='Validade encerrada: proposta expirada automaticamente pelo sistema.';
// RN04. Pedido e proposta são bloqueados juntos e os que estiverem em uso por outra operação são pulados (ficam para a próxima passada),
// então a passada nunca espera nem disputa a ordem de bloqueio das rotas vizinhas. Contas encerradas ficam de fora: o gatilho de conta ativa recusaria a mudança.
export const expireSql=`WITH due AS (SELECT o.id FROM maridao.proposals o JOIN maridao.service_requests r ON r.id=o.request_id
  WHERE o.status='Pendente' AND o.valid_until < ${localDateSql('$1::timestamptz')}
  AND NOT EXISTS(SELECT 1 FROM maridao.accounts a WHERE a.id IN (o.provider_id,r.customer_id) AND a.disabled_at IS NOT NULL)
  ORDER BY o.id LIMIT 200 FOR UPDATE OF r,o SKIP LOCKED),
 done AS (UPDATE maridao.proposals o SET status='Expirada' FROM due WHERE o.id=due.id AND o.status='Pendente' RETURNING o.id,o.request_id),
 logged AS (INSERT INTO maridao.request_events(request_id,actor_account_id,actor_kind,action,previous_status,next_status,reason)
  SELECT done.request_id,NULL,'system','proposal_expired',r.status,r.status,$2 FROM done JOIN maridao.service_requests r ON r.id=done.request_id)
 SELECT id FROM done`;
// Grava "Expirada" em toda proposta pendente cuja validade terminou antes do dia de "now" em Palmas. Um único comando: tudo ou nada.
// "now" existe para os testes. Devolve os ids das propostas expiradas nesta passada.
export async function expireOverdueProposals(db:DB,now:Date=new Date()):Promise<string[]>{
 const result=await db.query<{id:string}>(expireSql,[now.toISOString(),expiredReason]);
 return result.rows.map(row=>row.id);
}
// Passada preguiçosa antes de leituras e ações: uma falha aqui não derruba a rota (o intervalo do servidor tenta de novo).
export async function settleExpired(db:DB){
 try{await expireOverdueProposals(db);}catch{console.error('Não foi possível aplicar a expiração das propostas.');}
}
// UC09.3 / UC06.1: versão vigente e versões anteriores ("Substituída") de uma proposta, da mais recente para a mais antiga.
// Acesso: o prestador autor e o cliente dono do pedido (para o cliente, a proposta retirada deixa de ser exibida — UC05.4).
export async function proposalVersions(db:DB,user:Profile,requestId:string,proposalId:string){
 requireId(requestId);requireId(proposalId);
 if(user.role!=='customer'&&user.role!=='provider')throw new WorkflowError(403,'Acesso indisponível.');
 const current=(await db.query(`SELECT o.id,o.request_id,o.provider_id,p.full_name AS provider_name,o.status,o.version,o.amount,o.description,o.estimated_duration,to_char(o.valid_until,'YYYY-MM-DD') AS valid_until,
  ${versionSentSql()} AS sent_at,o.withdrawn_at,${overdueSql()} AS overdue,r.status AS request_status
  FROM maridao.proposals o JOIN maridao.service_requests r ON r.id=o.request_id JOIN maridao.provider_profiles p ON p.account_id=o.provider_id
  WHERE o.request_id=$1 AND o.id=$2 AND ${user.role==='customer'?"r.customer_id=$3 AND o.status<>'Retirada'":'o.provider_id=$3'}`,[requestId,proposalId,user.id])).rows[0];
 if(!current)throw new WorkflowError(404,'Proposta indisponível.');
 const previous=(await db.query(`SELECT version,amount,description,estimated_duration,to_char(valid_until,'YYYY-MM-DD') AS valid_until,status,status_before,sent_at,replaced_at
  FROM maridao.proposal_versions WHERE proposal_id=$1 ORDER BY version DESC LIMIT 200`,[proposalId])).rows;
 const {amount,description,estimated_duration,valid_until,sent_at,overdue,...proposal}=current,count=previous.length+1;
 return {
  proposal:{...proposal,expired:proposal.status==='Expirada'||overdue,versions_count:count,has_previous_versions:count>1,
   // Edições anteriores à migração 015 não tiveram as versões guardadas.
   missing_previous_versions:proposal.version>count},
  versions:[{version:proposal.version,current:true,status:proposal.status,amount,description,estimated_duration,valid_until,sent_at,replaced_at:null,status_before:null},
   ...previous.map(row=>({...row,current:false}))],
  role:user.role,
 };
}
