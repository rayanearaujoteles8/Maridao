import { matchingCoverage, coverageLabel } from './coverage.ts';
import {categorySql,coverageSql} from './catalog-compatibility.ts';
import { Router } from 'express';
import { bearerToken, tokenHash, databaseAuthStore, type AuthStore } from './auth.ts';
import { createDatabasePool } from './database.ts';
import type { Pool } from 'pg';
export const searchRoutes = Router();
let pool: Pool | undefined;
export async function closeSearchDatabase(){if(pool)await pool.end();}
export async function customerAccess(header: string | undefined, store: AuthStore = databaseAuthStore) {
 const token=bearerToken(header);
 if(!token)return 401;
 const user=await store.findSession(tokenHash(token));
 return !user?401:user.role==='customer'?200:403;
}
export function searchQuery(query: Record<string,unknown>) {
 const filter=(name:string)=>{
  const value=query[name];
  if(value===undefined)return '';
  if(typeof value!=='string'||value.length>100)throw new Error('Filtro inválido.');
  return value.trim();
 };
 const category=filter('category'),neighborhood=filter('neighborhood');
 const page=query.page===undefined?'1':query.page;
 if(typeof page!=='string'||!/^\d{1,4}$/.test(page)||Number(page)<1)throw new Error('Página inválida.');
 return {
  text: `SELECT account_id AS id, full_name AS name, categories, specialties, neighborhoods, availability, city, state FROM maridao.provider_profiles WHERE city='Palmas' AND state='TO' AND ($1='' OR EXISTS (SELECT 1 FROM unnest(categories) AS category WHERE strpos(${categorySql('category')},${categorySql('$1')})>0)) AND ($2='' OR EXISTS (SELECT 1 FROM unnest(neighborhoods) AS neighborhood WHERE strpos(lower(neighborhood),lower($2))>0) OR neighborhoods && $4::text[] OR EXISTS (SELECT 1 FROM unnest(neighborhoods) AS location WHERE ${coverageSql('location')}=ANY($4::text[]))) ORDER BY lower(full_name),account_id LIMIT 21 OFFSET $3`,
  values:[category,neighborhood,(Number(page)-1)*20,matchingCoverage(neighborhood)],
  page:Number(page),
 };
}
searchRoutes.get('/',async(req,res,next)=>{
 try{
  const access=await customerAccess(req.headers.authorization);
  if(access!==200){res.status(access).json({error:access===401?'Entre na sua conta para continuar.':'Esta busca está disponível para clientes.'});return;}
  let query;
  try{query=searchQuery(req.query);}catch{res.status(400).json({error:'Confira os filtros de busca.'});return;}
  pool ??= createDatabasePool();
  const result=await pool.query(query.text,query.values);
  res.json({providers:result.rows.slice(0,20).map(row=>({...row,coverageLabels:(row.neighborhoods as string[]).map(coverageLabel)})),page:query.page,hasMore:result.rows.length>20});
 }catch(error){next(error);}
});
