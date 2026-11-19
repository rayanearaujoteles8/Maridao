import type {PoolClient} from 'pg';
import type {Profile} from './auth.ts';
import {WorkflowError} from './workflow-error.ts';
import {object,requireId} from './team-workflows.ts';
import {localDateSql} from './proposal-versions.ts';
type DB=Pick<PoolClient,'query'>;
type Party='customer'|'provider';
export const iso=(column:string)=>`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
export const chosenSql=(alias:string,accepted=false)=>`EXISTS(SELECT 1 FROM maridao.proposals ${alias} WHERE ${alias}.id=r.selected_proposal_id AND ${alias}.request_id=r.id AND ${alias}.provider_id=$1${accepted?` AND ${alias}.status='Aceita'`:''})`;
// RN05: cliente cancela Aberta, Aceita ou Em andamento; o prestador da proposta aceita, Aceita ou Em andamento.
export const cancelPermissionSql=(role:Profile['role'])=>role==='customer'
 ? `(r.customer_id=$1 AND r.status IN ('Aberta','Aceita','Em andamento')) AS can_cancel`
 : `(r.status IN ('Aceita','Em andamento') AND ${chosenSql('cc',true)}) AS can_cancel`;
// RNF02.4: quem cancelou, quando e por quê, lidos do evento registrado (pedidos antigos sem evento ficam com null).
// O motivo só é exibido a quem participa do atendimento: o cliente do pedido e o prestador da proposta escolhida.
export const cancellationSql=(role:Profile['role'])=>`CASE WHEN r.status='Cancelada' THEN (SELECT jsonb_build_object('by',e.actor_kind,'at',${iso('e.created_at')},'action',e.action,
 'reason',CASE WHEN ${role==='customer'?'r.customer_id=$1':chosenSql('cx')} THEN NULLIF(btrim(CASE WHEN e.action='support_cancelled' THEN regexp_replace(e.reason,'^[^:]*: ','') ELSE e.reason END),'') END)
 FROM maridao.request_events e WHERE e.request_id=r.id AND e.next_status='Cancelada' AND e.previous_status IS DISTINCT FROM 'Cancelada' ORDER BY e.created_at DESC,e.id DESC LIMIT 1) END AS cancellation`;
const reasonField='Informe o motivo do cancelamento, com até 500 caracteres.';
export function cancelReason(input:unknown){
 const value=object(input,['reason']).reason;
 if(value===undefined||value===null)return '';
 if(typeof value!=='string'||value.trim().length>500)throw new WorkflowError(400,reasonField,{fields:{reason:reasonField}});
 return value.trim();
}
// UC04.4: decide se o cancelamento é permitido para o papel, a etapa e o motivo informado.
export function cancellationDecision(party:Party,chosen:boolean,status:string,reason:string){
 if(status==='Concluída')throw new WorkflowError(409,'Esta solicitação já foi concluída e não pode mais ser cancelada.',{code:'REQUEST_NOT_CANCELLABLE',status});
 if(status==='Cancelada')throw new WorkflowError(409,'Esta solicitação já foi cancelada.',{code:'REQUEST_NOT_CANCELLABLE',status});
 if(party==='provider'&&!chosen)throw new WorkflowError(403,status==='Aberta'?'O cancelamento não é permitido: a solicitação ainda não tem proposta aceita. Para desistir, retire a sua proposta.':'O cancelamento não é permitido: a proposta aceita nesta solicitação não é a sua.',{code:'CANCEL_NOT_ALLOWED',status});
 // RN05 e 7.5 não preveem cancelamento em "Aguardando confirmação": o cliente confirma ou contesta (e, contestada, a solicitação volta a poder ser cancelada).
 if(status==='Aguardando confirmação')throw new WorkflowError(409,party==='customer'?'Esta solicitação aguarda a sua confirmação da conclusão e não pode ser cancelada nesta etapa. Confirme ou conteste a conclusão.':'Esta solicitação aguarda a confirmação do cliente e não pode ser cancelada nesta etapa.',{code:'REQUEST_NOT_CANCELLABLE',status});
 if(!['Aberta','Aceita','Em andamento'].includes(status)||status==='Aberta'&&party!=='customer')throw new WorkflowError(409,'Esta solicitação não pode ser cancelada nesta etapa.',{code:'REQUEST_NOT_CANCELLABLE',status});
 if(status!=='Aberta'&&!reason)throw new WorkflowError(400,'Informe o motivo do cancelamento.',{code:'CANCEL_REASON_REQUIRED',status,fields:{reason:'Informe o motivo do cancelamento.'}});
}
export async function cancelRequest(db:DB,user:Profile,id:string,input:unknown){
 requireId(id);
 if(user.role!=='customer'&&user.role!=='provider')throw new WorkflowError(403,'Seu perfil não pode cancelar solicitações.');
 const reason=cancelReason(input),party:Party=user.role;
 await db.query('BEGIN');
 try{
  // Mesma ordem das rotas de aceite e andamento: primeiro o pedido, depois as propostas.
  const r=(await db.query<{status:string;selected_proposal_id:string|null;chosen:boolean}>(`SELECT r.status,r.selected_proposal_id,${chosenSql('cp',true)} AS chosen FROM maridao.service_requests r
   WHERE r.id=$2 AND (r.customer_id=$1 OR EXISTS(SELECT 1 FROM maridao.proposals o WHERE o.request_id=r.id AND o.provider_id=$1)) FOR UPDATE OF r`,[user.id,id])).rows[0];
  if(!r)throw new WorkflowError(404,'Solicitação indisponível.');
  cancellationDecision(party,r.chosen,r.status,reason);
  const updated=await db.query(`UPDATE maridao.service_requests SET status='Cancelada' WHERE id=$1 AND status=$2`,[id,r.status]);
  if(updated.rowCount!==1)throw new WorkflowError(409,'A solicitação mudou. Atualize a lista.');
  // 7.5: propostas pendentes viram "Não selecionada"; a aceita segue a regra já usada nos cancelamentos (migração 010).
  // A 7.5 não prevê mudança para a "Expirada": ela mantém o status (a pendente com validade vencida ainda não gravada fica para a passada da expiração).
  await db.query(`UPDATE maridao.proposals SET status='Não selecionada' WHERE request_id=$1 AND status='Pendente' AND valid_until >= ${localDateSql()}`,[id]);
  if(r.selected_proposal_id)await db.query(`UPDATE maridao.proposals SET status='Cancelada' WHERE request_id=$1 AND id=$2 AND status='Aceita'`,[id,r.selected_proposal_id]);
  // Um protocolo de suporte aberto não pode mais ser decidido depois do cancelamento.
  await db.query(`UPDATE maridao.service_support SET status='Cancelado',resolution=$2,resolved_at=clock_timestamp(),resolved_by='sistema' WHERE request_id=$1 AND status='Aberto'`,[id,party==='customer'?'Solicitação cancelada pelo cliente.':'Atendimento cancelado pelo prestador.']);
  const event=(await db.query<{at:string}>(`INSERT INTO maridao.request_events(request_id,actor_account_id,actor_kind,action,previous_status,next_status,reason) VALUES($1,$2,$3,'request_cancelled',$4,'Cancelada',$5) RETURNING ${iso('created_at')} AS at`,[id,user.id,party,r.status,reason])).rows[0];
  await db.query('COMMIT');
  return {message:party==='customer'?'Solicitação cancelada.':'Atendimento cancelado.',request:{id,status:'Cancelada',previousStatus:r.status,cancellation:{by:party,at:event.at,action:'request_cancelled',reason:reason||null}}};
 }catch(e){try{await db.query('ROLLBACK');}catch{}throw e;}
}
