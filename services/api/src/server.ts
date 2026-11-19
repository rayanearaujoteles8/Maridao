import { closeRequestDatabase, runAutoConfirm, runExpireProposals } from './requests.ts';
import {closeTeamDatabase} from './team-routes.ts';
import { closeProposalDatabase } from './proposals.ts';
import { closeSearchDatabase } from './provider-search.ts';
import { closeProviderDatabase } from './providers.ts';
import { closeAuthDatabase } from './auth.ts';
import { app } from './app.ts';
import { closeDatabase } from './customers.ts';

const port = Number(process.env.PORT ?? '3000');
const host = process.env.HOST ?? '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT deve ser um número entre 1 e 65535.');
}
const server = app.listen(port, host, () => {
  console.log(`API do Maridão iniciada em http://${host}:${port}`);
});
server.on('error', (error: NodeJS.ErrnoException) => {
  const reason = error.code === 'EADDRINUSE' ? 'A porta já está sendo usada por outro processo.'
    : error.code === 'EADDRNOTAVAIL' ? 'O IP configurado em HOST não pertence a este computador. Confira o IPv4 do Wi-Fi.'
    : error.code === 'EACCES' || error.code === 'EPERM' ? 'O sistema não permitiu abrir esta porta/endereço.'
    : 'Confira o endereço HOST e a porta configurados.';
  console.error(`Não foi possível iniciar a API (${error.code ?? 'erro desconhecido'}). ${reason}`);
  process.exitCode = 1;
});
// RN07: confirmação automática das conclusões sem resposta. Uma passada na subida e outra a cada dez minutos;
// o temporizador não segura o processo aberto e é desligado no encerramento.
const autoConfirm = () => {
  runAutoConfirm().then(ids => { if (ids.length) console.log(`Conclusões confirmadas automaticamente: ${ids.length}.`); }, () => { console.error('Não foi possível aplicar a confirmação automática de conclusões.'); });
  // RN04: na mesma passada, as propostas pendentes com validade vencida passam a "Expirada".
  runExpireProposals().then(ids => { if (ids.length) console.log(`Propostas expiradas: ${ids.length}.`); }, () => { console.error('Não foi possível aplicar a expiração das propostas.'); });
};
const autoConfirmTimer = setInterval(autoConfirm, 10 * 60_000);
autoConfirmTimer.unref();
server.once('listening', autoConfirm);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { clearInterval(autoConfirmTimer); server.close(() => { void closeTeamDatabase(); void closeDatabase(); void closeAuthDatabase(); void closeProviderDatabase(); void closeSearchDatabase(); void closeRequestDatabase(); void closeProposalDatabase(); }); });
}
