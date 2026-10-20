import { createDatabasePool } from './database.ts';

async function checkDatabase() {
  const pool = createDatabasePool();
  try {
    const result = await pool.query<{ database: string; username: string; superuser: boolean }>(
      'SELECT current_database() AS database, current_user AS username, rolsuper AS superuser FROM pg_roles WHERE rolname = current_user',
    );
    const connection = result.rows[0];
    if (connection?.database !== 'maridao' || connection?.username !== 'maridao_api' || connection.superuser) {
      throw new Error('Unexpected database role');
    }
    console.log('Conexão confirmada: banco maridao, usuário maridao_api sem privilégios de superusuário.');
  } finally {
    await pool.end();
  }
}

checkDatabase().catch((error: unknown) => {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    '28P01': 'O PostgreSQL recusou o usuário ou a senha de maridao_api.',
    '28000': 'O PostgreSQL recusou a autenticação. Confira se o usuário maridao_api foi criado e pode entrar.',
    '3D000': 'O banco configurado não existe. Confira PGDATABASE=maridao.',
    '42501': 'O usuário não tem permissão para conectar ou consultar o banco.',
    'ECONNREFUSED': 'O PostgreSQL não respondeu na porta configurada. Confira o serviço e PGPORT.',
    'ENOTFOUND': 'O endereço do PostgreSQL não foi encontrado. Confira PGHOST.',
    'ETIMEDOUT': 'A conexão com o PostgreSQL excedeu o tempo de espera.',
    'EACCES': 'O ambiente bloqueou o acesso de rede ao PostgreSQL.',
  };
  const configuration = error instanceof Error && /^Configure (PGHOST|PGPORT|PGDATABASE|PGUSER|PGPASSWORD) no arquivo \.env da API\.$/.test(error.message);
  const wrongRole = error instanceof Error && error.message === 'Unexpected database role';
  console.error(configuration ? error.message : wrongRole ? 'Conectou, mas o banco deve ser maridao e o usuário deve ser maridao_api, sem privilégios de superusuário.' : messages[code] ?? 'Falha não identificada. Confira as configurações locais de conexão.');
  process.exitCode = 1;
});
