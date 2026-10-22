import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabasePool} from '../src/database.ts';
import {progressUpdateSql} from '../src/request-progress.ts';

test('PostgreSQL aceita os tipos dos parâmetros de início e conclusão, sem modificar atendimentos',{skip:!process.env.PGDATABASE},async()=>{
 const pool=createDatabasePool();
 try{
  for(const [target,previous] of [['Em andamento','Aceita'],['Concluída','Em andamento']]){
   const result=await pool.query('EXPLAIN '+progressUpdateSql,['00000000-0000-0000-0000-000000000000',target,previous]);
   assert.ok(result.rows.length>0);
  }
 }finally{await pool.end();}
});
