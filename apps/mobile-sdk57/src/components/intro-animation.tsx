import { useEffect, useState, useSyncExternalStore, type ComponentProps, type PropsWithChildren } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BRAND_BLACK, BRAND_GREEN } from '@/theme/tokens';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

// Abertura do Maridão. O martelo do símbolo arma e bate; a batida empurra o disco verde para a esquerda
// e desenrola o logotipo. Depois o círculo do símbolo abre como uma íris e revela a tela que está por baixo.
// Toca uma vez por abertura do app (estado de módulo), só anima transform/opacity e sai da árvore ao terminar.

type Phase = 'playing' | 'revealing' | 'done';
let phase: Phase = 'playing';
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getPhase = () => phase;
function setPhase(next: Phase) { if (phase === next) return; phase = next; listeners.forEach(listener => listener()); }

// O palco é o preto da marca nos dois temas: no claro a íris abre para a tela branca; no escuro, para a tela preta
// (aí quem marca a abertura é a borda verde da íris e a entrada escalonada dos blocos).
const BLACK = BRAND_BLACK, GREEN = BRAND_GREEN;
const LOGO = require('../../assets/brand/logotipo-branco.png');
// Medidas do logotipo (1406 × 317 px): o símbolo ocupa o quadrado da esquerda; a palavra começa em x = 351.
const RATIO = 1406 / 317, WORD_START = 351 / 317;
const always = { reduceMotion: ReduceMotion.Never } as const;

// Reanimated 4 usa massa 4 por padrão; todas as molas daqui fixam mass: 1.
// Linha do tempo, em ms.
const WIND = 200, STRIKE = 500, HIT = 620, EXIT = 1420, IRIS = 640, END = EXIT + IRIS + 40;

