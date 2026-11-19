import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Resposta de toque única do app (botões e cartões tocáveis): afunda rápido (90 ms) e volta com mola curta e sem balanço (assenta em ~250 ms).
// Com "Reduzir movimento" só escurece, sem escala. Desativado (`disabled`): fica esmaecido e não reage.
// Cartões grandes usam scaleTo={0.98}; botões ficam no padrão (0.97).
export function PressableScale({ style, scaleTo = 0.97, disabledOpacity = 0.5, onPressIn, onPressOut, ...props }: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; scaleTo?: number; disabledOpacity?: number }) {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);
  const depth = reduced ? 0 : 1 - scaleTo;
  const rest = props.disabled ? disabledOpacity : 1;
  const animated = useAnimatedStyle(() => ({ opacity: rest * (1 - pressed.get() * 0.14), transform: [{ scale: 1 - pressed.get() * depth }] }));
  return (
    <AnimatedPressable
      {...props}
      onPressIn={event => { pressed.set(withTiming(1, { duration: 90, reduceMotion: ReduceMotion.Never })); onPressIn?.(event); }}
      onPressOut={event => { pressed.set(withSpring(0, { mass: 1, damping: 32, stiffness: 400, reduceMotion: ReduceMotion.Never })); onPressOut?.(event); }}
      style={[style, animated]}
    />
  );
}
