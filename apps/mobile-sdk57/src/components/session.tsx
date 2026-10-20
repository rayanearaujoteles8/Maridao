import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

type Session = { token: string; expiresAt: string };
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
  return <Context.Provider value={{ session, setSession }}>{children}</Context.Provider>;
}
export function useSession() {
  const context = useContext(Context);
  if (!context) throw new Error('SessionProvider ausente.');
  return context;
}
