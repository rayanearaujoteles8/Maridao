import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { onApiCode } from '@/lib/api';

export type Role = 'customer' | 'provider' | 'admin';
// role e mustChangePassword vêm do `user` do login/`/auth/me` e decidem a área do app (ver SessionGate em _layout).
type Session = { token: string; expiresAt: string; role?: Role; mustChangePassword?: boolean };
type State = { session: Session | null; setSession: (session: Session | null) => void };
const Context = createContext<State | null>(null);
export function SessionProvider({ children }: PropsWithChildren) {
  // Tokens deliberately stay in memory; never use AsyncStorage for credentials.
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => setSession(null), Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [session]);
  useEffect(() => {
    onApiCode(code => {
      if (code === 'PASSWORD_CHANGE_REQUIRED') setSession(old => old && !old.mustChangePassword ? { ...old, mustChangePassword: true } : old);
      if (code === 'ADMIN_AREA_ONLY') setSession(old => old && old.role !== 'admin' ? { ...old, role: 'admin' } : old);
    });
    return () => onApiCode(null);
  }, []);
  return <Context.Provider value={{ session, setSession }}>{children}</Context.Provider>;
}
export function useSession() {
  const context = useContext(Context);
  if (!context) throw new Error('SessionProvider ausente.');
  return context;
}
