import { test } from 'node:test';
import assert from 'node:assert/strict';
import { login, AuthError, tokenHash, bearerToken, type AuthStore } from '../src/auth.ts';
import { hashPassword, verifyPassword } from '../src/password.ts';

test('verifica a senha e guarda somente o hash do token de sessão', async () => {
  const password = 'frase longa para teste de login';
  const hash = await hashPassword(password);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('senha incorreta', hash), false);
  assert.equal(await verifyPassword(password, 'hash-invalido'), false);
  let stored = '';
  const store: AuthStore = {
    findAccount: async email => email === 'teste@example.com' ? { id: 'id-teste', name: 'Teste', email, neighborhood: 'Centro', city: 'Palmas', state: 'TO', password_hash: hash } : undefined,
    createSession: async (value, _id, expiry) => { stored = value; assert.ok(expiry.getTime() > Date.now()); },
    findSession: async () => undefined,
    deleteSession: async () => {},
  };
  const session = await login({ email: ' TESTE@example.com ', password }, store);
  assert.equal(stored, tokenHash(session.token));
  assert.notEqual(stored, session.token);
  assert.equal('password_hash' in session.user, false);
  assert.equal(bearerToken('Bearer ' + session.token), session.token);
  assert.equal(bearerToken('Bearer invalido'), undefined);
  assert.equal(bearerToken(undefined), undefined);
  for (const email of ['teste@example.com', 'inexistente@example.com']) {
    await assert.rejects(login({ email, password: 'senha incorreta' }, store), (error: unknown) => error instanceof AuthError && error.message === 'E-mail ou senha incorretos.');
  }
});
