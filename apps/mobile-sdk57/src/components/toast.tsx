import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { ToastDrop, TOAST_EXIT_MS } from './toast-drop';
import { themes, useTheme } from '@/theme';

// Avisos do app (toast): a LÓGICA. Fila (um por vez), tempo de vida, pausa sob o dedo, leitor de tela e a API
// `useToast()`. O desenho da gota (forma, queda, abertura, gesto) fica em toast-drop.tsx e pode ser trocado sem
// mexer aqui. Crédito do efeito (Sileo, de Aaryan, MIT): ver toast-drop.tsx e o README.
//
//   const toast = useToast();
//   toast.success('Perfil atualizado.');  toast.error('…');  toast.info('…');
//   toast.show({ kind: 'info', text: 'Pedido arquivado.', action: { label: 'Desfazer', onPress } });
//
// Variante = ícone + cor + texto falado ("Erro: …"), nunca só cor. Some sozinho (≈4 s; mais para texto longo ou com
// ação), fica enquanto pressionado, sai com toque ou arrasto para cima.

export type ToastKind = 'success' | 'error' | 'info';
export type ToastOptions = { kind?: ToastKind; text: string; action?: { label: string; onPress: () => void }; duration?: number };
export type ToastItem = Required<Pick<ToastOptions, 'kind' | 'text'>> & Pick<ToastOptions, 'action' | 'duration'> & { id: number };
type Api = {
  show: (options: ToastOptions) => void;
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
};
const Context = createContext<Api | null>(null);
export type ToastHostState = { item: ToastItem | undefined; owner: symbol | undefined; claim: (key: symbol) => () => void; remove: (id: number) => void };
// Quem desenha o aviso: a raiz ou, enquanto uma folha está em foco, o <ToastHost /> dela (toast-host.tsx).
export const HostContext = createContext<ToastHostState | null>(null);

const LIMIT = 4;
const GLYPH: Record<ToastKind, string> = { success: '✓', error: '!', info: 'i' };
const SPOKEN: Record<ToastKind, string> = { success: '', error: 'Erro: ', info: 'Aviso: ' };

export function ToastProvider({ children }: PropsWithChildren) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const sequence = useRef(0);
  const show = useCallback((options: ToastOptions) => {
    const text = options.text.trim();
    if (!text) return;
    const kind = options.kind ?? 'info';
    const id = ++sequence.current;
    // O mesmo aviso pedido duas vezes seguidas (hook e tela, toque duplo) aparece uma vez só.
    setQueue(old => old.some(item => item.text === text && item.kind === kind) || old.length >= LIMIT ? old : [...old, { id, kind, text, action: options.action, duration: options.duration }]);
  }, []);
  const api = useMemo<Api>(() => ({
    show,
    success: text => show({ kind: 'success', text }),
    error: text => show({ kind: 'error', text }),
    info: text => show({ kind: 'info', text }),
  }), [show]);
  const remove = useCallback((id: number) => setQueue(old => old.filter(item => item.id !== id)), []);
  const current = queue[0];
  // Folhas (telas de ação em modal nativo) cobrem a árvore da raiz: enquanto uma está em foco, é ela que desenha o aviso.
  const [hosts, setHosts] = useState<symbol[]>([]);
  const claim = useCallback((key: symbol) => { setHosts(old => [...old, key]); return () => setHosts(old => old.filter(item => item !== key)); }, []);
  const host = useMemo<ToastHostState>(() => ({ item: current, owner: hosts.at(-1), claim, remove }), [current, hosts, claim, remove]);
  return (
    <Context.Provider value={api}>
      <HostContext.Provider value={host}>{children}</HostContext.Provider>
      {current && !hosts.length ? <ToastSlot key={current.id} item={current} onGone={remove} /> : null}
    </Context.Provider>
  );
}

export function useToast() {
  const api = useContext(Context);
  if (!api) throw new Error('ToastProvider ausente.');
  return api;
}

// Um aviso na tela: relógio, leitor de tela e conteúdo. O desenho é do <ToastDrop/>.
// `sheet`: desenhado dentro de uma folha (toast-host.tsx); o topo passa a ser o da folha.
export function ToastSlot({ item, onGone, sheet = false }: { item: ToastItem; onGone: (id: number) => void; sheet?: boolean }) {
  const { name } = useTheme();
  // O aviso usa as cores do tema contrário: pílula escura na tela clara e clara na tela escura.
  const c = themes[name === 'dark' ? 'light' : 'dark'];
  const [leaving, setLeaving] = useState(false);
  const life = item.duration ?? Math.min(8000, (item.action ? 6500 : 4000) + Math.max(0, item.text.length - 60) * 45);
  const clock = useRef<{ timer?: ReturnType<typeof setTimeout>; until: number; left: number; leaving: boolean }>({ until: 0, left: life, leaving: false });

  const dismiss = useCallback(() => {
    const state = clock.current;
    if (state.leaving) return;
    state.leaving = true;
    clearTimeout(state.timer);
    setLeaving(true);
    state.timer = setTimeout(() => onGone(item.id), TOAST_EXIT_MS + 20);
  }, [onGone, item.id]);
  const hold = useCallback(() => {
    const state = clock.current;
    if (state.leaving) return;
    clearTimeout(state.timer);
    state.left = Math.max(1500, state.until - Date.now());
  }, []);
  const resume = useCallback(() => {
    const state = clock.current;
    if (state.leaving) return;
    clearTimeout(state.timer);
    state.until = Date.now() + state.left;
    state.timer = setTimeout(dismiss, state.left);
  }, [dismiss]);

  const spoken = SPOKEN[item.kind] + item.text;
  useEffect(() => {
    const state = clock.current;
    AccessibilityInfo.announceForAccessibility(spoken);
    state.until = Date.now() + state.left;
    state.timer = setTimeout(dismiss, state.left);
    return () => clearTimeout(state.timer);
  }, [spoken, dismiss]);

  const icon = (
    <View accessible={false} style={[s.icon, { backgroundColor: item.kind === 'success' ? c.accent : item.kind === 'error' ? c.danger : 'transparent', borderColor: item.kind === 'info' ? c.textMuted : 'transparent' }]}>
      <Text style={[s.glyph, { color: item.kind === 'success' ? c.onAccent : item.kind === 'error' ? c.bg : c.text }]}>{GLYPH[item.kind]}</Text>
    </View>
  );
  return (
    <ToastDrop sheet={sheet} lead={icon} fill={c.bg} border={c.border} shadow={themes.light.text} leaving={leaving} onHold={hold} onResume={resume} onDismiss={dismiss}>
      <View accessible accessibilityRole="alert" accessibilityLiveRegion="polite" accessibilityLabel={spoken} accessibilityHint="Toque duas vezes para dispensar" onAccessibilityTap={dismiss} style={s.textWrap}>
        <Text style={[s.text, { color: c.text }]}>{item.text}</Text>
      </View>
      {item.action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={item.action.label} hitSlop={8} onPressIn={hold} onPress={() => { item.action?.onPress(); dismiss(); }} style={({ pressed }) => [s.action, { backgroundColor: c.surface, borderColor: c.link }, pressed && s.pressed]}>
          <Text style={[s.actionText, { color: c.link }]}>{item.action.label}</Text>
        </Pressable>
      ) : null}
    </ToastDrop>
  );
}

const s = StyleSheet.create({
  icon: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 15, lineHeight: 19, fontWeight: '800' },
  textWrap: { flexShrink: 1 },
  text: { fontSize: 15, lineHeight: 21, fontWeight: '600', flexShrink: 1 },
  action: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  actionText: { fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
