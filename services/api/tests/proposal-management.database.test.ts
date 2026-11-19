import {readFileSync} from 'node:fs';
import {openSupport,CompletionError,supportQuery} from '../src/customer-confirmation.ts';
import {completionAction} from '../src/request-completion.ts';
import {WorkflowError} from '../src/workflow-error.ts';
import {completionConstraints,completionRoutine} from './temporary-schema.ts';
import {updateProgress,ProgressError} from '../src/request-progress.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
import {createDatabasePool} from '../src/database.ts';
import {changeProposal} from '../src/proposal-management.ts';
import {acceptProposal,AcceptanceError} from '../src/proposal-acceptance.ts';
import {historyQuery} from '../src/history.ts';

// Opt-in; all fixtures and changes are rolled back, including function commits.
test('PostgreSQL: reenvio com histórico, retirada, aceite desatualizado, histórico de 25 registros e isolamento',{skip:process.env.MARIDAO_DB_TEST!=='1'},async()=>{
 const pool=createDatabasePool(),raw=await pool.connect();
 const temporary=process.env.MARIDAO_DB_TEMP==='1';
 const client={query:(text:string,values?:unknown[])=>raw.query(temporary?text.replaceAll('maridao.','pg_temp.'):text,values)};
 try{
  await client.query('BEGIN');
  if(temporary){
   for(const table of ['accounts','customer_profiles','provider_profiles','service_requests','proposals','proposal_versions'])await raw.query(`CREATE TEMP TABLE ${table} (LIKE maridao.${table} INCLUDING ALL) ON COMMIT DROP`);
   await raw.query('ALTER TABLE pg_temp.proposals ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK(version>0), ADD COLUMN IF NOT EXISTS updated_at timestamptz, ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz');
  }
  if(temporary){
   const migration=readFileSync(new URL('../migrations/010_customer_confirmation.sql',import.meta.url),'utf8');
   for(const statement of migration.split(';')){
    const sql=statement.trim();
    if(sql.startsWith('ALTER TABLE maridao.service_requests')||sql.startsWith('UPDATE maridao.service_requests SET status='))await raw.query(sql.replaceAll('maridao.','pg_temp.'));
    if(sql.startsWith('CREATE TABLE IF NOT EXISTS maridao.'))await raw.query(sql.replace('CREATE TABLE','CREATE TEMP TABLE').replaceAll('maridao.','pg_temp.'));
   }
   const routine=migration.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/)?.[0];
   if(routine)await raw.query(routine.replaceAll('maridao.','pg_temp.'));
   // 014: regras do novo status e protocolo de suporte sem o código de quatro dígitos.
   for(const sql of completionConstraints())await raw.query(sql);
   await raw.query(completionRoutine('resolve_service_support'));
  }
  const columns=await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='maridao' AND table_name='proposals' AND column_name IN ('version','updated_at','withdrawn_at')");
  if(!temporary)assert.equal(columns.rows.length,3,'Aplique migrations/009_proposal_management.sql como postgres antes deste teste.');
  const ids=Array.from({length:4},()=>randomUUID()),[customerId,otherCustomerId,providerId,otherProviderId]=ids;
  for(const id of ids)await client.query("INSERT INTO maridao.accounts(id,email,password_hash) VALUES($1,$2,$3)",[id,`${id}@example.invalid`,'ficticio-sem-login-'.repeat(3)]);
  for(const [index,id] of [customerId,otherCustomerId].entries())await client.query("INSERT INTO maridao.customer_profiles(account_id,full_name,phone,cpf,neighborhood) VALUES($1,$2,'63999999999',$3,'Plano Diretor Sul')",[id,`Cliente fictício ${index}`,String(BigInt('0x'+id.replaceAll('-','').slice(0,12))%100000000000n).padStart(11,'0')]);
  for(const [index,id] of [providerId,otherProviderId].entries())await client.query("INSERT INTO maridao.provider_profiles(account_id,full_name,phone,document_type,document_encrypted,document_fingerprint,categories,specialties,neighborhoods,availability) VALUES($1,$2,'63999999999','CPF','v1.fixture',$3,ARRAY['Pintura'],ARRAY['Pintura interna'],ARRAY['Plano Diretor Sul'],'A combinar')",[id,`Prestador fictício ${index}`,id.replaceAll('-','').padEnd(64,'0')]);
  const customer={id:customerId,role:'customer'} as Profile,provider={id:providerId,role:'provider'} as Profile,other={id:otherProviderId,role:'provider'} as Profile;
  const requests:string[]=[],proposals:string[]=[];
  for(let i=0;i<25;i++){
   const r=randomUUID(),p=randomUUID();requests.push(r);proposals.push(p);
   await client.query("INSERT INTO maridao.service_requests(id,customer_id,category,description,neighborhood,created_at) VALUES($1,$2,'Pintura','Pedido fictício','Plano Diretor Sul',$3)",[r,customerId,new Date(Date.UTC(2026,0,1,0,i))]);
   await client.query("INSERT INTO maridao.proposals(id,request_id,provider_id,amount,description,estimated_duration,valid_until) VALUES($1,$2,$3,100,'Proposta fictícia','Um dia','2099-12-31')",[p,r,providerId]);
  }
  const unexpected=randomUUID();await client.query("INSERT INTO maridao.service_requests(id,customer_id,category,description,neighborhood) VALUES($1,$2,'Pintura','Outro cliente','Plano Diretor Sul')",[unexpected,otherCustomerId]);
  // Prevent internal transaction endings from committing the outer fixture.
  const wrapped={query:async(text:string,values?:unknown[])=>{
   if(text==='BEGIN')return client.query('SAVEPOINT business_operation');
   if(text==='COMMIT')return client.query('RELEASE SAVEPOINT business_operation');
   if(text==='ROLLBACK'){await client.query('ROLLBACK TO SAVEPOINT business_operation');return client.query('RELEASE SAVEPOINT business_operation');}
   return client.query(text,values);
  }} as unknown as Pick<PoolClient,'query'>;
  const form={version:1,amount:'250,50',description:'Descrição alterada',estimatedDuration:'Dois dias',validUntil:'2099-12-31'};
  const updated=await changeProposal(wrapped,provider,requests[0]!,proposals[0]!,form);assert.equal(updated.version,2);
  // Lote 4: a edição virou reenvio — a versão anterior fica guardada como "Substituída" e a vigente segue "Pendente" com os novos dados.
  assert.deepEqual((await client.query('SELECT version,amount,description,status,status_before FROM maridao.proposal_versions WHERE proposal_id=$1',[proposals[0]])).rows,[{version:1,amount:'100.00',description:'Proposta fictícia',status:'Substituída',status_before:'Pendente'}]);
  assert.deepEqual((await client.query('SELECT status,version,amount,description FROM maridao.proposals WHERE id=$1',[proposals[0]])).rows[0],{status:'Pendente',version:2,amount:'250.50',description:'Descrição alterada'});
  await assert.rejects(()=>acceptProposal(wrapped,customer,requests[0]!,proposals[0]!,{version:1}),AcceptanceError);
  await assert.rejects(()=>changeProposal(wrapped,other,requests[0]!,proposals[0]!,form),AcceptanceError);
  // A retirada não cria versão nem incrementa "version".
  assert.equal((await changeProposal(wrapped,provider,requests[1]!,proposals[1]!,{version:1},true)).version,1);
  assert.equal((await client.query('SELECT count(*)::integer AS count FROM maridao.proposal_versions WHERE proposal_id=$1',[proposals[1]])).rows[0].count,0);
  for(const version of [1,2])await assert.rejects(()=>acceptProposal(wrapped,customer,requests[1]!,proposals[1]!,{version}),(e:unknown)=>e instanceof WorkflowError&&e.details?.code==='PROPOSAL_NOT_AVAILABLE');
  await acceptProposal(wrapped,customer,requests[0]!,proposals[0]!,{version:2});
  await assert.rejects(()=>changeProposal(wrapped,provider,requests[0]!,proposals[0]!,{...form,version:2}),(e:unknown)=>e instanceof WorkflowError&&e.details?.code==='PROPOSAL_NOT_RESENDABLE'&&e.details?.status==='Aceita');
  await updateProgress(wrapped,provider,requests[0]!,{status:'Em andamento'});
  // A conclusão não é mais validada por código: o prestador registra e o cliente confirma.
  await assert.rejects(()=>updateProgress(wrapped,provider,requests[0]!,{status:'Concluída',code:'3456'}),ProgressError);
  await assert.rejects(()=>completionAction(wrapped,customer,requests[0]!,'confirm',{}),WorkflowError);
  await assert.rejects(()=>completionAction(wrapped,other,requests[0]!,'report',{}),WorkflowError);
  await completionAction(wrapped,provider,requests[0]!,'report',{});
  assert.equal((await client.query('SELECT status FROM maridao.service_requests WHERE id=$1',[requests[0]])).rows[0].status,'Aguardando confirmação');
  await completionAction(wrapped,customer,requests[0]!,'confirm',{});
  const completed=(await client.query('SELECT status,completion_confirmed_by,completed_at FROM maridao.service_requests WHERE id=$1',[requests[0]])).rows[0];
  assert.equal(completed.status,'Concluída');assert.equal(completed.completion_confirmed_by,'customer');assert.ok(completed.completed_at);
  // Protocolo de suporte: só para serviço não realizado, antes do início; enquanto aberto, o atendimento não começa.
  await acceptProposal(wrapped,customer,requests[3]!,proposals[3]!,{version:1});
  await assert.rejects(()=>openSupport(wrapped,customer,requests[3]!,{reason:'discordancia',description:'Motivo que não existe mais.'}),CompletionError);
  const protocol=await openSupport(wrapped,customer,requests[3]!,{reason:'nao_realizado',description:'Prestador não compareceu; atendimento não foi iniciado.'});
  await assert.rejects(()=>openSupport(wrapped,customer,requests[3]!,{reason:'nao_realizado',description:'Segundo relato.'}),CompletionError);
  await assert.rejects(()=>updateProgress(wrapped,provider,requests[3]!,{status:'Em andamento'}),ProgressError);
  const support=supportQuery(customer,requests[3]!);assert.equal((await client.query(support.text,support.values)).rows.length,1);
  await acceptProposal(wrapped,customer,requests[4]!,proposals[4]!,{version:1});
  await updateProgress(wrapped,provider,requests[4]!,{status:'Em andamento'});
  await assert.rejects(()=>openSupport(wrapped,customer,requests[4]!,{reason:'nao_realizado',description:'Depois do início não há protocolo.'}),CompletionError);
  if(temporary){
   await client.query('SELECT maridao.resolve_service_support($1,$2,$3)',[protocol.id,'cancelar','Ausência confirmada no teste fictício.']);
   const absent=(await client.query('SELECT status,started_at,completed_at,selected_proposal_id FROM maridao.service_requests WHERE id=$1',[requests[3]])).rows[0];
   assert.equal(absent.status,'Cancelada');assert.equal(absent.started_at,null);assert.equal(absent.completed_at,null);assert.equal(absent.selected_proposal_id,proposals[3]);
   assert.equal((await client.query(support.text,support.values)).rows[0].status,'Cancelado');
  }
  const events=(await client.query('SELECT action FROM maridao.request_events WHERE request_id=$1 ORDER BY created_at,id',[requests[0]])).rows;
  assert.deepEqual(events.map(e=>e.action),['proposal_resent','completion_reported','completion_confirmed']);
  await client.query("UPDATE maridao.service_requests SET status='Cancelada' WHERE id=$1",[requests[2]]);
  await assert.rejects(()=>changeProposal(wrapped,provider,requests[2]!,proposals[2]!,form),(e:unknown)=>e instanceof WorkflowError&&e.details?.code==='REQUEST_NOT_OPEN'&&e.details?.status==='Cancelada');
  for(const user of [customer,provider]){
   const first=historyQuery(user,{}),second=historyQuery(user,{page:'2'});
   const a=(await client.query(first.text,first.values)).rows,b=(await client.query(second.text,second.values)).rows;
   assert.equal(a.length,21);assert.equal(b.length,5);
   const visible=[...a.slice(0,20),...b];assert.equal(new Set(visible.map(row=>row.id)).size,25);
   assert.ok(!visible.some(row=>row.id===unexpected));assert.ok(visible.some(row=>row.status==='Cancelada'));
   if(user.role==='provider'){assert.ok(visible.some(row=>row.proposal_status==='Retirada'));assert.ok(visible.some(row=>row.proposal_status==='Aceita'));}
  }
  const foreign=historyQuery(other,{});assert.equal((await client.query(foreign.text,foreign.values)).rows.length,0);
 }finally{try{await client.query('ROLLBACK');}finally{raw.release();await pool.end();}}
});
