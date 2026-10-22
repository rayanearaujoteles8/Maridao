import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabasePool} from '../src/database.ts';
import {providerEligibility,regionalMembership} from '../src/request-listing.ts';

test('PostgreSQL relaciona cadastro antigo de montagem/Taquaralto aos bairros sem ampliar outros serviços',{skip:!process.env.PGDATABASE},async()=>{
 const pool=createDatabasePool();
 try{
  const query=`WITH r AS (SELECT $1::text AS category,$2::text AS neighborhood,$3::text AS status,'Palmas'::text AS city,'TO'::text AS state),
   p AS (SELECT ARRAY[$4::text] AS categories,ARRAY[$5::text] AS neighborhoods,'Palmas'::text AS city,'TO'::text AS state)
   SELECT 1 FROM r CROSS JOIN p WHERE ${providerEligibility('$6')}`;
  for(const [category,neighborhood,status,providerCategory,providerArea,expected] of [
   ['Montagem e desmontagem de móveis','MORADA DO SOL - SETOR 01','Aberta','Montagem de móveis','Taquaralto',true],
   ['Montagem de Móveis','Taquaralto','Aberta','Montagem de móveis','Taquaralto',true],
   ['Montagem de Móveis','Taquaralto','Aberta','Montagem e desmontagem de móveis','REGIAO:TAQUARALTO',true],
   ['Montagem e desmontagem de móveis','MORADA DO SOL - SETOR 03','Aberta','Montagem de móveis',' TAQUARALTO ',true],
   ['Hidráulica e encanamento','MORADA DO SOL - SETOR 01','Aberta','Montagem de móveis','Taquaralto',false],
   ['Montagem e desmontagem de móveis','ARNE 63','Aberta','Montagem de móveis','Taquaralto',false],
   ['Montagem e desmontagem de móveis','MORADA DO SOL - SETOR 01','Aceita','Montagem de móveis','Taquaralto',false],
  ] as const){
   const result=await pool.query(query,[category,neighborhood,status,providerCategory,providerArea,regionalMembership]);
   assert.equal(result.rows.length>0,expected,`${category} / ${neighborhood} / ${status}`);
  }
 }finally{await pool.end();}
});
