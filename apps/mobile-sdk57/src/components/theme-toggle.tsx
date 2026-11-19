import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { themed, useTheme } from '@/theme';

// Botão da lua: troca para o tema contrário ao que está à vista. O ícone e o rótulo mudam no toque (resposta
// imediata para quem usa leitor de tela); as cores da tela entram com a transição (theme-transition.tsx), que sai do centro deste botão.
// A lua e o sol são desenhados com Views (não há pacote de ícones nem de SVG no projeto).
const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

export function ThemeToggle() {
  const { target, toggle } = useTheme();
  const s = useS();
  const reduced = useReducedMotion();
  const dark = target === 'dark';
  const button = useRef<React.ComponentRef<typeof Pressable>>(null);
  const last = useRef(0);
  const sun = useSharedValue(dark ? 1 : 0); // 0 = lua, 1 = sol
  useEffect(() => { sun.set(reduced ? (dark ? 1 : 0) : withSpring(dark ? 1 : 0, { mass: 1, damping: 16, stiffness: 210 })); }, [dark, reduced, sun]);
  const moonStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, sun.get() * 1.6), transform: [{ rotate: `${-70 * sun.get()}deg` }, { scale: 1 - 0.45 * sun.get() }] }));
  const sunStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, sun.get() * 1.6 - 0.6)), transform: [{ rotate: `${70 * (1 - sun.get())}deg` }, { scale: 0.55 + 0.45 * sun.get() }] }));

  function press() {
    // O segundo toque de um toque duplo não desfaz o primeiro.
    const now = Date.now();
    if (now - last.current < 500) return;
    last.current = now;
    const node = button.current;
    if (!node) { toggle(); return; }
    node.measureInWindow((x, y, width, height) => toggle(Number.isFinite(x) && width > 0 ? { x: x + width / 2, y: y + height / 2 } : undefined));
  }
  return (
    <Pressable ref={button} accessibilityRole="button" accessibilityLabel={dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'} onPress={press} style={({ pressed }) => [s.button, pressed && s.pressed]}>
      <Animated.View style={[s.icon, moonStyle]}>
        <View style={s.moon} /><View style={s.bite} />
      </Animated.View>
      <Animated.View style={[s.icon, sunStyle]}>
        {RAYS.map(angle => <View key={angle} style={[s.ray, { transform: [{ rotate: `${angle}deg` }, { translateY: -9.5 }] }]} />)}
        <View style={s.core} />
      </Animated.View>
    </Pressable>
  );
}

const useS = themed(colors => StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pressed: { backgroundColor: colors.surfacePressed, transform: [{ scale: 0.94 }] },
  icon: { position: 'absolute', width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  moon: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.text },
  bite: { position: 'absolute', width: 15, height: 15, borderRadius: 7.5, left: 9, top: 0.5, backgroundColor: colors.surface },
  core: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.text },
  ray: { position: 'absolute', width: 2.5, height: 4.5, borderRadius: 1.25, backgroundColor: colors.text },
}));
