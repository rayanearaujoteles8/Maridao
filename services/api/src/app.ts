import { services, neighborhoods } from './catalog.ts';
import { requestRoutes } from './requests.ts';
import { searchRoutes } from './provider-search.ts';
import { registerProvider } from './providers.ts';
import { ProviderInputError } from './provider-validation.ts';
import { PasswordCapacityError } from './password.ts';
import { authRoutes } from './auth-routes.ts';
import express, { type ErrorRequestHandler } from 'express';
import { registerCustomer } from './customers.ts';
import { InputError } from './customer-validation.ts';
import { registrationLimit } from './registration-limit.ts';
export const app = express();
app.disable('x-powered-by');
app.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); response.set('X-Content-Type-Options', 'nosniff'); next(); });
app.use(express.json({ limit: '16kb' }));
// Liveness only: this endpoint does not claim database readiness.
app.get('/health', (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json({ status: 'ok', service: 'maridao-api' });
});
app.get('/catalog', (_req, res) => { res.json({ services, neighborhoods }); });
app.use('/auth', authRoutes);
app.use('/requests', requestRoutes);
app.use('/providers', searchRoutes);
app.post('/customers', registrationLimit, async (request, response, next) => {
  if (!request.is('application/json')) { response.status(415).json({ error: 'Envie os dados em JSON.' }); return; }
  try {
    const customer = await registerCustomer(request.body);
    response.status(201).json({ message: 'Cadastro criado com sucesso.', customer });
  } catch (error) {
    if (error instanceof InputError) { response.status(400).json({ error: error.message, fields: error.fields }); return; }
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      response.status(409).json({ error: 'Já existe cadastro com os dados informados.' }); return;
    }
    next(error);
  }
});
app.post('/providers', registrationLimit, async (request, response, next) => {
 if (!request.is('application/json')) {response.status(415).json({error:'Envie os dados em JSON.'});return;}
 try {response.status(201).json({message:'Cadastro criado com sucesso.',provider:await registerProvider(request.body)});}
 catch(error){
  if(error instanceof ProviderInputError){response.status(400).json({error:error.message,fields:error.fields});return;}
  if(error && typeof error==='object' && 'code' in error && error.code==='23505'){response.status(409).json({error:'Já existe cadastro com os dados informados.'});return;}
  next(error);
 }
});
app.use((_request, response) => {
  response.status(404).json({ error: 'Rota não encontrada.' });
});
const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof PasswordCapacityError) { response.set('Retry-After', '3'); response.status(503).json({ error: 'Servidor ocupado. Tente novamente em instantes.' }); return; }
  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ error: 'JSON inválido.' });
    return;
  }
  if (error && error.type === 'entity.too.large') {
    response.status(413).json({ error: 'Dados enviados excedem o limite permitido.' });
    return;
  }
  response.status(500).json({ error: 'Não foi possível processar a solicitação.' });
};
app.use(errorHandler);
