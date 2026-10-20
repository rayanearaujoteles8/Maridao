import { Router } from 'express';
import type { Pool } from 'pg';
import { bearerToken, tokenHash, databaseAuthStore, type AuthStore } from './auth.ts';
import { createDatabasePool } from './database.ts';
import { RequestInputError, validateRequest } from './request-validation.ts';
import { registrationLimit } from './registration-limit.ts';
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
