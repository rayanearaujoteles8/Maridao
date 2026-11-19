import {readFileSync} from 'node:fs';
// Apoio aos testes que copiam as tabelas para pg_temp: reaplica ali as regras da migração 014.
const migration=readFileSync(new URL('../migrations/014_customer_confirmed_completion.sql',import.meta.url),'utf8').replace(/^\s*--.*$/gm,'');
export const completionConstraints=()=>migration.split(';').map(sql=>sql.trim()).filter(sql=>sql.startsWith('ALTER TABLE maridao.service_requests')).map(sql=>sql.replaceAll('maridao.','pg_temp.'));
export function completionRoutine(name:'resolve_service_support'|'notify_workflow'){
 const routine=migration.match(new RegExp(`CREATE OR REPLACE FUNCTION maridao\\.${name}\\([\\s\\S]*?\\$\\$;`))?.[0];
 if(!routine)throw new Error(`Função ${name} não encontrada na migração 014.`);
 return routine.replaceAll('maridao.','pg_temp.');
}
