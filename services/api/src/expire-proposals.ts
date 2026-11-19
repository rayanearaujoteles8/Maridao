import {createDatabasePool} from './database.ts';
import {expireOverdueProposals} from './proposal-versions.ts';
// npm run proposals:expire — passada manual da expiração das propostas (RN04).
const pool=createDatabasePool();
try{
 let total=0;
 // Cada passada trata até 200 propostas; repete enquanto houver vencidas.
 for(let ids=await expireOverdueProposals(pool);ids.length;ids=ids.length<200?[]:await expireOverdueProposals(pool))total+=ids.length;
 console.log(total?`Propostas com validade vencida marcadas como "Expirada": ${total}.`:'Nenhuma proposta pendente com validade vencida.');
}catch{console.error('Não foi possível aplicar a expiração das propostas. Confira a conexão com PostgreSQL e a migração 015.');process.exitCode=1;}finally{await pool.end();}
