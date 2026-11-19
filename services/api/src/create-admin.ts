// npm run admin:create — cadastra o primeiro administrador (não existe autocadastro, RF14.4).
// Usa a mesma conexão da API (maridao_api, do .env): a migração 012 concede INSERT em accounts, admin_profiles e admin_events.
// Nome e e-mail: ADMIN_NAME/ADMIN_EMAIL ou pergunta no terminal. Senha: ADMIN_PASSWORD (uso não interativo) ou pergunta
// sem eco. A senha nunca é impressa, gravada em arquivo nem aceita como argumento. A conta nasce com troca obrigatória.
import {createInterface} from 'node:readline/promises';
import {createDatabasePool} from './database.ts';
import {createAdmin} from './admin.ts';
import {WorkflowError} from './workflow-error.ts';
async function ask(question:string){
 const prompt=createInterface({input:process.stdin,output:process.stdout});
 try{return (await prompt.question(question)).trim();}finally{prompt.close();}
}
function askHidden(question:string){
 return new Promise<string>((resolve,reject)=>{
  const input=process.stdin;let value='';
  process.stdout.write(question);input.setRawMode(true);input.resume();input.setEncoding('utf8');
  const finish=(error?:Error)=>{input.setRawMode(false);input.pause();input.off('data',read);process.stdout.write('\n');if(error)reject(error);else resolve(value);};
  const read=(chunk:string)=>{
   for(const key of chunk){
    if(key==='\r'||key==='\n'||key==='\u0004'){finish();return;}
    if(key==='\u0003'){finish(new Error('Cancelado.'));return;}
    if(key==='\u007f'||key==='\b')value=[...value].slice(0,-1).join('');else if(key>=' ')value+=key;
   }
  };
  input.on('data',read);
 });
}
try{
 if(process.argv.length>2)throw new Error('Este comando não aceita argumentos. Use ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD ou responda às perguntas.');
 const interactive=Boolean(process.stdin.isTTY);
 const missing=['ADMIN_NAME','ADMIN_EMAIL','ADMIN_PASSWORD'].filter(name=>!process.env[name]);
 if(!interactive&&missing.length)throw new Error(`Sem terminal interativo: defina ${missing.join(', ')} no ambiente.`);
 const name=process.env.ADMIN_NAME||await ask('Nome do administrador: ');
 const email=process.env.ADMIN_EMAIL||await ask('E-mail: ');
 let password=process.env.ADMIN_PASSWORD;
 if(!password){
  password=await askHidden('Senha provisória (8 a 128 caracteres, não aparece na tela): ');
  if(await askHidden('Repita a senha: ')!==password)throw new Error('As senhas não conferem.');
 }
 const pool=createDatabasePool(),db=await pool.connect();
 try{
  const admin=await createAdmin(db,null,{name,email,password});
  console.log(`Administrador criado: ${admin.name} <${admin.email}>. A senha é provisória e deverá ser trocada no primeiro acesso.`);
 }finally{db.release();await pool.end();}
}catch(error){
 const fields=error instanceof WorkflowError&&error.status===400&&error.details?.fields;
 const detail=fields&&typeof fields==='object'?' '+Object.entries(fields).map(([field,message])=>`${field}: ${message}`).join(' '):'';
 const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
 console.error('Administrador não criado. '+(error instanceof WorkflowError?error.message+detail
  :code==='42P01'||code==='42703'||code==='42501'?'Aplique a migração 012 como postgres (npm run db:activate).'
  :code?'Não foi possível gravar no banco. Confira a conexão do .env (npm run db:check).'
  :error instanceof Error?error.message:'Erro inesperado.'));
 process.exitCode=1;
}
