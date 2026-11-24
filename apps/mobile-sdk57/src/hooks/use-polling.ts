import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { POLL_MS } from '@/lib/live-updates';

// Consulta periódica de uma tela (RNF01.1): chama `task` a cada 10 s enquanto a tela está em foco e o app em primeiro plano.
// Para ao sair da tela e quando o app vai para segundo plano; na volta ao primeiro plano consulta na hora e retoma o ritmo.
// `task` deve ser silenciosa (sem "Aguarde…" nem apagar a tela) e pode mudar a cada renderização: vale sempre a mais recente.
// Os avisos não usam este gancho: eles vêm do NotificationObserver, que consulta para o app inteiro.
export function usePolling(task: () => unknown, ms = POLL_MS) {
  const latest = useRef(task);
  useEffect(() => { latest.current = task; });
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { timer ??= setInterval(() => void latest.current(), ms); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') { if (!timer) void latest.current(); start(); } else stop();
    });
    return () => { subscription.remove(); stop(); };
  }, [ms]));
}
