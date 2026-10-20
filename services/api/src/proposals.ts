import {Router} from 'express';
import type {Pool} from 'pg';
import {createDatabasePool} from './database.ts';
import {requestListUser,regionalMembership,providerEligibility} from './request-listing.ts';
import {validateProposal,ProposalInputError,validRequestId} from './proposal-validation.ts';
import {registrationLimit} from './registration-limit.ts';
import type {Profile} from './auth.ts';
export const proposalRoutes=Router();
let pool:Pool|undefined;
export async function closeProposalDatabase(){if(pool)await pool.end();}
export function insertProposalQuery(providerId:string,requestId:string,input:unknown){
 if(!validRequestId(requestId))throw new ProposalInputError({description:'Solicitação inválida.'});
 const data=validateProposal(input);
 return {text:`INSERT INTO maridao.proposals (request_id,provider_id,amount,description,estimated_duration,valid_until)
 SELECT r.id,$1,$4,$5,$6,$7 FROM maridao.service_requests r JOIN maridao.provider_profiles p ON p.account_id=$1
 WHERE r.id=$2 AND ${providerEligibility('$3')} RETURNING id,status`,values:[providerId,requestId,regionalMembership,data.amount,data.description,data.estimatedDuration,data.validUntil]};
}
export function proposalAccessQuery(user:Profile,requestId:string){
 if(!validRequestId(requestId))throw new Error('Solicitação inválida.');
 if(user.role==='customer')return {text:`SELECT r.id,r.category,r.description,r.neighborhood,r.status FROM maridao.service_requests r WHERE r.id=$2 AND r.customer_id=$1`,values:[user.id,requestId]};
 if(user.role!=='provider')throw new Error('Perfil inválido.');
 return {text:`SELECT r.id,r.category,r.description,r.neighborhood,r.status FROM maridao.service_requests r JOIN maridao.provider_profiles p ON p.account_id=$1 WHERE r.id=$2 AND ((${providerEligibility('$3')}) OR EXISTS (SELECT 1 FROM maridao.proposals own WHERE own.request_id=r.id AND own.provider_id=$1))`,values:[user.id,requestId,regionalMembership]};
}
export function listProposalsQuery(user:Profile,requestId:string,page:unknown='1'){
 if(!validRequestId(requestId)||typeof page!=='string'||!/^\d{1,4}$/.test(page)||Number(page)<1||!['customer','provider'].includes(user.role??''))throw new Error('Consulta inválida.');
 return {text:`SELECT o.id,o.amount,o.description,o.estimated_duration,to_char(o.valid_until,'YYYY-MM-DD') AS valid_until,o.status,o.created_at,p.full_name AS provider_name,
 (o.valid_until < (now() AT TIME ZONE 'America/Araguaina')::date) AS expired
 FROM maridao.proposals o JOIN maridao.provider_profiles p ON p.account_id=o.provider_id
 JOIN maridao.service_requests r ON r.id=o.request_id WHERE o.request_id=$1 AND ${user.role==='customer'?'r.customer_id=$2':'o.provider_id=$2'} ORDER BY o.created_at DESC,o.id DESC LIMIT 21 OFFSET $3`,values:[requestId,user.id,(Number(page)-1)*20],page:Number(page)};
}
proposalRoutes.post('/:id/proposals',registrationLimit,async(req,res,next)=>{
 try{
  const user=await requestListUser(req.headers.authorization);
  if(!user){res.status(401).json({error:'Entre na sua conta para continuar.'});return;}
  if(user.role!=='provider'){res.status(403).json({error:'Somente prestadores podem enviar propostas.'});return;}
  if(!req.is('application/json')){res.status(415).json({error:'Envie os dados em JSON.'});return;}
  const query=insertProposalQuery(user.id,req.params.id as string,req.body);
  pool??=createDatabasePool();
  const result=await pool.query(query.text,query.values);
  if(!result.rows.length){res.status(409).json({error:'Esta solicitação não está aberta ou não corresponde aos seus serviços e locais de atendimento.'});return;}
  res.status(201).json({message:'Proposta enviada!',proposal:result.rows[0]});
 }catch(error){
  if(error instanceof ProposalInputError){res.status(400).json({error:error.message,fields:error.fields});return;}
  if(error&&typeof error==='object'&&'code'in error&&error.code==='23505'){res.status(409).json({error:'Você já enviou uma proposta para esta solicitação. Consulte a proposta enviada.'});return;}
  next(error);
 }
});
proposalRoutes.get('/:id/proposals',async(req,res,next)=>{
 try{
  const user=await requestListUser(req.headers.authorization);
  if(!user){res.status(401).json({error:'Entre na sua conta para continuar.'});return;}
  if(!['customer','provider'].includes(user.role??'')){res.status(403).json({error:'Acesso indisponível.'});return;}
  let access,query;
  try{if(Object.keys(req.query).some(key=>key!=='page'))throw new Error();access=proposalAccessQuery(user,req.params.id as string);query=listProposalsQuery(user,req.params.id as string,req.query.page);}catch{res.status(400).json({error:'Confira a solicitação e a página informadas.'});return;}
  pool??=createDatabasePool();
  const request=await pool.query(access.text,access.values);
  if(!request.rows.length){res.status(404).json({error:'Solicitação indisponível.'});return;}
  const result=await pool.query(query.text,query.values);
  res.json({request:request.rows[0],proposals:result.rows.slice(0,20),role:user.role,page:query.page,hasMore:result.rows.length>20});
 }catch(error){next(error);}
});
