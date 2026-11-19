import {Router,type Request,type Response,type NextFunction} from 'express';
import {databaseAuthStore,bearerToken,tokenHash} from './auth.ts';
import {createDatabasePool} from './database.ts';
import {registrationLimit} from './registration-limit.ts';
import {chatLimit} from './chat-limit.ts';
import {WorkflowError} from './workflow-error.ts';
import {InputError} from './customer-validation.ts';
import {ProviderInputError} from './provider-validation.ts';
import {chatAccess,chatOpen,cursor,decryptMessage,requireId,reviewService,sendMessage} from './team-workflows.ts';
import {changePassword,closureStatus,consumeChallenge,customerAuthorSql,customerRemovedSql,deactivateAccount,mailEnabled,replaceProvisionalPassword,requestChallenge,updateProfile,REMOVED_NAME} from './account-management.ts';
import {cancelRequest} from './request-cancellation.ts';
import {completionAction,settleOverdue} from './request-completion.ts';
import {proposalVersions} from './proposal-versions.ts';
import type {Pool,PoolClient} from 'pg';
export const teamRoutes=Router();
let pool:Pool|undefined;
export async function closeTeamDatabase(){if(pool)await pool.end();}
export async function user(req:Request){const token=bearerToken(req.headers.authorization);const result=token?await databaseAuthStore.findSession(tokenHash(token)):null;if(!result)throw new WorkflowError(401,'Entre na sua conta para continuar.');return result;}
export function route(fn:(req:Request,res:Response,db:PoolClient)=>Promise<void>){return async(req:Request,res:Response,next:NextFunction)=>{
 let db:PoolClient|undefined;
 try{if(req.method!=='GET'&&!req.is('application/json'))throw new WorkflowError(415,'Envie os dados em JSON.');pool??=createDatabasePool();db=await pool.connect();await fn(req,res,db);}
 catch(e){if(e instanceof WorkflowError){res.status(e.status).json({error:e.message,...e.details});return;}if(e instanceof InputError||e instanceof ProviderInputError){res.status(400).json({error:e.message,fields:e.fields});return;}next(e);}finally{db?.release();}
};}
teamRoutes.get('/account',route(async(req,res,db)=>{
 const u=await user(req);
 const profile=u.role==='provider'?(await db.query('SELECT full_name AS name,phone,categories,specialties,neighborhoods,availability,city,state FROM maridao.provider_profiles WHERE account_id=$1',[u.id])).rows[0]:(await db.query('SELECT full_name AS name,phone,neighborhood,city,state FROM maridao.customer_profiles WHERE account_id=$1',[u.id])).rows[0];
 const account=(await db.query('SELECT email,email_verified_at FROM maridao.accounts WHERE id=$1',[u.id])).rows[0];res.json({profile:{...profile,...account,role:u.role},mailMode:mailEnabled()?'local':'unconfigured',closure:await closureStatus(db,u)});
}));
teamRoutes.patch('/account',registrationLimit,route(async(req,res,db)=>{await updateProfile(db,await user(req),req.body);res.json({message:'Perfil atualizado.'});}));
teamRoutes.post('/account/password',registrationLimit,route(async(req,res,db)=>{await changePassword(db,await user(req),req.body);res.json({message:'Senha alterada. Entre novamente.'});}));
teamRoutes.post('/account/close',registrationLimit,route(async(req,res,db)=>{const u=await user(req);await settleOverdue(db);res.json(await deactivateAccount(db,u,req.body));}));
teamRoutes.post('/account/verify-email',registrationLimit,route(async(req,res,db)=>{res.json(await requestChallenge(db,req.body,'verify_email',await user(req)));}));
teamRoutes.post('/account/confirm-email',registrationLimit,route(async(req,res,db)=>{await consumeChallenge(db,req.body,'verify_email',await user(req));res.json({message:'E-mail confirmado.'});}));
// UC10.4 fluxo 2: a sessão atual continua válida; as demais são encerradas.
teamRoutes.post('/auth/provisional-password',registrationLimit,route(async(req,res,db)=>{
 const u=await user(req);await replaceProvisionalPassword(db,u,tokenHash(bearerToken(req.headers.authorization)!),req.body);
 res.json({message:'Senha definida. Acesso liberado.',user:{...u,mustChangePassword:false}});
}));
teamRoutes.post('/auth/recovery',registrationLimit,route(async(req,res,db)=>{res.json(await requestChallenge(db,req.body,'password_reset'));}));
teamRoutes.post('/auth/reset-password',registrationLimit,route(async(req,res,db)=>{await consumeChallenge(db,req.body,'password_reset');res.json({message:'Senha redefinida. Entre novamente.'});}));
teamRoutes.get('/requests/:id/review',route(async(req,res,db)=>{
 const u=await user(req),id=req.params.id as string;await settleOverdue(db);await chatAccess(db,u,id);
 res.json({review:(await db.query(`SELECT id,rating,comment,created_at,${customerAuthorSql('customer_id','author')} FROM maridao.service_reviews WHERE request_id=$1`,[id])).rows[0]??null});
}));
teamRoutes.post('/requests/:id/review',registrationLimit,route(async(req,res,db)=>{const u=await user(req);await settleOverdue(db);res.status(201).json({review:await reviewService(db,u,req.params.id as string,req.body)});}));
// UC04.4: cliente do pedido ou prestador da proposta aceita; o motivo é obrigatório depois do aceite.
teamRoutes.post('/requests/:id/cancel',registrationLimit,route(async(req,res,db)=>{const u=await user(req);await settleOverdue(db);res.json(await cancelRequest(db,u,req.params.id as string,req.body));}));
// UC07.3 / UC07.4: o prestador da proposta aceita registra a conclusão; o cliente confirma ou contesta com motivo.
for(const [path,action] of [['','report'],['/confirm','confirm'],['/contest','contest']] as const)
 teamRoutes.post('/requests/:id/completion'+path,registrationLimit,route(async(req,res,db)=>{const u=await user(req);await settleOverdue(db);res.json(await completionAction(db,u,req.params.id as string,action,req.body));}));
