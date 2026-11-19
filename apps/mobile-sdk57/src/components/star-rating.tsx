import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { themed } from '@/theme';

// Nota de 1 a 5 em estrelas (tela "Avaliar atendimento").
// Toque: a estrela tocada cresce (80 ms) e assenta com mola curta, sem balanço visível (~200 ms); as estrelas entre a
// nota anterior e a tocada preenchem em sequência, 30 ms entre elas, 120 ms cada (no pior caso, de 0 a 5, tudo termina
// em 240 ms). Baixar a nota esvazia as de cima juntas (100 ms).
// "Reduzir movimento": sem escala e sem sequência, as estrelas só trocam de cor.
// Leitor de tela: grupo de opções, cada estrela é "N estrelas".
const STEP_MS = 30;
const FILL_MS = 120;
const out = Easing.out(Easing.cubic);
const STARS = [1, 2, 3, 4, 5] as const;

export function StarRating({ value, onChange, disabled = false, label = 'Nota do atendimento' }: { value: number; onChange: (value: number) => void; disabled?: boolean; label?: string }) {
  const s = useS();
  // Nota que valia no último toque: a sequência de preenchimento parte dela.
  const [from, setFrom] = useState(value);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[s.row, disabled && s.disabled]}>
      {STARS.map(n => <Star key={n} n={n} filled={n <= value} checked={n === value} delay={n > from ? (n - from - 1) * STEP_MS : 0} disabled={disabled} onPress={() => { setFrom(value); onChange(n); }} />)}
    </View>
  );
}

function Star({ n, filled, checked, delay, disabled, onPress }: { n: number; filled: boolean; checked: boolean; delay: number; disabled: boolean; onPress: () => void }) {
  const s = useS();
  const reduced = useReducedMotion();
  const fill = useSharedValue(filled ? 1 : 0), scale = useSharedValue(1);
  useEffect(() => {
    if (reduced) { fill.set(filled ? 1 : 0); return; }
    fill.set(filled ? withDelay(delay, withTiming(1, { duration: FILL_MS, easing: out })) : withTiming(0, { duration: 100, easing: out }));
  }, [filled, delay, reduced, fill]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const on = useAnimatedStyle(() => ({ opacity: fill.get() }));
  return (
    <Pressable
      accessibilityRole="radio" accessibilityLabel={n === 1 ? '1 estrela' : `${n} estrelas`} accessibilityState={{ checked, disabled }} disabled={disabled}
      onPress={() => {
        if (!reduced) scale.set(withSequence(withTiming(1.2, { duration: 80, easing: Easing.out(Easing.quad) }), withSpring(1, { mass: 1, stiffness: 600, damping: 30 })));
        onPress();
      }}
      style={s.target}>
      <Animated.View style={pop}>
        <Animated.Text accessible={false} style={s.star}>★</Animated.Text>
        <Animated.Text accessible={false} style={[s.star, s.starOn, on]}>★</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const useS = themed(colors => StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, marginLeft: -6 },
  disabled: { opacity: 0.5 },
  target: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  star: { fontSize: 36, lineHeight: 44, color: colors.borderStrong },
  starOn: { position: 'absolute', top: 0, left: 0, color: colors.primary },
}));
