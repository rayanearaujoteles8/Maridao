import {createInterface} from 'node:readline/promises';
import {readFile,writeFile} from 'node:fs/promises';
import nodemailer from 'nodemailer';
import {smtpSettings} from './mail-delivery.ts';

async function ask(question:string){const reader=createInterface({input:process.stdin,output:process.stdout});try{return(await reader.question(question)).trim();}finally{reader.close();}}
async function secret(){
 return new Promise<string>((resolve,reject)=>{
  const input=process.stdin;let value='';process.stdout.write('Senha de aplicativo/SMTP (não aparece): ');input.setRawMode(true);input.resume();input.setEncoding('utf8');
  const finish=(cancel=false)=>{input.setRawMode(false);input.pause();input.off('data',read);process.stdout.write('\n');cancel?reject(new Error('Cancelado.')):resolve(value);};
  const read=(chunk:string)=>{for(const c of chunk){if(c==='\r'||c==='\n'){finish();return;}if(c==='\u0003'){finish(true);return;}if(c==='\b'||c==='\u007f')value=value.slice(0,-1);else if(c>=' ')value+=c;}};
  input.on('data',read);
 });
}
try{
 if(!process.stdin.isTTY)throw new Error('Abra um terminal interativo para configurar o e-mail.');
 console.log('Configuração do envio SMTP. Não informe sua senha principal do Gmail. Use uma senha de aplicativo.');
 const from=(await ask(`E-mail remetente${process.env.MAIL_FROM?' ['+process.env.MAIL_FROM+']':''}: `))||process.env.MAIL_FROM||'',host=(await ask('Servidor SMTP [smtp.gmail.com]: '))||'smtp.gmail.com';
 const port=(await ask('Porta TLS [465]: '))||'465',user=(await ask('Usuário SMTP [mesmo e-mail]: '))||from;
 let pass=await secret();if(host==='smtp.gmail.com')pass=pass.replace(/\s/g,'');
 const values={MAIL_MODE:'smtp',MAIL_FROM:from,SMTP_HOST:host,SMTP_PORT:port,SMTP_USER:user,SMTP_PASSWORD:pass};
 const transport=nodemailer.createTransport(smtpSettings(values));
 try{await transport.verify();}finally{transport.close();}
 const path=new URL('../.env',import.meta.url);let content=await readFile(path,'utf8');
 for(const [key,value] of Object.entries(values)){
  const line=key+'='+JSON.stringify(value),pattern=new RegExp('^'+key+'=.*$','gm');
  content=pattern.test(content)?content.replace(pattern,()=>line):content.trimEnd()+'\n'+line+'\n';
 }
 await writeFile(path,content,{mode:0o600});
 console.log('Conexão SMTP confirmada e configuração salva no .env local. Nenhum e-mail foi enviado. Reinicie a API e teste Esqueci minha senha com sua própria conta.');
}catch{
 console.error('Configuração não concluída. Confira servidor, porta e credenciais. O modo de envio anterior foi preservado.');process.exitCode=1;
}
