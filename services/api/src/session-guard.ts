import type {RequestHandler} from 'express';
import {bearerToken,tokenHash,databaseAuthStore,type AuthStore,type Profile} from './auth.ts';

// Rotas sem dados de usuário: liberadas mesmo com sessão restrita.
const open=new Set(['GET /health','GET /catalog']);
// UC10.4 fluxo 2: com senha provisória pendente só é possível consultar a sessão, sair e trocar a senha.
const provisional=new Set(['GET /auth/me','POST /auth/logout','POST /auth/provisional-password']);
export type AccessDenial={error:string;code:'PASSWORD_CHANGE_REQUIRED'|'ADMIN_AREA_ONLY'};
// Sem sessão válida nada é decidido aqui: cada rota continua respondendo o próprio 401.
export function accessDecision(user:Pick<Profile,'role'|'mustChangePassword'>|undefined,method:string,path:string):AccessDenial|null{
 if(!user)return null;
 const normalized=path.toLowerCase().replace(/\/+$/,'')||'/',key=`${method.toUpperCase()} ${normalized}`;
 if(open.has(key))return null;
 if(user.mustChangePassword&&!provisional.has(key))return {error:'Troque a senha provisória para continuar.',code:'PASSWORD_CHANGE_REQUIRED'};
 // RNF02.2: o administrador fica restrito à área administrativa e nunca alcança chat, pedidos ou propostas.
 if(user.role==='admin'&&!normalized.startsWith('/auth/')&&!normalized.startsWith('/admin/')&&key!=='POST /account/password')return {error:'Esta área não está disponível para administradores.',code:'ADMIN_AREA_ONLY'};
 return null;
}
export const sessionGuard=(store:Pick<AuthStore,'findSession'>=databaseAuthStore):RequestHandler=>async(req,res,next)=>{
 const token=bearerToken(req.headers.authorization);
 if(!token){next();return;}
 try{
  const denial=accessDecision(await store.findSession(tokenHash(token)),req.method,req.path);
  if(denial){res.status(403).json(denial);return;}
  next();
 }catch(error){next(error);}
};
