import type { RequestHandler } from 'express';

// Local single-process development limiter. A shared store is required for multiple API instances.
const attempts = new Map<string, { count: number; expires: number }>();
let active = 0;
export const registrationLimit: RequestHandler = (request, response, next) => {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  const key = request.ip ?? 'unknown';
  const record = attempts.get(key) ?? { count: 0, expires: now + 15 * 60_000 };
  if (record.count >= 10 || attempts.size >= 10000 && !attempts.has(key)) {
    response.set('Retry-After', String(Math.ceil((record.expires - now) / 1000)));
    response.status(429).json({ error: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
    return;
  }
  if (active >= 2) {
    response.set('Retry-After', '3');
    response.status(503).json({ error: 'Servidor ocupado. Tente novamente em instantes.' });
    return;
  }
  record.count += 1;
  attempts.set(key, record);
  active += 1;
  let released = false;
  const release = () => { if (!released) { released = true; active -= 1; } };
  response.once('finish', release);
  response.once('close', release);
  next();
};