export function IntroAnimation() {
  const current = useSyncExternalStore(subscribe, getPhase, getPhase);
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();

  const enter = useSharedValue(reduced ? 1 : 0); // símbolo aparece
  const swing = useSharedValue(0);               // graus do martelo
  const open = useSharedValue(reduced ? 1 : 0);  // 0 = símbolo sozinho no centro, 1 = logotipo montado
  const pulse = useSharedValue(0);               // onda da batida
  const leave = useSharedValue(0);               // logotipo sai
  const iris = useSharedValue(0);                // círculo abre
  const fade = useSharedValue(1);                // só para "Reduzir movimento"

  useEffect(() => {
    if (getPhase() !== 'playing') return;
    let timers: ReturnType<typeof setTimeout>[];
    if (reduced) {
      fade.set(withDelay(450, withTiming(0, { duration: 260, ...always })));
      timers = [setTimeout(() => setPhase('revealing'), 450), setTimeout(() => setPhase('done'), 740)];
    } else {
      enter.set(withSpring(1, { mass: 1, damping: 14, stiffness: 190 }));
      swing.set(withSequence(
        withDelay(WIND, withTiming(34, { duration: STRIKE - WIND, easing: Easing.out(Easing.cubic) })),
        withTiming(-22, { duration: HIT - STRIKE, easing: Easing.in(Easing.quad) }),
        withSpring(0, { mass: 1, damping: 7, stiffness: 190 }),
      ));
      open.set(withDelay(HIT - 20, withSpring(1, { mass: 1, damping: 17, stiffness: 150 })));
      pulse.set(withDelay(HIT - 10, withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) })));
      leave.set(withDelay(EXIT, withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })));
      iris.set(withDelay(EXIT, withTiming(1, { duration: IRIS, easing: Easing.bezier(0.62, 0, 0.18, 1) })));
      timers = [setTimeout(() => setPhase('revealing'), EXIT + 120), setTimeout(() => setPhase('done'), END)];
    }
    return () => timers.forEach(clearTimeout);
  }, [reduced, enter, swing, open, pulse, leave, iris, fade]);

  // Geometria: logotipo centrado; o furo da íris nasce no centro do símbolo.
  const mark = Math.round(Math.min(64, (width - 96) / RATIO));
  const lockup = mark * RATIO, wordStart = mark * WORD_START, wordWidth = lockup - wordStart;
  const left = (width - lockup) / 2, top = height * 0.47 - mark / 2;
  const cx = left + mark / 2, cy = top + mark / 2;
  const reach = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));
  // As bordas circulares viram bitmap no tamanho de layout, então nada é ampliado muito: o palco preto é desenhado
  // pela metade e a borda verde (que esconde a aresta do palco) no tamanho quase final, começando reduzida.
  const hole = mark - 14, plug = mark - 4;
  const irisScale = (reach * 2 * 1.06) / hole;
  const rimInner = reach * 1.06, rimBorder = 20, rim = rimInner + rimBorder * 2, rimScale = hole / rimInner;
  const stage = Math.ceil(reach) + 4, stageHole = (hole * (1 + rimBorder / rimInner)) / 2;
  const solo = (lockup - mark) / 2; // deslocamento que deixa o símbolo sozinho no centro da tela

  const overlayStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const stageStyle = useAnimatedStyle(() => ({ transform: [{ scale: 2 * (1 + iris.get() * (irisScale - 1)) }] }));
  const rimStyle = useAnimatedStyle(() => ({ transform: [{ scale: rimScale * (1 + iris.get() * (irisScale - 1)) }] }));
  const plugStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, leave.get() * 2.5) }));
  const lockupStyle = useAnimatedStyle(() => ({ transform: [{ translateX: solo * (1 - open.get()) }] }));
  const markStyle = useAnimatedStyle(() => ({
    // Já nasce visível: a tela de abertura nativa mostra este mesmo símbolo, no mesmo lugar e tamanho (app.json).
    opacity: 1 - leave.get(),
    transform: [{ scale: (0.9 + 0.1 * enter.get()) * (1.5 - 0.5 * open.get()) * (1 + 0.3 * leave.get()) }, { rotate: `${swing.get()}deg` }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.get() === 0 ? 0 : 0.7 * (1 - pulse.get()), transform: [{ scale: 1.4 + pulse.get() * 1.5 }] }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, open.get() * 1.4)) * (1 - Math.min(1, leave.get() * 1.6)),
    transform: [{ translateX: -wordWidth * Math.max(0, 1 - open.get()) + 14 * leave.get() }],
  }));

  if (current === 'done') return null;
  return (
    <Animated.View
      pointerEvents={current === 'playing' ? 'auto' : 'none'}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, s.overlay, overlayStyle]}>
      {/* Palco preto com um furo no centro do símbolo; ao escalar, o furo cresce e mostra a tela. */}
      <Animated.View style={[s.round, { left: cx - stage / 2, top: cy - stage / 2, width: stage, height: stage, borderRadius: stage / 2, borderWidth: (stage - stageHole) / 2, borderColor: BLACK }, stageStyle]} />
      {/* Borda verde da íris. */}
      <Animated.View style={[s.round, { left: cx - rim / 2, top: cy - rim / 2, width: rim, height: rim, borderRadius: rim / 2, borderWidth: rimBorder, borderColor: GREEN }, rimStyle]} />
      {/* Tampa do furo enquanto o logotipo está em cena. */}
      <Animated.View style={[s.round, { left: cx - plug / 2, top: cy - plug / 2, width: plug, height: plug, borderRadius: plug / 2, backgroundColor: BLACK }, plugStyle]} />
      <Animated.View style={[s.lockup, { left, top, width: lockup, height: mark }, lockupStyle]}>
        <Animated.View style={[s.round, { width: mark, height: mark, borderRadius: mark / 2, borderWidth: 2, borderColor: GREEN }, pulseStyle]} />
        <Animated.View style={[{ width: mark, height: mark, overflow: 'hidden' }, markStyle]}>
          <Image source={LOGO} resizeMode="stretch" style={{ width: lockup, height: mark, tintColor: GREEN }} />
        </Animated.View>
        <View style={{ position: 'absolute', left: wordStart, top: 0, width: wordWidth, height: mark, overflow: 'hidden' }}>
          <Animated.View style={[{ width: wordWidth, height: mark }, wordStyle]}>
            <Image source={LOGO} resizeMode="stretch" style={{ position: 'absolute', left: -wordStart, top: 0, width: lockup, height: mark }} />
          </Animated.View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// Entrada escalonada dos blocos da tela que a abertura revela. Depois que a abertura já tocou, não anima mais nada.
export function IntroReveal({ order = 0, style, children }: PropsWithChildren<{ order?: number; style?: ComponentProps<typeof Animated.View>['style'] }>) {
  const current = useSyncExternalStore(subscribe, getPhase, getPhase);
  const reduced = useReducedMotion();
  const [animate] = useState(current !== 'done');
  const shown = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate || current === 'playing') return;
    shown.set(reduced
      ? withTiming(1, { duration: 220, ...always })
      : withDelay(order * 55, withSpring(1, { mass: 1, damping: 19, stiffness: 150 })));
  }, [animate, current, reduced, order, shown]);
  const animated = useAnimatedStyle(() => ({ opacity: Math.min(1, shown.get() * 1.3), transform: [{ translateY: reduced ? 0 : 18 * (1 - shown.get()) }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

// Fase atual da abertura ('playing' → 'revealing' → 'done'), para microinterações que acompanham a revelação.
export function useIntroPhase() { return useSyncExternalStore(subscribe, getPhase, getPhase); }

const s = StyleSheet.create({
  overlay: { zIndex: 10, overflow: 'hidden' },
  round: { position: 'absolute' },
  lockup: { position: 'absolute' },
});
