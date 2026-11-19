import type React from 'react';
import { useEffect, type PropsWithChildren } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { themed } from '@/theme';

// Blocos-fantasma: ocupam o lugar do conteúdo na PRIMEIRA carga de uma lista ou tela, no formato do que vai chegar.
// Operações (envio de formulário) continuam com o texto "Aguarde…" — ver Feedback em private-screen.tsx.
//   cards  = cartões de lista (pedidos, histórico, profissionais, usuários)
//   rows   = linhas curtas (últimos pedidos do painel)
//   detail = tela de detalhe (resumo + bloco de informações)
//   form   = formulário (rótulo + campo)
//   block  = um bloco só, no lugar de um número grande (contador da administração; fica sobre o cartão de tinta)
// Um único pulso de opacidade para o conjunto inteiro (thread de UI). "Reduzir movimento": blocos parados.
// Leitor de tela: o conjunto é um só elemento, "Carregando".
export type SkeletonShape = 'cards' | 'rows' | 'detail' | 'form' | 'block';

const PULSE_MS = 800;

export function Skeleton({ shape = 'cards', count, style }: { shape?: SkeletonShape; count?: number; style?: React.ComponentProps<typeof Animated.View>['style'] }) {
  const s = useS();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduced) { pulse.set(1); return; }
    pulse.set(withRepeat(withTiming(0.5, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  const total = count ?? (shape === 'cards' ? 3 : shape === 'rows' ? 2 : shape === 'form' ? 3 : 1);
  const bar = (width: DimensionValue, height = 14) => <View style={[s.bar, { width, height }]} />;
  if (shape === 'block') return <Animated.View accessible accessibilityRole="progressbar" accessibilityLabel="Carregando" accessibilityState={{ busy: true }} style={[s.block, style, animated]} />;
  return (
    <Animated.View accessible accessibilityRole="progressbar" accessibilityLabel="Carregando" accessibilityState={{ busy: true }} style={[s.wrap, style, animated]}>
      {Array.from({ length: total }, (_, index) => shape === 'cards' ? (
        <View key={index} style={s.card}>
          <View style={s.split}><View style={s.pill} />{bar(64, 12)}</View>
          {bar('64%', 22)}
          {bar('42%')}
          {bar('94%')}
          {bar('78%')}
          <View style={s.button} />
        </View>
      ) : shape === 'rows' ? (
        <View key={index} style={s.row}>
          <View style={s.split}>{bar('52%', 18)}<View style={s.pillSmall} /></View>
          {bar('38%', 12)}
        </View>
      ) : shape === 'detail' ? (
        <View key={index} style={s.wrap}>
          <View style={s.card}>
            {bar('58%', 22)}
            {bar('36%')}
            {bar('92%')}
            {bar('84%')}
            <View style={s.pill} />
          </View>
          <View style={s.card}>
            {bar('30%', 12)}
            {bar('72%', 18)}
            {bar('30%', 12)}
            {bar('54%', 18)}
          </View>
        </View>
      ) : (
        <View key={index} style={s.field}>
          {bar('34%', 16)}
          <View style={s.input} />
        </View>
      ))}
    </Animated.View>
  );
}

// Conteúdo que chega depois da carga: entra só com opacidade (180 ms). "Reduzir movimento": aparece direto.
export function Appear({ children, style }: PropsWithChildren<{ style?: React.ComponentProps<typeof Animated.View>['style'] }>) {
  const reduced = useReducedMotion();
  return <Animated.View entering={reduced ? undefined : FadeIn.duration(180)} style={style}>{children}</Animated.View>;
}

const useS = themed(colors => StyleSheet.create({
  wrap: { gap: 18 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 24, padding: 20, gap: 12 },
  row: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 16, gap: 14 },
  split: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  bar: { borderRadius: 7, backgroundColor: colors.neutral },
  pill: { width: 92, height: 30, borderRadius: 12, backgroundColor: colors.neutral },
  pillSmall: { width: 68, height: 24, borderRadius: 10, backgroundColor: colors.neutral },
  button: { height: 52, borderRadius: 16, backgroundColor: colors.neutral, marginTop: 4 },
  field: { gap: 8 },
  block: { width: 76, height: 56, borderRadius: 16, backgroundColor: colors.inkLine },
  input: { height: 54, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
}));
