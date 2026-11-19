import type React from 'react';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import Animated, { Easing, FadeIn, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

// Entrada das listas (pedidos, propostas, histórico, notificações, profissionais, usuários, cadastros em análise).
//
//   <ListEntrance ready={dadosChegaram}> … {itens.map((item, i) => <StaggerItem key={item.id} index={i}>…</StaggerItem>)} … </ListEntrance>
//
// - PRIMEIRA carga: os cartões entram em sequência curta (40 ms entre eles, só os 8 primeiros; o resto entra junto),
//   cada um com 220 ms de opacidade + 10 pt de subida.
// - Cargas seguintes que remontam a lista (volta do foco, nova busca, "carregar mais"): só opacidade, 160 ms, sem sequência.
// - Puxar para atualizar não remonta os cartões (mesmas chaves), então nada se move.
// - Cartão montado fora dessas janelas (rolagem de lista longa): sem animação.
// Tudo em transform/opacity na thread de UI. "Reduzir movimento": nada se move.
type Mode = 'idle' | 'stagger' | 'fade';
const Context = createContext<Mode>('idle');
type BoxStyle = React.ComponentProps<typeof Animated.View>['style'];

export const STAGGER_STEP_MS = 40;
export const STAGGER_LIMIT = 8;
const ITEM_MS = 220;
const FADE_MS = 160;
const RISE = 10;
const out = Easing.out(Easing.cubic);

export function ListEntrance({ ready, children }: PropsWithChildren<{ ready: boolean }>) {
  const [mode, setMode] = useState<Mode>('idle');
  const [was, setWas] = useState(false);
  const [seen, setSeen] = useState(false);
  // Estado derivado durante a renderização: os cartões da mesma atualização já nascem sabendo o modo.
  if (ready !== was) {
    setWas(ready);
    if (ready) { setMode(seen ? 'fade' : 'stagger'); setSeen(true); }
  }
  useEffect(() => {
    if (mode === 'idle') return;
    const timer = setTimeout(() => setMode('idle'), mode === 'stagger' ? STAGGER_LIMIT * STAGGER_STEP_MS + ITEM_MS : FADE_MS + 60);
    return () => clearTimeout(timer);
  }, [mode]);
  return <Context.Provider value={mode}>{children}</Context.Provider>;
}

// `reflow`: o cartão se reacomoda com transição de layout quando ele ou um vizinho muda de altura (status novo, botão que
// some). Só em listas montadas com map dentro de ScrollView; em FlatList a célula não acompanha.
export function StaggerItem({ index, reflow = false, style, children }: PropsWithChildren<{ index: number; reflow?: boolean; style?: BoxStyle }>) {
  const reduced = useReducedMotion();
  const context = useContext(Context);
  // O modo vale no momento em que o cartão nasce. A entrada é uma animação de layout do Reanimated: começa na thread de
  // UI no mesmo quadro em que o cartão é montado (sem esperar um efeito do React), então não fica um vazio antes dela.
  const [mode] = useState<Mode>(reduced ? 'idle' : context);
  const step = Math.min(index, STAGGER_LIMIT - 1);
  const entering = mode === 'stagger' ? staggerIn(step * STAGGER_STEP_MS) : mode === 'fade' ? FADE_IN : undefined;
  return <Animated.View entering={entering} layout={reflow && !reduced ? REFLOW : undefined} style={style}>{children}</Animated.View>;
}
// Entrada em sequência: opacidade + subida de 10 pt, depois do atraso do cartão.
function staggerIn(delay: number) {
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: RISE }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: ITEM_MS, easing: out })),
        transform: [{ translateY: withDelay(delay, withTiming(0, { duration: ITEM_MS, easing: out })) }],
      },
    };
  };
}
const FADE_IN = FadeIn.duration(FADE_MS).easing(out);

// Bloco que não é cartão de lista mas divide a coluna com eles (formulário, "carregar mais"): acompanha a reacomodação.
export function Reflow({ style, children }: PropsWithChildren<{ style?: BoxStyle }>) {
  const reduced = useReducedMotion();
  return <Animated.View layout={reduced ? undefined : REFLOW} style={style}>{children}</Animated.View>;
}
const REFLOW = LinearTransition.duration(220).easing(out);

// Pílula de status: pulso curto de escala (110 ms sobe, 170 ms volta) quando o valor muda COM a pílula na tela.
// Na montagem não há pulso. A cor troca no mesmo instante, pelo estilo. "Reduzir movimento": só a cor troca.
export function useStatusPulse(status: string) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const last = useRef(status);
  useEffect(() => {
    if (last.current === status) return;
    last.current = status;
    if (reduced) return;
    scale.set(withSequence(withTiming(1.1, { duration: 110, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 170, easing: out })));
  }, [status, reduced, scale]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
}
