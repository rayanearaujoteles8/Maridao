import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { Appearance, Platform, Settings, useColorScheme } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { runThemeTransition, ThemeTransitionHost } from '@/components/theme-transition';
import { themes, type ThemeColors, type ThemeName } from './tokens';

export { themes, BRAND_BLACK, BRAND_GREEN, type ThemeColors, type ThemeName } from './tokens';

// Tema do app. Segue o sistema até a pessoa tocar na lua; daí em diante vale a escolha dela.
//
// Onde a escolha fica guardada: não há AsyncStorage/SecureStore no projeto, então no iOS ela vai para o
// NSUserDefaults pelo `Settings` do próprio React Native (sem pacote novo); no Android e na web o `Settings`
// não grava nada, e a escolha vale só enquanto o app está aberto.
const KEY = 'maridao.tema';
function stored(): ThemeName | null {
  if (Platform.OS !== 'ios') return null;
  try { const value = Settings.get(KEY); return value === 'dark' || value === 'light' ? value : null; } catch { return null; }
}
function store(name: ThemeName) {
  if (Platform.OS !== 'ios') return;
  try { Settings.set({ [KEY]: name }); } catch { /* sem armazenamento: a escolha fica só em memória */ }
}
// Teclado, alertas e seletores nativos acompanham o tema escolhido.
function native(name: ThemeName) { try { Appearance.setColorScheme(name); } catch { /* plataforma sem suporte */ } }

export type Origin = { x: number; y: number };
type Theme = {
  /** tema que está pintado na tela */
  name: ThemeName;
  colors: ThemeColors;
  /** tema para o qual a pessoa pediu para ir: muda no toque, antes de a tela trocar (rótulo e ícone da lua) */
  target: ThemeName;
  /** troca para o tema contrário; com `origin` (centro do botão, em pontos da janela) a troca sai dele (src/components/theme-transition.tsx) */
  toggle: (origin?: Origin) => void;
};
const Context = createContext<Theme | null>(null);

const initial = stored();
if (initial) native(initial);

export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const reduced = useReducedMotion();
  const [choice, setChoice] = useState<ThemeName | null>(initial);
  // tema pedido enquanto a transição ainda cobre a tela
  const [pending, setPending] = useState<ThemeName | null>(null);
  const name: ThemeName = choice ?? (system === 'dark' ? 'dark' : 'light');
  const target = pending ?? name;

  const apply = useCallback((next: ThemeName) => { setChoice(next); native(next); store(next); }, []);
  const toggle = useCallback((origin?: Origin) => {
    const next: ThemeName = target === 'dark' ? 'light' : 'dark';
    // "Reduzir movimento", ou sem ponto de partida: troca seca.
    if (reduced || !origin) { setPending(null); apply(next); return; }
    setPending(next);
    runThemeTransition({ origin, toDark: next === 'dark', onCovered: () => apply(next), onDone: () => setPending(old => old === next ? null : old) });
  }, [target, reduced, apply]);

  const value = useMemo<Theme>(() => ({ name, colors: themes[name], target, toggle }), [name, target, toggle]);
  return (
    <Context.Provider value={value}>
      {children}
      <ThemeTransitionHost painted={name} />
    </Context.Provider>
  );
}

export function useTheme() {
  const theme = useContext(Context);
  if (!theme) throw new Error('ThemeProvider ausente.');
  return theme;
}

// Estilos que dependem do tema. `StyleSheet.create` é estático, então cada arquivo declara
//   const useS = themed(colors => StyleSheet.create({ ... }));
// e cada componente pega os seus com `const s = useS();`. As duas folhas (claro e escuro) são montadas uma vez.
export function themed<T>(make: (colors: ThemeColors) => T): () => T {
  const sheets: Record<ThemeName, T> = { light: make(themes.light), dark: make(themes.dark) };
  return function useThemedStyles() { return sheets[useTheme().name]; };
}
