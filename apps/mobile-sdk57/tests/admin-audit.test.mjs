import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancellationAuthor, cancellationPath, cancellationReason, cancellationWhen } from '../src/lib/admin-audit.ts';
test('cancelamento no painel do administrador mostra data, hora, autor e motivo',()=>{
 assert.equal(cancellationAuthor({by:'customer',actorName:'Ana Souza'}),'Cliente · Ana Souza');
 assert.equal(cancellationAuthor({by:'provider',actorName:' João '}),'Prestador · João');
 assert.equal(cancellationAuthor({by:'administration',actorName:null}),'Administração');
 assert.equal(cancellationAuthor({by:'system',actorName:null}),'Sistema (automático)');
 assert.equal(cancellationAuthor({by:null,actorName:null}),'Sistema (automático)');
 assert.equal(cancellationPath('account_closed'),'Cancelada pelo encerramento da conta');
 assert.equal(cancellationPath('acao_desconhecida'),'Solicitação cancelada');
 assert.equal(cancellationReason('  Imprevisto  '),'Imprevisto');
 assert.equal(cancellationReason(''),'Não informado');assert.equal(cancellationReason(null),'Não informado');
 // 15:30 UTC = 12:30 em Palmas (UTC-3), qualquer que seja o fuso de quem roda o teste.
 assert.equal(cancellationWhen('2026-11-20T15:30:00.000Z'),'20/11/2026 às 12:30');
});
