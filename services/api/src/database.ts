import pg from 'pg';

export function createDatabasePool() {
  for (const name of ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']) {
    if (!process.env[name] || process.env[name] === 'PREENCHA_AQUI') {
      throw new Error(`Configure ${name} no arquivo .env da API.`);
    }
  }
  const pool = new pg.Pool({
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    query_timeout: 5000,
    statement_timeout: 5000,
  });
  pool.on('error', () => {
    console.error('Uma conexão com o banco foi interrompida.');
  });
  return pool;
}
