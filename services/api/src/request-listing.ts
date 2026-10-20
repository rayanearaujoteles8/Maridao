import { bearerToken, tokenHash, databaseAuthStore, type AuthStore, type Profile } from './auth.ts';
import { neighborhoods } from './catalog.ts';
import { matchingCoverage } from './coverage.ts';

export const regionalMembership = JSON.stringify(Object.fromEntries(neighborhoods.map(item=>[item.value,matchingCoverage(item.value)])));
export const providerEligibility=(membershipParameter:string)=>`r.status='Aberta' AND r.city=p.city AND r.state=p.state AND r.category=ANY(p.categories)
     AND (r.neighborhood=ANY(p.neighborhoods) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(${membershipParameter}::jsonb -> r.neighborhood,'[]'::jsonb)) AS area(value)
      WHERE area.value=ANY(p.neighborhoods)))`;
export async function requestListUser(header: string|undefined, store: AuthStore=databaseAuthStore) {
 const token=bearerToken(header);
 return token?store.findSession(tokenHash(token)):undefined;
}
export function listRequestsQuery(user: Profile, query: Record<string,unknown>) {
 if(Object.keys(query).some(key=>key!=='page')) throw new Error('Filtro inválido.');
 const page=query.page??'1';
 if(typeof page!=='string'||!/^\d{1,4}$/.test(page)||Number(page)<1) throw new Error('Página inválida.');
 if(user.role!=='customer'&&user.role!=='provider') throw new Error('Perfil inválido.');
 const fields=`r.id,r.category,r.description,r.neighborhood,r.city,r.state,to_char(r.preferred_date,'YYYY-MM-DD') AS preferred_date,r.preferred_period,r.status,r.created_at`;
 const scope=user.role==='customer'
  ? `FROM maridao.service_requests r WHERE r.customer_id=$1`
  : `FROM maridao.service_requests r JOIN maridao.provider_profiles p ON p.account_id=$1
     WHERE ${providerEligibility('$3')}`;
 return {text:`SELECT ${fields} ${scope} ORDER BY r.created_at DESC,r.id DESC LIMIT 21 OFFSET $2`, values:user.role==='customer'?[user.id,(Number(page)-1)*20]:[user.id,(Number(page)-1)*20,regionalMembership],page:Number(page)};
}
