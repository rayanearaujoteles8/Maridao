import { useEffect, useRef, useSyncExternalStore } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { gooAvailable, ThemeGoo } from '@/components/theme-goo';
import { BRAND_BLACK, type ThemeName } from '@/theme/tokens';

// Transição da troca de tema. ARQUIVO ISOLADO: para trocar o efeito (ex.: a gosma do Segue-me em Skia), substitua só
// o miolo de <ThemeTransitionHost/> (o desenho e as animações); a interface abaixo e quem a usa não mudam.
//
// Interface:
//   runThemeTransition({ origin, toDark, onCovered, onDone? })
//     origin    – centro do botão da lua, em pontos da janela; a cobertura sai dele (e volta para ele ao clarear).
//     toDark    – true = escurecer, false = clarear.
//     onCovered – chamado UMA vez, com a tela 100% coberta: é aqui que o tema troca (re-render pesado, escondido).
//     onDone    – chamado quando a cobertura sumiu e os toques voltaram.
//     Um pedido novo durante uma troca termina a anterior na hora (chama o onCovered dela, se ainda não chamou).
//   <ThemeTransitionHost painted={temaPintado} />
//     Montado uma vez, por cima de tudo (ThemeProvider). `painted` é o tema que já está na tela: depois do onCovered,
//     o host só descobre a tela quando `painted` chega ao tema pedido (mais dois quadros de folga).
//   Quem chama decide o "Reduzir movimento": com ele ligado o ThemeProvider troca seco e nem chama esta função.
//
// Implementação atual (simples, só transform/opacity na thread de UI): revelação circular na cor preta da marca.
//   Escurecer: o círculo cresce do botão até cobrir a tela → onCovered → a cobertura esmaece.
//   Clarear:   a tela escurece num instante → onCovered → o círculo encolhe para dentro do botão.

export type ThemeTransitionRequest = { origin: { x: number; y: number }; toDark: boolean; onCovered: () => void; onDone?: () => void };
type Run = ThemeTransitionRequest & { id: number; covered: boolean };

let current: Run | null = null, sequence = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getRun = () => current;
const emit = () => listeners.forEach(listener => listener());
function cover(run: Run) { if (run.covered) return; run.covered = true; run.onCovered(); }
function end(run: Run) { if (current !== run) return; cover(run); current = null; emit(); run.onDone?.(); }

export function runThemeTransition(request: ThemeTransitionRequest) {
  if (current) end(current);
  current = { ...request, id: ++sequence, covered: false };
  emit();
}

export function ThemeTransitionHost({ painted }: { painted: ThemeName }) {
  const run = useSyncExternalStore(subscribe, getRun, getRun);
  if (!run) return null;
  // A gosma do Segue-me (Skia); se o desenho não compilar neste aparelho, vale a revelação circular simples.
  if (gooAvailable) return <ThemeGoo key={run.id} origin={run.origin} toDark={run.toDark} color={BRAND_BLACK} painted={painted === (run.toDark ? 'dark' : 'light')} onCovered={() => cover(run)} onEnd={() => end(run)} />;
  return <Cover key={run.id} run={run} painted={painted} />;
}

// ───────────── miolo: o desenho e as animações (é isto que o efeito novo substitui) ─────────────
const GROW = 520, FADE = 240, COVER = 140, SHRINK = 480;

function Cover({ run, painted }: { run: Run; painted: ThemeName }) {
  const { width, height } = useWindowDimensions();
  const target: ThemeName = run.toDark ? 'dark' : 'light';
  const size = useSharedValue(run.toDark ? 0 : 1);     // 0 = dentro do botão, 1 = tela coberta
  const opacity = useSharedValue(run.toDark ? 1 : 0);
  const revealed = useRef(false);

  // 1) cobrir a tela e avisar
  useEffect(() => {
    if (run.toDark) size.set(withTiming(1, { duration: GROW, easing: Easing.bezier(0.5, 0, 0.75, 0.4) }));
    else opacity.set(withTiming(1, { duration: COVER, easing: Easing.out(Easing.quad) }));
    const timer = setTimeout(() => cover(run), (run.toDark ? GROW : COVER) + 20);
    // rede de segurança: a tela nunca fica coberta
    const guard = setTimeout(() => end(run), 4000);
    return () => { clearTimeout(timer); clearTimeout(guard); };
  }, [run, size, opacity]);

  // 2) o tema novo já está pintado por baixo: descobrir
  useEffect(() => {
    if (painted !== target || revealed.current) return;
    revealed.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined, second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (run.toDark) opacity.set(withTiming(0, { duration: FADE, easing: Easing.out(Easing.quad) }));
        else size.set(withTiming(0, { duration: SHRINK, easing: Easing.bezier(0.25, 0.6, 0.3, 1) }));
        timer = setTimeout(() => end(run), (run.toDark ? FADE : SHRINK) + 30);
      });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); if (timer) clearTimeout(timer); };
  }, [painted, target, run, size, opacity]);

  // O círculo é desenhado no tamanho final (raio até o canto mais distante) e cresce a partir do botão.
  const { x, y } = run.origin;
  const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + 8;
  const rootStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.02 + 0.98 * size.get() }] }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: size.get() >= 0.995 ? 1 : 0 }));
  return (
    <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, s.root, rootStyle]}>
      <Animated.View style={[s.shape, { left: x - radius, top: y - radius, width: radius * 2, height: radius * 2, borderRadius: radius }, circleStyle]} />
      <Animated.View style={[StyleSheet.absoluteFill, s.fill, fillStyle]} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { zIndex: 30, overflow: 'hidden' },
  shape: { position: 'absolute', backgroundColor: BRAND_BLACK },
  fill: { backgroundColor: BRAND_BLACK },
});
