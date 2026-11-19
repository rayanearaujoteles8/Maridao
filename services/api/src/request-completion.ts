import type {PoolClient} from 'pg';
import type {Profile} from './auth.ts';
import {WorkflowError} from './workflow-error.ts';
import {object,requireId} from './team-workflows.ts';
import {chosenSql,iso} from './request-cancellation.ts';
import {settleExpired} from './proposal-versions.ts';
type DB=Pick<PoolClient,'query'>;
type Party='customer'|'provider';
export type CompletionAction='report'|'confirm'|'contest';
// RN07: único lugar que define o prazo da confirmação automática.
export const AUTO_CONFIRM_DAYS=7;
export const AWAITING='Aguardando confirmação';
const deadlineSql=(column:string)=>`${column}+make_interval(days=>${AUTO_CONFIRM_DAYS})`;
const supportOpenSql=(alias:string)=>`EXISTS(SELECT 1 FROM maridao.service_support ${alias} WHERE ${alias}.request_id=r.id AND ${alias}.status='Aberto')`;
// Permissões por papel e etapa (RN06, RN07, RF08) para lista e detalhe.
export const completionPermissionSql=(role:Profile['role'])=>role==='customer'
 ? `false AS can_start,false AS can_report_completion,(r.customer_id=$1 AND r.status='${AWAITING}') AS can_confirm_completion,(r.customer_id=$1 AND r.status='${AWAITING}') AS can_contest_completion,
 (r.customer_id=$1 AND r.status='Concluída' AND NOT EXISTS(SELECT 1 FROM maridao.service_reviews rv WHERE rv.request_id=r.id)) AS can_review`
 : `(r.status='Aceita' AND ${chosenSql('cs',true)} AND NOT ${supportOpenSql('ss')}) AS can_start,(r.status='Em andamento' AND ${chosenSql('cr',true)} AND NOT ${supportOpenSql('sr')}) AS can_report_completion,
 false AS can_confirm_completion,false AS can_contest_completion,false AS can_review`;
// Datas da conclusão e última contestação; o motivo só é devolvido ao cliente do pedido e ao prestador da proposta escolhida.
export const completionSql=(role:Profile['role'])=>`r.completion_reported_at,CASE WHEN r.status='${AWAITING}' THEN ${deadlineSql('r.completion_reported_at')} END AS completion_deadline_at,r.completion_confirmed_by,
 CASE WHEN ${role==='customer'?'r.customer_id=$1':chosenSql('cq')} THEN (SELECT jsonb_build_object('at',${iso('e.created_at')},'reason',e.reason)
 FROM maridao.request_events e WHERE e.request_id=r.id AND e.action='completion_contested' ORDER BY e.created_at DESC,e.id DESC LIMIT 1) END AS completion_contest`;
