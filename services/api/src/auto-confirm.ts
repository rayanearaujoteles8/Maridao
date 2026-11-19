import {createDatabasePool} from './database.ts';
import {AUTO_CONFIRM_DAYS,autoConfirmOverdue} from './request-completion.ts';
// npm run requests:auto-confirm — passada manual da confirmação automática (RN07).
const pool=createDatabasePool();
try{
 const ids=await autoConfirmOverdue(pool);
 console.log(ids.length?`Conclusões confirmadas automaticamente após ${AUTO_CONFIRM_DAYS} dias sem resposta: ${ids.length}.\n${ids.join('\n')}`:`Nenhuma conclusão aguardando confirmação há ${AUTO_CONFIRM_DAYS} dias ou mais.`);
}catch{console.error('Não foi possível aplicar a confirmação automática. Confira a conexão com PostgreSQL e a migração 014.');process.exitCode=1;}finally{await pool.end();}
