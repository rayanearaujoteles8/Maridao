import {createDatabasePool} from './database.ts';
const pool=createDatabasePool();
try{
 const required={proposals:['version'],service_requests:['completion_code_hash','completion_reported_at','completion_confirmed_by'],accounts:['disabled_at','email_verified_at','must_change_password','deleted_at'],provider_profiles:['approval_status'],admin_profiles:['account_id'],admin_events:['action','actor_kind'],service_reviews:['rating'],chat_messages:['ciphertext'],notifications:['read_at'],account_challenges:['token_hash']};
 const rows=(await pool.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='maridao'")).rows;
 const missing=Object.entries(required).flatMap(([table,columns])=>columns.filter(column=>!rows.some(r=>r.table_name===table&&r.column_name===column)).map(column=>`${table}.${column}`));
 // 013 não cria colunas: confere a permissão de encerrar protocolos e o gatilho de avisos atualizado.
 if(!missing.length){
  const cancel=(await pool.query("SELECT has_column_privilege('maridao.service_support','resolved_by','UPDATE') AS granted,EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='maridao'::regnamespace AND proname='notify_workflow' AND position('013' in prosrc)>0) AS notices")).rows[0];
  if(!cancel.granted||!cancel.notices)missing.push('013_request_cancellation');
  // 014: novo status aceito, permissão de registrar a conclusão, código de quatro dígitos sem escrita e avisos da conclusão.
  const completion=(await pool.query("SELECT has_column_privilege('maridao.service_requests','completion_reported_at','UPDATE') AS granted,NOT has_column_privilege('maridao.service_requests','completion_code_hash','UPDATE') AS retired,EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='maridao.service_requests'::regclass AND conname='service_requests_status_check' AND position('Aguardando confirmação' in pg_get_constraintdef(oid))>0) AS status,EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='maridao'::regnamespace AND proname='notify_workflow' AND position('014' in prosrc)>0) AS notices")).rows[0];
  if(!completion.granted||!completion.retired||!completion.status||!completion.notices)missing.push('014_customer_confirmed_completion');
  // 015: histórico de versões só para leitura e inclusão, status "Expirada" aceito e avisos do reenvio e da expiração.
  const versions=(await pool.query("SELECT to_regclass('maridao.proposal_versions') IS NOT NULL AS created,EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='maridao.proposals'::regclass AND conname='proposals_status_check' AND position('Expirada' in pg_get_constraintdef(oid))>0) AS status,EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='maridao'::regnamespace AND proname='notify_workflow' AND position('015' in prosrc)>0) AS notices")).rows[0];
  const history=versions.created?(await pool.query("SELECT has_table_privilege('maridao.proposal_versions','SELECT') AND has_table_privilege('maridao.proposal_versions','INSERT') AS granted,NOT has_table_privilege('maridao.proposal_versions','UPDATE') AND NOT has_table_privilege('maridao.proposal_versions','DELETE') AS preserved")).rows[0]:{granted:false,preserved:false};
  if(!versions.created||!versions.status||!versions.notices||!history.granted||!history.preserved)missing.push('015_proposal_versions');
  // 016: registro da exclusão pelo próprio cliente (autor sem administrador) e avisos do aceite e do cancelamento revisados.
  const deletion=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='maridao.admin_events'::regclass AND conname='admin_events_actor_check') AS actor,EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='maridao.request_events'::regclass AND tgname='notify_cancellation' AND NOT tgisinternal) AS cancellation,EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='maridao'::regnamespace AND proname='notify_workflow' AND position('016' in prosrc)>0) AS notices")).rows[0];
  if(!deletion.actor||!deletion.cancellation||!deletion.notices)missing.push('016_customer_self_deletion');
 }
 if(missing.length){console.error('Ativação pendente: aplique as migrações 009 a 016 como postgres (npm run db:activate). Itens ausentes: '+missing.join(', '));process.exitCode=1;}
 else{
  console.log('Estrutura das funções da equipe e da área administrativa disponível.');
  const admins=(await pool.query('SELECT count(*)::integer AS count FROM maridao.admin_profiles ad JOIN maridao.accounts a ON a.id=ad.account_id WHERE a.disabled_at IS NULL')).rows[0].count;
  console.log(admins?`Administradores ativos: ${admins}.`:'Nenhum administrador cadastrado. Execute npm run admin:create.');
 }
 console.log(/^([a-f0-9]{64})$/.test(process.env.CHAT_ENCRYPTION_KEY??'')?'Chave do chat configurada.':'Configure CHAT_ENCRYPTION_KEY com 32 bytes aleatórios em hexadecimal.');
 console.log(process.env.MAIL_MODE==='local'&&process.env.NODE_ENV!=='production'?'E-mail em modo de teste local.':'Envio de e-mail não configurado.');
}catch{console.error('Não foi possível verificar a estrutura. Confira a conexão com PostgreSQL.');process.exitCode=1;}finally{await pool.end();}
