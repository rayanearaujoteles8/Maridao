import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabasePool} from '../src/database.ts';
import {progressUpdateSql} from '../src/request-progress.ts';
import {AUTO_CONFIRM_DAYS,autoConfirmSql} from '../src/request-completion.ts';

test('PostgreSQL aceita os tipos dos parâmetros do início e da confirmação automática, sem modificar atendimentos',{skip:!process.env.PGDATABASE},async()=>{
 const pool=createDatabasePool();
 try{
  const start=await pool.query('EXPLAIN '+progressUpdateSql,['00000000-0000-0000-0000-000000000000','Em andamento','Aceita']);
  assert.ok(start.rows.length>0);
  const auto=await pool.query('EXPLAIN '+autoConfirmSql,[new Date().toISOString(),AUTO_CONFIRM_DAYS,'Motivo']);
  assert.ok(auto.rows.length>0);
 }finally{await pool.end();}
});