// UC09.3 / UC06.1: versão vigente e versões anteriores ("Substituída") de uma proposta, para o prestador autor e o cliente do pedido.
teamRoutes.get('/requests/:id/proposals/:proposalId/versions',route(async(req,res,db)=>{const u=await user(req);await settleOverdue(db);res.json(await proposalVersions(db,u,req.params.id as string,req.params.proposalId as string));}));
teamRoutes.get('/providers/:id/profile',route(async(req,res,db)=>{
 const viewer=await user(req);const id=req.params.id as string;requireId(id);const before=cursor(req.query.before);
 const provider=(await db.query(`SELECT p.account_id AS id,p.full_name AS name,p.categories,p.specialties,p.neighborhoods,p.availability,p.city,p.state,(SELECT round(avg(rating),1) FROM maridao.service_reviews WHERE provider_id=p.account_id) AS rating,(SELECT count(*)::integer FROM maridao.service_reviews WHERE provider_id=p.account_id) AS review_count FROM maridao.provider_profiles p JOIN maridao.accounts a ON a.id=p.account_id WHERE p.account_id=$1 AND a.disabled_at IS NULL AND (p.approval_status='Aprovado' OR p.account_id=$2)`,[id,viewer.id])).rows[0];
 if(!provider)throw new WorkflowError(404,'Perfil indisponível.');
 const page=req.query.page??'1';if(typeof page!=='string'||!/^\d{1,4}$/.test(page)||Number(page)<1||before)throw new WorkflowError(400,'Página inválida.');
 const reviews=(await db.query(`SELECT id,rating,comment,created_at,${customerAuthorSql('customer_id','author')} FROM maridao.service_reviews WHERE provider_id=$1 ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET $2`,[id,(Number(page)-1)*20])).rows;
 res.json({provider,reviews:reviews.slice(0,20),page:Number(page),hasMore:reviews.length>20});
}));
teamRoutes.get('/requests/:id/messages',route(async(req,res,db)=>{
 const u=await user(req),id=req.params.id as string;await settleOverdue(db);const r=await chatAccess(db,u,id),before=cursor(req.query.before);
 const messages=(await db.query('SELECT id,sender_id,ciphertext,created_at FROM maridao.chat_messages WHERE request_id=$1 AND ($2::bigint IS NULL OR id<$2::bigint) ORDER BY id DESC LIMIT 51',[id,before])).rows;
 // A outra parte da conversa: para o cliente, o prestador; para o prestador, o cliente (nome só quando a conta foi excluída).
 const removed=(await db.query<{removed:boolean}>(`SELECT ${customerRemovedSql('$1::uuid')} AS removed`,[r.customer_id])).rows[0].removed;
 const counterpart=u.id===r.customer_id?{role:'provider',removed:false,name:(await db.query('SELECT full_name FROM maridao.provider_profiles WHERE account_id=$1',[r.provider_id])).rows[0]?.full_name??null}:{role:'customer',removed,name:removed?REMOVED_NAME:null};
 res.json({messages:messages.slice(0,50).reverse().map(({ciphertext,sender_id,...m})=>({...m,mine:sender_id===u.id,message:decryptMessage(id,ciphertext)})),hasMore:messages.length>50,canSend:chatOpen(r.status),counterpart});
}));
teamRoutes.post('/requests/:id/messages',chatLimit,route(async(req,res,db)=>{const u=await user(req);await settleOverdue(db);res.status(201).json(await sendMessage(db,u,req.params.id as string,req.body));}));
teamRoutes.get('/notifications',route(async(req,res,db)=>{
 const u=await user(req),before=cursor(req.query.before);
 const result=(await db.query('SELECT id,request_id,title,created_at,read_at FROM maridao.notifications WHERE account_id=$1 AND ($2::bigint IS NULL OR id<$2::bigint) ORDER BY id DESC LIMIT 31',[u.id,before])).rows;
 const unread=(await db.query('SELECT count(*)::integer AS count FROM maridao.notifications WHERE account_id=$1 AND read_at IS NULL',[u.id])).rows[0].count;
 res.json({notifications:result.slice(0,30),hasMore:result.length>30,unread});
}));
teamRoutes.post('/notifications/:id/read',route(async(req,res,db)=>{
 const u=await user(req),id=cursor(req.params.id);const result=await db.query('UPDATE maridao.notifications SET read_at=COALESCE(read_at,clock_timestamp()) WHERE id=$1 AND account_id=$2 RETURNING id,read_at',[id,u.id]);
 if(!result.rowCount)throw new WorkflowError(404,'Notificação indisponível.');res.json(result.rows[0]);
}));
