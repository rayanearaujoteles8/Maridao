import { closeRequestDatabase } from './requests.ts';
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
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { server.close(() => { void closeDatabase(); void closeAuthDatabase(); void closeProviderDatabase(); void closeSearchDatabase(); void closeRequestDatabase(); void closeProposalDatabase(); }); });
}
