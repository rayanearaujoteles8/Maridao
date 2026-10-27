import { Router } from 'express';
import {historyQuery} from './history.ts';
import {CompletionError,issueCompletionCode,openSupport,supportQuery,recordEvent} from './customer-confirmation.ts';
import type {Profile} from './auth.ts';
import type { Pool, PoolClient } from 'pg';
import { bearerToken, tokenHash, databaseAuthStore, type AuthStore } from './auth.ts';
import { createDatabasePool } from './database.ts';
import { RequestInputError, validateRequest } from './request-validation.ts';
import { registrationLimit } from './registration-limit.ts';
import { listRequestsQuery, requestListUser } from './request-listing.ts';
import { categorySql } from './catalog-compatibility.ts';
import { neighborhoodLabel } from './catalog.ts';
import { ProgressError,validateProgress,updateProgress } from './request-progress.ts';
export const requestRoutes=Router();
let pool:Pool|undefined;
export async function closeRequestDatabase(){if(pool)await pool.end();}
export async function requestCustomer(header:string|undefined,store:AuthStore=databaseAuthStore){
 const token=bearerToken(header);
 const user=token?await store.findSession(tokenHash(token)):undefined;
 return {status:!user?401:user.role==='customer'?200:403,user};
}
export function insertRequestQuery(customerId:string,input:unknown){
 const data=validateRequest(input);
 return {text:`INSERT INTO maridao.service_requests (customer_id,category,description,neighborhood,preferred_date,preferred_period) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,category,description,neighborhood,city,state,to_char(preferred_date,'YYYY-MM-DD') AS preferred_date,preferred_period,status,created_at`,values:[customerId,data.category,data.description,data.neighborhood,data.preferredDate,data.preferredPeriod]};
}
// Lock requests in the same order used by proposal sending/acceptance. The
// transaction lock serializes two creations even when no previous request exists.
export async function createRequest(client:Pick<PoolClient,'query'>,customerId:string,input:unknown){
 const insert=insertRequestQuery(customerId,input);
 await client.query('BEGIN');
 try{
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('request-create:' || $1::text,0))",[customerId]);
  const previous=await client.query(`SELECT r.id FROM maridao.service_requests r WHERE r.customer_id=$1 AND ${categorySql('r.category')}=${categorySql('$2::text')} AND r.status='Aberta' AND r.selected_proposal_id IS NULL ORDER BY r.id FOR UPDATE`,[customerId,insert.values[1]]);
  const ids=previous.rows.map(row=>row.id);
  if(ids.length){
   await client.query(`UPDATE maridao.service_requests SET status='Cancelada' WHERE customer_id=$1 AND id=ANY($2::uuid[]) AND status='Aberta' AND selected_proposal_id IS NULL`,[customerId,ids]);
   await client.query(`UPDATE maridao.proposals SET status='Cancelada' WHERE request_id=ANY($1::uuid[]) AND status='Pendente'`,[ids]);
  }
  const result=await client.query(insert.text,insert.values);
  for(const previousId of ids)await recordEvent(client,previousId,{id:customerId,role:'customer'} as Profile,'request_replaced','Aberta','Cancelada','Novo pedido da mesma categoria substituiu o pedido aberto.',result.rows[0].id);
  await client.query('COMMIT');
  return {request:result.rows[0],cancelledCount:ids.length};
 }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
}
for(const kind of ['completion-code','support'] as const){
 requestRoutes.post('/:id/'+kind,registrationLimit,async(req,res,next)=>{
  try{
   const user=await requestListUser(req.headers.authorization);
   if(!user){res.status(401).json({error:'Entre na sua conta para continuar.'});return;}
   if(!req.is('application/json')){res.status(415).json({error:'Envie os dados em JSON.'});return;}
   pool??=createDatabasePool();const client=await pool.connect();
   try{
    const result=kind==='completion-code'?await issueCompletionCode(client,user,req.params.id as string,req.body):await openSupport(client,user,req.params.id as string,req.body);
    res.status(kind==='support'?201:200).json(result);
   }finally{client.release();}
  }catch(error){if(error instanceof CompletionError){res.status(error.status).json({error:error.message});return;}next(error);}
 });
}
requestRoutes.get('/:id/support',async(req,res,next)=>{
 try{
  const user=await requestListUser(req.headers.authorization);
  if(!user){res.status(401).json({error:'Entre na sua conta para continuar.'});return;}
  const query=supportQuery(user,req.params.id as string);pool??=createDatabasePool();
  res.json({protocols:(await pool.query(query.text,query.values)).rows});
 }catch(error){if(error instanceof CompletionError){res.status(error.status).json({error:error.message});return;}next(error);}
});
requestRoutes.get('/history',async(req,res,next)=>{
 try{
  const user=await requestListUser(req.headers.authorization);
  if(!user){res.status(401).json({error:'Entre na sua conta para continuar.'});return;}
  if(!['customer','provider'].includes(user.role??'')){res.status(403).json({error:'Histórico indisponível para este perfil.'});return;}
  let query;try{query=historyQuery(user,req.query);}catch{res.status(400).json({error:'Confira a página informada.'});return;}
  pool??=createDatabasePool();const result=await pool.query(query.text,query.values);
  res.json({requests:result.rows.slice(0,20).map(row=>({...row,neighborhood_label:neighborhoodLabel(row.neighborhood)})),page:query.page,hasMore:result.rows.length>20,role:user.role});
 }catch(error){next(error);}
});
requestRoutes.get('/',async(req,res,next)=>{
 try {
  const user=await requestListUser(req.headers.authorization);
  if(!user){res.status(401).json({error:'Entre na sua conta para continuar.'});return;}
  if(user.role!=='customer'&&user.role!=='provider'){res.status(403).json({error:'Seu perfil não tem acesso às solicitações.'});return;}
  let query;
  try{query=listRequestsQuery(user,req.query);}catch{res.status(400).json({error:'Confira os filtros de consulta.'});return;}
  pool ??= createDatabasePool();
  const result=await pool.query(query.text,query.values);
  res.json({requests:result.rows.slice(0,20).map(row=>({...row,neighborhood_label:neighborhoodLabel(row.neighborhood)})),page:query.page,hasMore:result.rows.length>20,role:user.role});
 }catch(error){next(error);}
});
requestRoutes.post('/:id/status',registrationLimit,async(req,res,next)=>{
 try{
  const user=await requestListUser(req.headers.authorization);
  if(!user){res.status(401).json({error:'Entre na sua conta para continuar.'});return;}
  if(!req.is('application/json')){res.status(415).json({error:'Envie a atualização em JSON.'});return;}
  const id=req.params.id as string;
  validateProgress(user,id,req.body);
  pool??=createDatabasePool();
  const client=await pool.connect();
  try{res.json({request:await updateProgress(client,user,id,req.body)});}finally{client.release();}
 }catch(error){if(error instanceof ProgressError||error instanceof CompletionError){res.status(error.status).json({error:error.message});return;}next(error);}
});
requestRoutes.post('/',registrationLimit,async(req,res,next)=>{
 try{
  const access=await requestCustomer(req.headers.authorization);
  if(access.status!==200||!access.user){res.status(access.status).json({error:access.status===401?'Entre na sua conta para continuar.':'Somente clientes podem criar solicitações.'});return;}
  if(!req.is('application/json')){res.status(415).json({error:'Envie os dados em JSON.'});return;}
  insertRequestQuery(access.user.id,req.body);
  pool ??= createDatabasePool();
  const client=await pool.connect();
  try{res.status(201).json({message:'Solicitação criada com sucesso.',...await createRequest(client,access.user.id,req.body)});}finally{client.release();}
 }catch(error){
  if(error instanceof RequestInputError){res.status(400).json({error:error.message,fields:error.fields});return;}
  next(error);
 }
});
