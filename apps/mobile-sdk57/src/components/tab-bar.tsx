import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Keyboard, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSession } from './session';
import { themed, useTheme } from '@/theme';

// Barra única das abas (cliente e prestador), desenhada por nós e usada só em src/app/(abas)/_layout.tsx.
// Ela fica fora das telas: ao trocar de aba só o conteúdo muda e o destaque verde desliza de um item ao outro,
// ajustando a largura, com os rótulos trocando de cor conforme o destaque passa por eles (tudo na thread de UI).
// "Reduzir movimento" ligado = troca seca. Tocar na aba já ativa leva a lista ao topo (useScrollToTop nas telas).
// Telas que são abas: a área segura de baixo é da barra, não da tela.
export const TAB_EDGES = ['top', 'left', 'right'] as const;
type Box = { x: number; width: number };
// Deslocamento e duração da troca de conteúdo entre abas (os mesmos da animação de cena em src/app/(abas)/_layout.tsx).
export const TAB_SHIFT = 24;
export const TAB_MS = 200;
// Índice da aba que estava em foco antes da troca em curso. A barra atualiza depois de cada troca (efeito), então uma
// cena que nasce durante a troca ainda lê a aba de onde a pessoa veio.
let lastFocusedIndex = 0;

// Primeira visita a uma aba: a animação de cena da biblioteca não roda (a rota provisória vira rota real e já nasce no
// lugar), então a cena entra por aqui com o mesmo movimento: 24 pt vindo do lado em que a aba fica + opacidade, 200 ms.
// A aba inicial e as visitas seguintes não passam por isto. "Reduzir movimento": aparece direto.
export function TabScene({ index, children }: PropsWithChildren<{ index: number }>) {
  const reduced = useReducedMotion();
  const [side] = useState(() => reduced || index === lastFocusedIndex ? 0 : index > lastFocusedIndex ? 1 : -1);
  const shown = useSharedValue(side === 0 ? 1 : 0);
  useEffect(() => { if (side !== 0) shown.set(withTiming(1, { duration: TAB_MS, easing: Easing.out(Easing.cubic) })); }, [side, shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateX: (1 - shown.get()) * TAB_SHIFT * side }] }));
  return <Animated.View style={[s0.scene, style]}>{children}</Animated.View>;
}
const s0 = StyleSheet.create({ scene: { flex: 1 } });
// Mola curta e sem balanço (amortecimento crítico: o destaque não passa da borda da cápsula). A massa padrão do Reanimated 4 é 4: fixar em 1.
const SPRING = { mass: 1, damping: 39, stiffness: 380 } as const;

export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const s = useS();
  const { session } = useSession();
  const reduced = useReducedMotion();
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const x = useSharedValue(0), width = useSharedValue(0);
  const placed = useRef(false);
  const keyboardOpen = useKeyboardOpen();
  // As medidas são guardadas pelo nome da rota: a chave muda na primeira visita a uma aba (rota provisória › real).
  const focusedName = state.routes[state.index]?.name;
  const count = state.routes.length;

  const moveTo = useCallback((box: Box | undefined, animated: boolean) => {
    if (!box) return;
    if (animated && placed.current && !reduced) { x.set(withSpring(box.x, SPRING)); width.set(withSpring(box.width, SPRING)); }
    else { x.set(box.x); width.set(box.width); }
    placed.current = true;
  }, [reduced, x, width]);
  // Quantidade de abas mudou (papel da sessão): o destaque reaparece no lugar certo, sem atravessar a barra.
  useEffect(() => { placed.current = false; }, [count]);
  // Guarda a aba em foco para a entrada da próxima cena (TabScene); ao sair da área logada, volta para a inicial.
  const focusedIndex = state.index;
  useEffect(() => { lastFocusedIndex = focusedIndex; }, [focusedIndex]);
  useEffect(() => () => { lastFocusedIndex = 0; }, []);
  const target = focusedName ? boxes[focusedName] : undefined;
  const targetX = target?.x, targetWidth = target?.width;
  useEffect(() => {
    if (targetX !== undefined && targetWidth !== undefined) moveTo({ x: targetX, width: targetWidth }, true);
  }, [targetX, targetWidth, moveTo]);

  const pill = useAnimatedStyle(() => ({ width: width.get(), transform: [{ translateX: x.get() }] }));
  // Administrador e senha provisória pendente não usam as abas (o SessionGate tira a pessoa daqui): sem barra.
  if (!session || session.role === 'admin' || session.mustChangePassword) return null;
  // Android redimensiona a janela com o teclado: a barra some em vez de subir junto. No iOS o teclado passa por cima.
  if (keyboardOpen) return null;

  return <View style={[s.wrap, { paddingBottom: insets.bottom + 8, paddingLeft: 22 + insets.left, paddingRight: 22 + insets.right }]}>
    <View style={s.dock}>
      <View accessibilityRole="tablist" style={s.row}>
        <Animated.View pointerEvents="none" style={[s.pill, targetX === undefined && s.hidden, pill]} />
        {state.routes.map(route => {
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;
          const selected = route.name === focusedName;
          return <Pressable key={route.name} accessibilityRole="tab" accessibilityState={{ selected }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label} style={s.item}
            onLayout={(event: LayoutChangeEvent) => {
              const { x: left, width: size } = event.nativeEvent.layout;
              setBoxes(old => old[route.name]?.x === left && old[route.name]?.width === size ? old : { ...old, [route.name]: { x: left, width: size } });
            }}
            onPress={() => {
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (selected || event.defaultPrevented) return;
              // O destaque parte já no toque; a troca de conteúdo vem logo em seguida.
              moveTo(boxes[route.name], true);
              navigateToTab(route.key);
            }}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}>
            <TabLabel label={label} selected={selected} box={boxes[route.name]} x={x} width={width} />
          </Pressable>;
        })}
      </View>
    </View>
  </View>;
}

// A cor do rótulo acompanha o quanto o destaque cobre o item: branco fora dele, preto sob o verde.
function TabLabel({ label, selected, box, x, width }: { label: string; selected: boolean; box?: Box; x: SharedValue<number>; width: SharedValue<number> }) {
  const s = useS();
  const { colors } = useTheme();
  const off = colors.onInk, on = colors.onAccent;
  const left = box?.x ?? -1, size = box?.width ?? 0;
  const color = useAnimatedStyle(() => {
    if (size <= 0) return { color: selected ? on : off };
    const from = Math.max(left, x.get()), to = Math.min(left + size, x.get() + width.get());
    const covered = Math.min(1, Math.max(0, (to - from) / size));
    return { color: interpolateColor(covered, [0.45, 0.65], [off, on]) };
  });
  return <Animated.Text numberOfLines={1} style={[s.text, selected && s.activeText, color]}>{label}</Animated.Text>;
}

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return open;
}

const useS = themed(colors => StyleSheet.create({
  wrap: { paddingTop: 8, width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: colors.bg },
  dock: { backgroundColor: colors.ink, borderRadius: 24, padding: 7, borderWidth: 1, borderColor: colors.inkBorder },
  row: { flexDirection: 'row', gap: 4 },
  pill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 18, backgroundColor: colors.accent },
  hidden: { opacity: 0 },
  item: { flex: 1, minHeight: 46, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  text: { color: colors.onInk, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  activeText: { fontWeight: '700' },
}));
