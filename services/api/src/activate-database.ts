import {existsSync,readdirSync,readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const base='C:/Program Files/PostgreSQL';
const installed=existsSync(base)?readdirSync(base).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).map(v=>join(base,v,'bin','psql.exe')).find(p=>existsSync(p)):undefined;
const executable=installed??'psql';
console.log('Aplicando as atualizações 009 a 018 no banco maridao. Informe a senha do usuário postgres no terminal.');
const environment={...process.env};delete environment.PGPASSWORD;
// As migrações avulsas usam \connect. No ativador, todas já usam o banco
// passado em -d: reunir os arquivos evita nova autenticação a cada etapa.
const migrations=fileURLToPath(new URL('../migrations/',import.meta.url));
const entry=readFileSync(join(migrations,'activate_team.sql'),'utf8');
const sql=entry.replace(/^\\ir ([\w.-]+\.sql)\s*$/gm,(_line,name:string)=>
 readFileSync(join(migrations,name),'utf8').replace(/^\\connect[^\r\n]*$/gm,''));
const temporary=mkdtempSync(join(tmpdir(),'maridao-activation-'));
try{
 const script=join(temporary,'activate.sql');
 writeFileSync(script,sql,'utf8');
 const result=spawnSync(executable,['-X','-h',process.env.PGHOST??'127.0.0.1','-p',process.env.PGPORT??'5432','-U','postgres','-d','maridao','-W','-f',script],{stdio:'inherit',env:environment,windowsHide:true});
 if(result.error)console.error('Não foi possível abrir o SQL Shell. Confira se o PostgreSQL está instalado.');
 process.exitCode=result.status??1;
}finally{
 rmSync(temporary,{recursive:true,force:true});
}
