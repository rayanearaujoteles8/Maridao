import nodemailer from 'nodemailer';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
export type Mail={to:string;purpose:'password_reset'|'verify_email';token:string;expiresInMinutes:number};
type Environment=Record<string,string|undefined>;
const address=/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
export function smtpSettings(env:Environment=process.env){
 const host=env.SMTP_HOST?.trim(),port=Number(env.SMTP_PORT),user=env.SMTP_USER?.trim(),pass=env.SMTP_PASSWORD,from=env.MAIL_FROM?.trim();
 if(!host||/[\s/\\]/.test(host)||![465,587].includes(port)||!user||/[\r\n]/.test(user)||!pass||!from||!address.test(from))throw new Error('Configuração SMTP incompleta. Execute npm run mail:configure.');
 return {host,port,secure:port===465,requireTLS:true,auth:{user,pass},from,connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:15_000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true};
}
export function mailMode(env:Environment=process.env):'local'|'smtp'|'unconfigured'{
 if(env.MAIL_MODE==='local'&&env.NODE_ENV!=='production')return 'local';
 if(env.MAIL_MODE==='smtp'){try{smtpSettings(env);return 'smtp';}catch{}}
 return 'unconfigured';
}
export function mailContent(mail:Mail){
 if(!address.test(mail.to)||! /^[a-f0-9]{64}$/.test(mail.token))throw new Error('Mensagem de autenticação inválida.');
 const reset=mail.purpose==='password_reset';
 return {to:mail.to,subject:reset?'Maridão - Recuperar sua senha':'Maridão - Confirmar seu e-mail',text:`${reset?'Recebemos uma solicitação para redefinir sua senha.':'Confirme seu endereço de e-mail no Maridão.'}\n\nCopie este código e cole no aplicativo:\n\n${mail.token}\n\nEle expira em ${mail.expiresInMinutes} minutos e só pode ser usado uma vez. Nunca informe este código a outra pessoa.\n\nSe você não solicitou esta mensagem, ignore-a. Sua senha não será alterada sem o código.\n\nEquipe Maridão`};
}
export async function deliverMail(mail:Mail){
 const mode=mailMode();
 if(mode==='local'){
  const directory=new URL('../.local-mail/',import.meta.url);await mkdir(directory,{recursive:true,mode:0o700});
  await writeFile(new URL(randomBytes(16).toString('hex')+'.json',directory),JSON.stringify(mail,null,2),{mode:0o600,flag:'wx'});return;
 }
 if(mode!=='smtp')throw new Error('Envio de e-mail não configurado.');
 const settings=smtpSettings(),transport=nodemailer.createTransport(settings);
 try{const result=await transport.sendMail({from:{name:'Maridão',address:settings.from},...mailContent(mail)});if(!result.accepted?.length)throw new Error('Mensagem não aceita pelo servidor.');}finally{transport.close();}
}
