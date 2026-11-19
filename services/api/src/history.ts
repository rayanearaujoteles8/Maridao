import type {Profile} from './auth.ts';
import {cancellationSql} from './request-cancellation.ts';
import {completionSql} from './request-completion.ts';
import {versionsCountSql} from './proposal-versions.ts';
import {customerAuthorSql} from './account-management.ts';
export function historyQuery(user:Profile,query:Record<string,unknown>){
 if(user.role!=='customer'&&user.role!=='provider')throw new Error('Perfil inválido.');
 if(Object.keys(query).some(key=>key!=='page'))throw new Error('Filtro inválido.');
 const page=query.page??'1';
 if(typeof page!=='string'||!/^\d{1,4}$/.test(page)||Number(page)<1)throw new Error('Página inválida.');
 // Provider history contains participation, never unclaimed compatible opportunities.
 const own=user.role==='customer'?'r.customer_id=$1':'o.provider_id=$1';
 const proposal=user.role==='customer'?'o.id=r.selected_proposal_id':'o.provider_id=$1';
 return {text:`SELECT r.id,r.category,r.description,r.neighborhood,r.city,r.state,r.status,r.created_at,r.started_at,r.completed_at,
 to_char(r.preferred_date,'YYYY-MM-DD') AS preferred_date,r.preferred_period,
 o.id AS proposal_id,o.amount AS proposal_amount,o.status AS proposal_status,o.created_at AS proposal_created_at,o.updated_at AS proposal_updated_at,o.withdrawn_at,
 o.version AS proposal_version,CASE WHEN o.id IS NOT NULL THEN ${versionsCountSql()} END AS proposal_versions_count,EXISTS(SELECT 1 FROM maridao.proposal_versions pv WHERE pv.proposal_id=o.id) AS proposal_has_previous_versions,
 ${completionSql(user.role)},${cancellationSql(user.role)}${user.role==='provider'?','+customerAuthorSql():''}
 FROM maridao.service_requests r LEFT JOIN maridao.proposals o ON o.request_id=r.id AND ${proposal}
 WHERE ${own} ORDER BY r.created_at DESC,r.id DESC LIMIT 21 OFFSET $2`,values:[user.id,(Number(page)-1)*20],page:Number(page)};
}
