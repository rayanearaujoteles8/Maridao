import { Router } from 'express';
import { login, AuthError, bearerToken, tokenHash, databaseAuthStore } from './auth.ts';
import { registrationLimit } from './registration-limit.ts';
export const authRoutes = Router();
authRoutes.post('/login', registrationLimit, async (req, res, next) => {
  if (!req.is('application/json')) { res.status(415).json({ error: 'Envie os dados em JSON.' }); return; }
  try { res.json(await login(req.body)); }
  catch (error) {
    if (error instanceof AuthError) { res.status(401).json({ error: error.message }); return; }
    next(error);
  }
});
authRoutes.get('/me', async (req, res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) { res.status(401).json({ error: 'Entre na sua conta para continuar.' }); return; }
  try {
    const user = await databaseAuthStore.findSession(tokenHash(token));
    if (!user) { res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' }); return; }
    res.json({ user });
  } catch (error) { next(error); }
});
authRoutes.post('/logout', async (req, res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) { res.status(401).json({ error: 'Entre na sua conta para continuar.' }); return; }
  try { await databaseAuthStore.deleteSession(tokenHash(token)); res.status(204).end(); }
  catch (error) { next(error); }
});
