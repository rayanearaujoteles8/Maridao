import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, TextInput, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme';

// Movimento de estado dos formulários e seletores (segunda passada). Um lugar só para as telas não repetirem a regra:
//   FieldInput    campo de texto cuja borda vai da cor normal ao vermelho de erro (160 ms) e volta (120 ms)
//   FieldTrigger  o mesmo para o campo que abre um seletor ou o calendário (um botão com cara de campo)
//   FieldError    mensagem de erro do campo: aparece com opacidade + 5 pt de descida, saindo de baixo do campo (180 ms)
//   useToggleProgress  0 → 1 quando um estado liga (opção escolhida, dia marcado, campo inválido); base dos três acima
// Só cor e opacidade/transform, na thread de UI. Nada se move na montagem: quem nasce já no estado final nasce parado.
// "Reduzir movimento": troca seca, como era antes desta passada.
const out = Easing.out(Easing.cubic);

export function useToggleProgress(on: boolean, inMs = 140, outMs = 110) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    const to = on ? 1 : 0;
    if (reduced) { progress.set(to); return; }
    progress.set(withTiming(to, { duration: on ? inMs : outMs, easing: out }));
  }, [on, reduced, progress, inMs, outMs]);
  return progress;
}

// Cor da borda entre a cor de repouso do campo e a de erro. A espessura (1 → 2 pt) continua trocando pelo estilo.
function useInvalidBorder(invalid: boolean, base: string) {
  const { colors } = useTheme();
  const danger = colors.danger;
  const progress = useToggleProgress(invalid, 160, 120);
  return useAnimatedStyle(() => ({ borderColor: interpolateColor(progress.get(), [0, 1], [base, danger]) }));
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
// `borderColor`: a cor de repouso da borda, quando o estilo do campo não usa a padrão (borderStrong).
export function FieldInput({ invalid = false, borderColor, style, ...props }: ComponentProps<typeof TextInput> & { invalid?: boolean; borderColor?: string }) {
  const { colors } = useTheme();
  const border = useInvalidBorder(invalid, borderColor ?? colors.borderStrong);
  return <AnimatedTextInput {...props} style={[style, border]} />;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function FieldTrigger({ invalid = false, borderColor, style, pressedStyle, onPressIn, onPressOut, ...props }: Omit<PressableProps, 'style'> & { invalid?: boolean; borderColor?: string; style?: StyleProp<ViewStyle>; pressedStyle?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  const border = useInvalidBorder(invalid, borderColor ?? colors.borderStrong);
  return (
    <AnimatedPressable
      {...props}
      onPressIn={event => { setPressed(true); onPressIn?.(event); }}
      onPressOut={event => { setPressed(false); onPressOut?.(event); }}
      style={[style, pressed && pressedStyle, border]}
    />
  );
}

// Sem mensagem não ocupa lugar. A mensagem que troca de texto com o erro já na tela não entra de novo.
export function FieldError({ children, style }: { children?: string | null | false; style?: StyleProp<TextStyle> }) {
  const reduced = useReducedMotion();
  if (!children) return null;
  return <Animated.Text accessibilityRole="alert" entering={reduced ? undefined : errorIn} style={style}>{children}</Animated.Text>;
}
function errorIn() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -5 }] },
    animations: {
      opacity: withTiming(1, { duration: 180, easing: out }),
      transform: [{ translateY: withTiming(0, { duration: 180, easing: out }) }],
    },
  };
}
