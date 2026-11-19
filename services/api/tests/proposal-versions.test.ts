import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PoolClient} from 'pg';
import type {Profile} from '../src/auth.ts';
import {expireOverdueProposals,expireSql,overdueSql,proposalDecision,proposalPermissionSql,proposalVersions,settleExpired,snapshotVersionSql,type ProposalAction} from '../src/proposal-versions.ts';
import {proposalUpdateSql,proposalWithdrawSql} from '../src/proposal-management.ts';
import {acceptProposal} from '../src/proposal-acceptance.ts';
import {settleOverdue} from '../src/request-completion.ts';
import {listProposalsQuery} from '../src/proposals.ts';
import {accessDecision} from '../src/session-guard.ts';
import {WorkflowError} from '../src/workflow-error.ts';
const r='11111111-1111-4111-8111-111111111111',p='22222222-2222-4222-8222-222222222222';
const customer={id:'cliente-da-sessao',role:'customer'} as Profile,provider={id:'prestador-da-sessao',role:'provider'} as Profile;
const failure=(status:number,code?:string,current?:string)=>(e:unknown)=>e instanceof WorkflowError&&e.status===status&&(code===undefined||e.details?.code===code)&&(current===undefined||e.details?.status===current);
function scripted(steps:{match:RegExp;rows?:unknown[];rowCount?:number}[]){
 const commands:{sql:string;values?:unknown[]}[]=[];let index=0;
 const client={query:async(sql:string,values?:unknown[])=>{const step=steps[index++];assert.ok(step,`consulta inesperada: ${sql}`);assert.match(sql,step.match);commands.push({sql,values});return {rows:step.rows??[],rowCount:step.rowCount??step.rows?.length??0};}} as unknown as Pick<PoolClient,'query'>;
 return {client,commands,done:()=>assert.equal(index,steps.length)};
}
const proposalStatuses=['Pendente','Expirada','Aceita','Não selecionada','Retirada','Cancelada','Substituída'];
const requestStatuses=['Aberta','Aceita','Em andamento','Aguardando confirmação','Concluída','Cancelada'];

test('matriz status da proposta × status do pedido × papel no reenvio, na retirada e no aceite (RN01, RN02)',()=>{
 const permitted:Record<ProposalAction,string[]>={resend:['Pendente','Expirada'],withdraw:['Pendente'],accept:['Pendente']};
 const refused:Record<ProposalAction,string>={resend:'PROPOSAL_NOT_RESENDABLE',withdraw:'PROPOSAL_NOT_WITHDRAWABLE',accept:'PROPOSAL_NOT_PENDING'};
 for(const action of ['resend','withdraw','accept'] as const)for(const proposal of proposalStatuses)for(const request of requestStatuses){
  const actor=action==='accept'?'customer':'provider',other=action==='accept'?'provider':'customer';
  const run=(party:'customer'|'provider',mine:boolean)=>()=>proposalDecision(action,party,mine,proposal,request);
  // Papel errado ou proposta/pedido de outra pessoa: 403 em qualquer combinação de status.
  assert.throws(run(other,true),failure(403,'PROPOSAL_NOT_ALLOWED'));assert.throws(run(actor,false),failure(403,'PROPOSAL_NOT_ALLOWED'));
  if(permitted[action].includes(proposal)&&request==='Aberta'){assert.doesNotThrow(run(actor,true));continue;}
  // Aceite: pedido que não está "Aberta" é recusado antes de olhar a proposta; reenvio e retirada informam primeiro o status da proposta.
  const byRequest=request!=='Aberta'&&(action==='accept'||permitted[action].includes(proposal));
  const code=byRequest?'REQUEST_NOT_OPEN':action==='accept'&&proposal==='Expirada'?'PROPOSAL_EXPIRED':action==='accept'&&proposal==='Retirada'?'PROPOSAL_NOT_AVAILABLE':refused[action];
  assert.throws(run(actor,true),(e:unknown)=>failure(409,code,byRequest?request:proposal)(e)&&(e as WorkflowError).details?.proposalStatus===proposal&&(e as WorkflowError).details?.requestStatus===request,`${action} ${proposal} ${request}`);
 }
});

test('validade vencida ainda não gravada vale como "Expirada": reenvia, mas não retira nem aceita',()=>{
 assert.doesNotThrow(()=>proposalDecision('resend','provider',true,'Pendente','Aberta',true));
 assert.throws(()=>proposalDecision('withdraw','provider',true,'Pendente','Aberta',true),(e:unknown)=>failure(409,'PROPOSAL_NOT_WITHDRAWABLE','Expirada')(e)&&/"Expirada"/.test((e as WorkflowError).message));
 assert.throws(()=>proposalDecision('accept','customer',true,'Pendente','Aberta',true),failure(409,'PROPOSAL_EXPIRED','Expirada'));
 // "overdue" só muda a leitura da pendente.
 assert.throws(()=>proposalDecision('resend','provider',true,'Aceita','Aberta',true),failure(409,'PROPOSAL_NOT_RESENDABLE','Aceita'));
 // As mensagens informam o status atual (UC05.3 exceção 2, UC05.4 exceção 2).
 assert.throws(()=>proposalDecision('resend','provider',true,'Retirada','Aberta'),/esta proposta está "Retirada"/);
 assert.throws(()=>proposalDecision('withdraw','provider',true,'Não selecionada','Aberta'),/esta proposta está "Não selecionada"/);
 assert.throws(()=>proposalDecision('resend','provider',true,'Expirada','Em andamento'),/status atual: "Em andamento"/);
 assert.throws(()=>proposalDecision('resend','provider',true,'Expirada','Cancelada'),/foi cancelada/);
});

