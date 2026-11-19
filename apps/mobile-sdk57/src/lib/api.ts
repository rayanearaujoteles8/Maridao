export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  code?: string;
  approvalStatus?: string;
  constructor(message: string, status: number, fields?: Record<string, string>, code?: string, approvalStatus?: string) { super(message); this.status = status; this.fields = fields; this.code = code; this.approvalStatus = approvalStatus; }
}
// Rede de segurança: a sessão escuta os códigos de trava da API (ex.: PASSWORD_CHANGE_REQUIRED) vindos de qualquer chamada.
let codeListener: ((code: string) => void) | null = null;
export function onApiCode(listener: ((code: string) => void) | null) { codeListener = listener; }
export async function api(path: string, options: RequestInit = {}) {
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) throw new Error('A conexão com o servidor precisa ser configurada.');
  if (!__DEV__ && !base.startsWith('https://')) throw new Error('É necessária uma conexão segura com o servidor.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(base.replace(/\/$/, '') + path, { ...options, signal: controller.signal });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      if (typeof data?.code === 'string') codeListener?.(data.code);
      throw new ApiError(data?.error ?? 'Não foi possível concluir a solicitação.', response.status, data?.fields, data?.code, data?.approvalStatus);
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error('Não foi possível conectar ao servidor. Confira sua conexão e tente novamente.');
  } finally { clearTimeout(timer); }
}