const reasonField='Informe o motivo da contestação, com até 500 caracteres.';
export function contestReason(input:unknown){
 const value=object(input,['reason']).reason;
 if(value===undefined||value===null)return '';
 if(typeof value!=='string'||value.trim().length>500)throw new WorkflowError(400,reasonField,{fields:{reason:reasonField}});
 return value.trim();
}
const denied={provider:'Somente o prestador da proposta aceita pode registrar a conclusão.',customer:'Somente o cliente da solicitação pode confirmar ou contestar a conclusão.'};
const notReportable:Record<string,string>={
 Aberta:'A conclusão não pode ser registrada nesta etapa: a solicitação ainda não tem proposta aceita.',
 Aceita:'A conclusão não pode ser registrada nesta etapa: inicie o atendimento primeiro.',
 [AWAITING]:'A conclusão já foi registrada e aguarda a confirmação do cliente.',
 'Concluída':'Este atendimento já foi concluído.',
 Cancelada:'Esta solicitação foi cancelada.',
};
// UC07.3 / UC07.4: decide se a ação é permitida para o papel, a etapa e o motivo informado.
// "mine": o cliente é o dono do pedido; o prestador é o da proposta aceita.
export function completionDecision(action:CompletionAction,party:Party,mine:boolean,status:string,options:{reason?:string;supportOpen?:boolean;overdue?:boolean}={}){
 if(action==='report'){
  if(party!=='provider'||!mine)throw new WorkflowError(403,denied.provider,{code:'COMPLETION_NOT_ALLOWED',status});
  if(status!=='Em andamento')throw new WorkflowError(409,notReportable[status]??'A conclusão não pode ser registrada nesta etapa.',{code:'COMPLETION_NOT_REPORTABLE',status});
  if(options.supportOpen)throw new WorkflowError(409,'Existe um protocolo de suporte aberto. Aguarde a análise antes de registrar a conclusão.',{code:'SUPPORT_OPEN',status});
  return;
 }
 if(party!=='customer'||!mine)throw new WorkflowError(403,denied.customer,{code:'COMPLETION_NOT_ALLOWED',status});
 if(status!==AWAITING)throw new WorkflowError(409,'Esta operação não é permitida nesta etapa: a solicitação não está aguardando confirmação.',{code:'COMPLETION_NOT_PENDING',status});
 if(action==='contest'){
  if(!options.reason)throw new WorkflowError(400,'Informe o motivo da contestação.',{code:'CONTEST_REASON_REQUIRED',status,fields:{reason:'Informe o motivo da contestação.'}});
  if(options.overdue)throw new WorkflowError(409,`O prazo de ${AUTO_CONFIRM_DAYS} dias para contestar terminou. A conclusão será confirmada automaticamente.`,{code:'CONTEST_DEADLINE_PASSED',status});
 }
}
const messages={report:'Conclusão registrada. Aguardando a confirmação do cliente.',confirm:'Conclusão confirmada. Você já pode avaliar o atendimento.',contest:'Contestação registrada. O atendimento voltou para "Em andamento".'};
const events={report:['completion_reported','Prestador registrou a conclusão do atendimento.'],confirm:['completion_confirmed','Cliente confirmou a conclusão do atendimento.'],contest:['completion_contested','']} as const;
const updates={
 report:`UPDATE maridao.service_requests SET status='${AWAITING}',completion_reported_at=clock_timestamp() WHERE id=$1 AND status='Em andamento' RETURNING completion_reported_at,${deadlineSql('completion_reported_at')} AS completion_deadline_at`,
 confirm:`UPDATE maridao.service_requests SET status='Concluída',completed_at=clock_timestamp(),completion_confirmed_by='customer' WHERE id=$1 AND status='${AWAITING}' RETURNING completion_reported_at,completed_at,completion_confirmed_by`,
 contest:`UPDATE maridao.service_requests SET status='Em andamento',completion_reported_at=NULL WHERE id=$1 AND status='${AWAITING}' RETURNING started_at`,
};
// Registrar (prestador), confirmar ou contestar (cliente) a conclusão: bloqueia o pedido, decide, atualiza e registra o evento.
export async function completionAction(db:DB,user:Profile,id:string,action:CompletionAction,input:unknown){
 requireId(id);
 const needed:Party=action==='report'?'provider':'customer';
 if(user.role!==needed)throw new WorkflowError(403,denied[needed],{code:'COMPLETION_NOT_ALLOWED'});
 const reason=action==='contest'?contestReason(input):(object(input,[]),'');
 await db.query('BEGIN');
 try{
  // Mesma ordem das rotas de aceite, andamento e cancelamento: o pedido é bloqueado primeiro.
  const r=(await db.query<{status:string;mine:boolean;support_open:boolean;overdue:boolean|null}>(`SELECT r.status,${needed==='customer'?'(r.customer_id=$1)':chosenSql('cp',true)} AS mine,${supportOpenSql('so')} AS support_open,
   (r.completion_reported_at<=clock_timestamp()-make_interval(days=>${AUTO_CONFIRM_DAYS})) AS overdue FROM maridao.service_requests r
   WHERE r.id=$2 AND (r.customer_id=$1 OR EXISTS(SELECT 1 FROM maridao.proposals o WHERE o.request_id=r.id AND o.provider_id=$1)) FOR UPDATE OF r`,[user.id,id])).rows[0];
  if(!r)throw new WorkflowError(404,'Solicitação indisponível.');
  completionDecision(action,needed,r.mine,r.status,{reason,supportOpen:r.support_open,overdue:r.overdue===true});
  const updated=await db.query(updates[action],[id]);
  if(updated.rowCount!==1)throw new WorkflowError(409,'A solicitação mudou. Atualize a lista.');
  const next=action==='report'?AWAITING:action==='confirm'?'Concluída':'Em andamento';
  const event=(await db.query<{at:string}>(`INSERT INTO maridao.request_events(request_id,actor_account_id,actor_kind,action,previous_status,next_status,reason) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${iso('created_at')} AS at`,
   [id,user.id,needed,events[action][0],r.status,next,action==='contest'?reason:events[action][1]])).rows[0];
  await db.query('COMMIT');
  const extra=action==='contest'?{started_at:updated.rows[0].started_at,completion_reported_at:null,completion_deadline_at:null,completion_contest:{at:event.at,reason}}:action==='confirm'?{...updated.rows[0],completion_deadline_at:null,can_review:true}:updated.rows[0];
  return {message:messages[action],request:{id,status:next,previousStatus:r.status,...extra}};
 }catch(e){try{await db.query('ROLLBACK');}catch{}throw e;}
}
export const autoConfirmSql=`WITH due AS (SELECT r.id FROM maridao.service_requests r WHERE r.status='${AWAITING}' AND r.completion_reported_at<=$1::timestamptz-make_interval(days=>$2::integer) ORDER BY r.id LIMIT 200 FOR UPDATE SKIP LOCKED),
 done AS (UPDATE maridao.service_requests r SET status='Concluída',completed_at=GREATEST(clock_timestamp(),r.completion_reported_at),completion_confirmed_by='system' FROM due WHERE r.id=due.id AND r.status='${AWAITING}' RETURNING r.id)
 INSERT INTO maridao.request_events(request_id,actor_account_id,actor_kind,action,previous_status,next_status,reason) SELECT done.id,NULL,'system','completion_auto_confirmed','${AWAITING}','Concluída',$3 FROM done RETURNING request_id`;
// RN07: confirma, como sistema, toda conclusão registrada há AUTO_CONFIRM_DAYS dias ou mais. Um único comando: tudo ou nada.
// Pedidos bloqueados por outra operação são pulados e ficam para a próxima passada. "now" existe para os testes.
export async function autoConfirmOverdue(db:DB,now:Date=new Date()):Promise<string[]>{
 const result=await db.query<{request_id:string}>(autoConfirmSql,[now.toISOString(),AUTO_CONFIRM_DAYS,`Sem resposta do cliente em ${AUTO_CONFIRM_DAYS} dias: conclusão confirmada automaticamente pelo sistema.`]);
 return result.rows.map(row=>row.request_id);
}
// Passada preguiçosa antes de leituras e ações sobre pedidos: uma falha aqui não derruba a rota (o intervalo do servidor tenta de novo).
// Inclui a expiração das propostas com validade vencida (RN04), que segue a mesma estratégia.
export async function settleOverdue(db:DB){
 try{await autoConfirmOverdue(db);}catch{console.error('Não foi possível aplicar a confirmação automática de conclusões.');}
 await settleExpired(db);
}
