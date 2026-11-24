import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabasePool} from '../src/database.ts';

// Executa a migração em tabelas e funções temporárias, sem tocar nos cadastros reais.
test('notificações: falha isolada, nova tentativa, entrega única e origem transacional',{skip:process.env.MARIDAO_DB_TEST!=='1'},async()=>{
 const pool=createDatabasePool(),db=await pool.connect();
 try{
  await db.query(`CREATE TEMP TABLE accounts(id uuid PRIMARY KEY);
   CREATE TEMP TABLE service_requests(id uuid PRIMARY KEY);
   CREATE TEMP TABLE provider_profiles(account_id uuid,approval_status text,approval_reason text,approval_decided_at timestamptz,approval_decided_by uuid);
   INSERT INTO provider_profiles VALUES('11111111-1111-4111-8111-111111111111','Aprovado',NULL,NULL,NULL),('22222222-2222-4222-8222-222222222222','Em análise',NULL,NULL,NULL);
   CREATE TEMP TABLE notifications(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,account_id uuid,request_id uuid,title varchar(150),created_at timestamptz,read_at timestamptz,
    CONSTRAINT fail_test CHECK(title<>'Falha simulada'));
   INSERT INTO accounts VALUES('11111111-1111-4111-8111-111111111111');`);
  for(const name of ['notify_workflow','notify_cancellation','notify_provider_approval'])await db.query(`CREATE FUNCTION pg_temp.${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO pg_temp.notifications(account_id,request_id,title) VALUES(NEW.id,NULL,'Novo aviso'); RETURN NEW; END; $$;`);
  const migration=readFileSync(new URL('../migrations/017_notification_delivery.sql',import.meta.url),'utf8')
   .replace(/^\\[^\r\n]*$/gm,'').replaceAll('maridao.','pg_temp.');
  await db.query(migration);
  assert.equal((await db.query("SELECT approval_reason FROM pg_temp.provider_profiles WHERE approval_status='Aprovado'")).rows[0].approval_reason,null);
  await assert.rejects(()=>db.query("UPDATE pg_temp.provider_profiles SET approval_status='Aprovado' WHERE approval_status='Em análise'"),(error:unknown)=>typeof error==='object'&&error!==null&&'code' in error&&error.code==='23514');
  await db.query("UPDATE pg_temp.provider_profiles SET approval_status='Aprovado',approval_reason='Dados conferidos',approval_decided_at=clock_timestamp(),approval_decided_by='11111111-1111-4111-8111-111111111111' WHERE approval_status='Em análise'");
  await db.query("CREATE TRIGGER notify_test AFTER INSERT ON pg_temp.accounts FOR EACH ROW EXECUTE FUNCTION pg_temp.notify_workflow()");
  await db.query('BEGIN');
  await db.query("INSERT INTO accounts VALUES('22222222-2222-4222-8222-222222222222')");
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM pg_temp.notification_outbox')).rows[0].n,1);
  await db.query('ROLLBACK');
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM pg_temp.notification_outbox')).rows[0].n,0);
  await db.query("INSERT INTO pg_temp.notification_outbox(account_id,title) VALUES('11111111-1111-4111-8111-111111111111','Falha simulada'),('11111111-1111-4111-8111-111111111111','Entrega normal')");
  assert.deepEqual((await db.query('SELECT * FROM pg_temp.deliver_notifications(100)')).rows,[{delivered:1,failed:1}]);
  const failed=(await db.query("SELECT attempts,last_error_code,delivered_at,next_attempt_at>clock_timestamp() AS retry FROM pg_temp.notification_outbox WHERE title='Falha simulada'")).rows[0];
  assert.deepEqual(failed,{attempts:1,last_error_code:'23514',delivered_at:null,retry:true});
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM pg_temp.notifications')).rows[0].n,1);
  await db.query('ALTER TABLE pg_temp.notifications DROP CONSTRAINT fail_test');
  await db.query("UPDATE pg_temp.notification_outbox SET next_attempt_at=clock_timestamp() WHERE delivered_at IS NULL");
  assert.deepEqual((await db.query('SELECT * FROM pg_temp.deliver_notifications(100)')).rows,[{delivered:1,failed:0}]);
  assert.deepEqual((await db.query('SELECT * FROM pg_temp.deliver_notifications(100)')).rows,[{delivered:0,failed:0}]);
  // Simula repetição após perda de confirmação do trabalhador: a chave única evita duplicar.
  await db.query('UPDATE pg_temp.notification_outbox SET delivered_at=NULL');
  await db.query('SELECT * FROM pg_temp.deliver_notifications(100)');
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM pg_temp.notifications')).rows[0].n,2);
 }finally{db.release();await pool.end();}
});
