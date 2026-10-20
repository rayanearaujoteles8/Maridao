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
server.on('error', () => {
  console.error('Não foi possível iniciar a API. Verifique se a porta está disponível.');
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { server.close(() => { void closeDatabase(); void closeAuthDatabase(); }); });
}
