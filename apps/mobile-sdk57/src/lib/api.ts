export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(message: string, status: number, fields?: Record<string, string>) { super(message); this.status = status; this.fields = fields; }
}
export async function api(path: string, options: RequestInit = {}) {
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) throw new Error('A conexão com o servidor precisa ser configurada.');
  if (!__DEV__ && !base.startsWith('https://')) throw new Error('É necessária uma conexão segura com o servidor.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(base.replace(/\/$/, '') + path, { ...options, signal: controller.signal });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new ApiError(data?.error ?? 'Não foi possível concluir a solicitação.', response.status, data?.fields);
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error('Não foi possível conectar ao servidor. Confira sua conexão e tente novamente.');
  } finally { clearTimeout(timer); }
}
