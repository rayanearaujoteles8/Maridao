import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCustomer, InputError } from '../src/customer-validation.ts';
import { hashPassword } from '../src/password.ts';
const sample = { name: 'Pessoa de Teste', email: '  TESTE@EXAMPLE.COM ', phone: '(63) 99999-9999', cpf: '529.982.247-25', neighborhood: 'Bairro de teste', password: 'frase de teste longa e unica' };
test('normaliza os dados sem alterar a senha', () => {
  const result = validateCustomer(sample);
  assert.equal(result.email, 'teste@example.com');
  assert.equal(result.phone, '63999999999');
  assert.equal(result.cpf, '52998224725');
  assert.equal(result.password, sample.password);
});
test('rejeita campos ausentes, CPF inválido, senha curta e campos extras', () => {
  for (const body of [null, [], {}, { ...sample, cpf: '11111111111' }, { ...sample, password: 'curta' }, { ...sample, role: 'admin' }, { ...sample, email: 'incorreto' }, { ...sample, phone: 'texto63999999999' }, { ...sample, name: 'a'.repeat(151) }, { ...sample, neighborhood: ' ' }]) {
    assert.throws(() => validateCustomer(body), InputError);
  }
});
test('hash usa scrypt com salt diferente por chamada e não contém a senha', async () => {
  const first = await hashPassword(sample.password);
  const second = await hashPassword(sample.password);
  assert.match(first, /^scrypt\$131072\$8\$1\$/);
  assert.notEqual(first, second);
  assert.ok(!first.includes(sample.password));
});


test('grava conta e perfil juntos com parametros e desfaz a conta se o perfil falhar', async () => {
  const { saveCustomer } = await import('../src/customers.ts');
  for (const failProfile of [false, true]) {
    const statements: { sql: string; values?: unknown[] }[] = [];
    let released = false;
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        statements.push({ sql, values });
        if (failProfile && sql.includes('INSERT INTO maridao.customer_profiles')) throw Object.assign(new Error('duplicate'), { code: '23505' });
        return { rows: [{ id: 'test-id' }] };
      },
      release: () => { released = true; },
    };
    const database = { connect: async () => client } as unknown as Pick<import('pg').Pool, 'connect'>;
    const task = saveCustomer(validateCustomer(sample), 'hash-for-test-not-a-real-credential', database);
    if (failProfile) await assert.rejects(task, { code: '23505' });
    else {
      const result = await task;
      assert.equal(result.city, 'Palmas');
      assert.ok(!('cpf' in result));
      assert.ok(!('password' in result));
    }
    assert.equal(statements[0].sql, 'BEGIN');
    assert.equal(statements.at(-1)?.sql, failProfile ? 'ROLLBACK' : 'COMMIT');
    assert.ok(!statements[1].sql.includes(sample.email));
    assert.equal(statements[1].values?.[1], 'hash-for-test-not-a-real-credential');
    assert.ok(released);
  }
});


test('aceita senha com 8 caracteres e rejeita 7 ou mais de 128', () => {
  assert.equal(validateCustomer({ ...sample, password: 'a'.repeat(8) }).password.length, 8);
  assert.equal(validateCustomer({ ...sample, password: 'a'.repeat(128) }).password.length, 128);
  for (const length of [7, 129]) assert.throws(() => validateCustomer({ ...sample, password: 'a'.repeat(length) }), InputError);
});
