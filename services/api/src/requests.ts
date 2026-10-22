import { Router } from 'express';
import type { Pool } from 'pg';
import { bearerToken, tokenHash, databaseAuthStore, type AuthStore } from './auth.ts';
import { createDatabasePool } from './database.ts';
import { RequestInputError, validateRequest } from './request-validation.ts';
import { registrationLimit } from './registration-limit.ts';
import { listRequestsQuery, requestListUser } from './request-listing.ts';
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
 }catch(error){if(error instanceof ProgressError){res.status(error.status).json({error:error.message});return;}next(error);}
});
requestRoutes.post('/',registrationLimit,async(req,res,next)=>{
 try{
  const access=await requestCustomer(req.headers.authorization);
  if(access.status!==200||!access.user){res.status(access.status).json({error:access.status===401?'Entre na sua conta para continuar.':'Somente clientes podem criar solicitações.'});return;}
  if(!req.is('application/json')){res.status(415).json({error:'Envie os dados em JSON.'});return;}
  const query=insertRequestQuery(access.user.id,req.body);
  pool ??= createDatabasePool();
  const result=await pool.query(query.text,query.values);
  res.status(201).json({message:'Solicitação criada com sucesso.',request:result.rows[0]});
 }catch(error){
  if(error instanceof RequestInputError){res.status(400).json({error:error.message,fields:error.fields});return;}
  next(error);
 }
});