test('regra da expiração: só pendente com validade anterior ao dia de Palmas, como sistema e com "agora" injetável (RN04)',async()=>{
 assert.match(expireSql,/o\.status='Pendente' AND o\.valid_until < \(\$1::timestamptz AT TIME ZONE 'America\/Araguaina'\)::date/);
 // Pedido e proposta bloqueados juntos, sem esperar por quem está em uso; contas encerradas ficam de fora.
 assert.match(expireSql,/FOR UPDATE OF r,o SKIP LOCKED/);assert.match(expireSql,/disabled_at IS NOT NULL/);
 assert.match(expireSql,/SET status='Expirada'[\s\S]*AND o\.status='Pendente'/);assert.match(expireSql,/NULL,'system','proposal_expired',r\.status,r\.status,\$2/);
 // 23h59 de 19/11 em Palmas (UTC-3) ainda é dia 19; um minuto depois já é dia 20. A data é decidida pelo banco a partir do instante informado.
 const now=new Date('2026-11-20T02:59:00.000Z'),d=scripted([{match:/^WITH due AS/,rows:[{id:'a'},{id:'b'}]}]);
 assert.deepEqual(await expireOverdueProposals(d.client,now),['a','b']);d.done();
 assert.equal(d.commands[0]!.values?.[0],now.toISOString());assert.match(String(d.commands[0]!.values?.[1]),/expirada automaticamente pelo sistema/);
 // Sem "agora" informado usa o relógio; nada vencido devolve lista vazia.
 const before=Date.now(),clock=scripted([{match:/^WITH due AS/}]);assert.deepEqual(await expireOverdueProposals(clock.client),[]);
 const used=Date.parse(String(clock.commands[0]!.values?.[0]));assert.ok(used>=before&&used<=Date.now());
 // A passada preguiçosa nunca derruba a rota e roda junto da confirmação automática.
 const error=console.error;console.error=()=>{};
 try{await assert.doesNotReject(()=>settleExpired({query:async()=>{throw new Error('banco fora');}} as unknown as Pick<PoolClient,'query'>));}finally{console.error=error;}
 const both=scripted([{match:/completion_auto_confirmed/},{match:/proposal_expired/}]);await settleOverdue(both.client);both.done();
});

test('reenvio, retirada e aceite só gravam nos status permitidos; expiradas não viram "Não selecionada" (RN03)',async()=>{
 assert.match(proposalUpdateSql,/status='Pendente',version=version\+1[\s\S]*status IN \('Pendente','Expirada'\) AND version=\$8[\s\S]*\$7::date >= /);
 assert.match(proposalWithdrawSql,/status='Pendente' AND version=\$4/);assert.ok(!proposalWithdrawSql.includes('version=version+1'));
 assert.match(snapshotVersionSql,/INSERT INTO maridao\.proposal_versions[\s\S]*o\.provider_id=\$3 AND o\.status IN \('Pendente','Expirada'\) AND o\.version=\$4/);
 // Aceite com outra proposta expirada no pedido: só as pendentes ainda válidas mudam.
 const d=scripted([{match:/^BEGIN$/},{match:/customer_id=\$2 FOR UPDATE/,rows:[{status:'Aberta',selected_proposal_id:null}]},{match:/request_id=\$1 AND id=\$2 FOR UPDATE/,rows:[{status:'Pendente',expired:false,version:1}]},
  {match:/SET status='Não selecionada' WHERE request_id=\$1 AND id<>\$2 AND status='Pendente' AND valid_until >= \(clock_timestamp\(\) AT TIME ZONE 'America\/Araguaina'\)::date/},{match:/SET status='Aceita'/,rowCount:1},{match:/selected_proposal_id=\$2/,rowCount:1},{match:/^COMMIT$/}]);
 await acceptProposal(d.client,customer,r,p,{version:1});d.done();
 // Proposta "Expirada" gravada: recusada antes de comparar a versão, sem nenhuma gravação.
 for(const version of [1,7]){
  const expired=scripted([{match:/^BEGIN$/},{match:/customer_id=\$2 FOR UPDATE/,rows:[{status:'Aberta',selected_proposal_id:null}]},{match:/FOR UPDATE/,rows:[{status:'Expirada',expired:true,version:1}]},{match:/^ROLLBACK$/}]);
  await assert.rejects(()=>acceptProposal(expired.client,customer,r,p,{version}),failure(409,'PROPOSAL_EXPIRED','Expirada'));expired.done();
 }
 const cancelled=scripted([{match:/^BEGIN$/},{match:/customer_id=\$2 FOR UPDATE/,rows:[{status:'Cancelada',selected_proposal_id:null}]},{match:/^ROLLBACK$/}]);
 await assert.rejects(()=>acceptProposal(cancelled.client,customer,r,p,{version:1}),(e:unknown)=>failure(409,'REQUEST_NOT_OPEN','Cancelada')(e)&&/cancelada/.test((e as WorkflowError).message));cancelled.done();
});

test('permissões por papel na lista de propostas: can_resend, can_withdraw e can_accept',()=>{
 const forProvider=proposalPermissionSql('provider'),forCustomer=proposalPermissionSql('customer');
 assert.match(forProvider,/\(r\.status='Aberta' AND o\.status IN \('Pendente','Expirada'\) AND p\.approval_status='Aprovado'\) AS can_resend/);
 assert.match(forProvider,/\(r\.status='Aberta' AND o\.status='Pendente' AND NOT \(o\.status='Pendente' AND o\.valid_until < .*\)\) AS can_withdraw,false AS can_accept$/);
 assert.match(forCustomer,/^false AS can_resend,false AS can_withdraw,\(r\.status='Aberta' AND o\.status='Pendente' AND NOT .*\) AS can_accept$/);
 assert.match(overdueSql(),/o\.valid_until < \(now\(\) AT TIME ZONE 'America\/Araguaina'\)::date/);
 assert.ok(listProposalsQuery(provider,r).text.includes(forProvider));assert.ok(listProposalsQuery(customer,r).text.includes(forCustomer));
});

test('rota de versões: autor e cliente do pedido leem; vigente primeiro e anteriores "Substituída"',async()=>{
 const none=scripted([]);
 await assert.rejects(()=>proposalVersions(none.client,provider,'x',p),failure(400));await assert.rejects(()=>proposalVersions(none.client,provider,r,'x'),failure(400));
 await assert.rejects(()=>proposalVersions(none.client,{...provider,role:'admin'} as Profile,r,p),failure(403));none.done();
 // O administrador nem chega à rota: a trava central barra /requests.
 assert.equal(accessDecision({role:'admin',mustChangePassword:false},'GET',`/requests/${r}/proposals/${p}/versions`)?.code,'ADMIN_AREA_ONLY');
 const foreign=scripted([{match:/o\.provider_id=\$3/}]);await assert.rejects(()=>proposalVersions(foreign.client,provider,r,p),failure(404));foreign.done();
 assert.deepEqual(foreign.commands[0]!.values,[r,p,provider.id]);
 const current={id:p,request_id:r,provider_id:'autor',provider_name:'Prestador',status:'Pendente',version:3,amount:'300.00',description:'Terceira',estimated_duration:'Um dia',valid_until:'2099-12-31',sent_at:new Date(3),withdrawn_at:null,overdue:false,request_status:'Aberta'};
 const older=[{version:2,amount:'200.00',description:'Segunda',estimated_duration:'Um dia',valid_until:'2099-12-30',status:'Substituída',status_before:'Expirada',sent_at:new Date(2),replaced_at:new Date(3)},{version:1,amount:'100.00',description:'Primeira',estimated_duration:'Um dia',valid_until:'2099-12-29',status:'Substituída',status_before:'Pendente',sent_at:new Date(1),replaced_at:new Date(2)}];
 // Para o cliente, a proposta retirada não é exibida.
 const d=scripted([{match:/r\.customer_id=\$3 AND o\.status<>'Retirada'/,rows:[current]},{match:/FROM maridao\.proposal_versions WHERE proposal_id=\$1 ORDER BY version DESC/,rows:older}]);
 const result=await proposalVersions(d.client,customer,r,p);d.done();
 assert.deepEqual(result.proposal,{id:p,request_id:r,provider_id:'autor',provider_name:'Prestador',status:'Pendente',version:3,withdrawn_at:null,request_status:'Aberta',expired:false,versions_count:3,has_previous_versions:true,missing_previous_versions:false});
 assert.deepEqual(result.versions.map(v=>[v.version,v.current,v.status,v.status_before]),[[3,true,'Pendente',null],[2,false,'Substituída','Expirada'],[1,false,'Substituída','Pendente']]);
 assert.equal(result.versions[0]!.replaced_at,null);assert.equal(result.versions[0]!.amount,'300.00');assert.equal(result.role,'customer');
 for(const secret of ['email','phone','password_hash','document_encrypted'])assert.ok(!d.commands.some(c=>c.sql.includes(secret)));
 // Proposta editada antes da migração 015: a versão é 3, mas nada foi guardado; nenhuma versão é inventada.
 const legacy=scripted([{match:/o\.provider_id=\$3/,rows:[{...current,status:'Expirada'}]},{match:/proposal_versions/}]);
 const old=await proposalVersions(legacy.client,provider,r,p);legacy.done();
 assert.equal(old.versions.length,1);assert.equal(old.proposal.versions_count,1);assert.equal(old.proposal.has_previous_versions,false);assert.equal(old.proposal.missing_previous_versions,true);assert.equal(old.proposal.expired,true);
});
