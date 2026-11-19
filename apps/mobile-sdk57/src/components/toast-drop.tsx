import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { Blur, Canvas, Circle, ColorMatrix, Group, Paint, RoundedRect } from '@shopify/react-native-skia';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// O DESENHO do aviso em gota. ARQUIVO ISOLADO: a fila, os tempos, o leitor de tela e a API (`useToast`) ficam em
// toast.tsx e não dependem daqui.
//
// A gota é líquida de verdade: as formas (a gota com o ícone, o corpo que sai dela e uma gotinha que vem atrás na
// queda) são desenhadas num <Canvas> do Skia, borradas (Blur 7) e depois cortadas pelo alfa (ColorMatrix, alfa × 20
// − 10). Onde duas formas se encostam, o borrão as une e o corte devolve a borda nítida: elas se fundem como gosma.
// É o mesmo recurso da gota do Segue-me (mesmo autor), com os mesmos números: 600 ms, 150 ms de atraso para o corpo
// abrir, saída de 320 ms com o corpo recolhendo em 260 ms. O texto e o ícone são Views comuns por cima do desenho.
//
// A ideia da pílula que nasce pequena e se abre vem do Sileo, de Aaryan (github.com/hiaaryan/sileo, licença MIT
// declarada no package.json do pacote); o pacote não está instalado e nenhum código dele foi copiado.
//
// Props:
//   lead      – o que aparece na gota fechada (o ícone); fica sempre visível.
//   children  – o corpo (texto e ação, já com acessibilidade); aparece quando a gota abre.
//   fill / shadow – cores da pílula e da sombra. `border` continua na API, mas a gota fundida não tem contorno.
//   leaving   – true quando o aviso deve sair; a saída dura TOAST_EXIT_MS e depois toast.tsx desmonta este componente.
//   onHold / onResume – dedo em cima / dedo saiu sem dispensar (o relógio do aviso para e volta).
//   onDismiss – toque simples ou arrasto para cima.
// Posição: no topo, logo abaixo da área segura (barra de status / ilha), centrado e por cima de tudo: conteúdo, botão de
// voltar, barra de abas e, dentro de uma folha, o topo da folha. Só a gota pega toques; fora dela, eles passam para a tela.
// A troca de tema (theme-transition.tsx, zIndex 30) continua por cima do aviso.
// "Reduzir movimento": só esmaece, já aberto.

export const TOAST_EXIT_MS = 320;
const DROP = 44;        // gota fechada: um círculo com o ícone
const BELOW_SAFE = 6;   // respiro abaixo da barra de status / ilha
const OPEN_DELAY = 150, BODY_EXIT = 260;
const PAD = 28, TAIL = 64; // folga do desenho em volta da pílula (borrão e sombra) e espaço acima para a gotinha
const GOO = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 20, -10];
const always = { reduceMotion: ReduceMotion.Never } as const;

type Props = { sheet?: boolean; lead: ReactNode; children: ReactNode; fill: string; border: string; shadow: string; leaving: boolean; onHold: () => void; onResume: () => void; onDismiss: () => void };

export function ToastDrop({ sheet = false, lead, children, fill, shadow, leaving, onHold, onResume, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Dentro de uma folha a área segura informada ainda é a da janela inteira, mas a folha já começa abaixo da barra de
  // status: ali o aviso desce do topo da própria folha.
  const top = sheet ? BELOW_SAFE * 2 : insets.top + BELOW_SAFE;
  const maxWidth = Math.min(width - 32, 440);

  const fall = useSharedValue(reduced ? 1 : 0);   // 0 = acima da tela, 1 = no lugar
  const head = useSharedValue(reduced ? 1 : 0);   // 0 = gota no centro, 1 = gota na ponta esquerda da pílula
  const body = useSharedValue(reduced ? 1 : 0);   // 0 = sem corpo, 1 = corpo aberto
  const shown = useSharedValue(0);                // opacidade
  const drag = useSharedValue(0);                 // arrasto do dedo

  // Entra assim que o conteúdo foi medido.
  const measured = size !== null;
  useEffect(() => {
    if (!measured) return;
    if (reduced) { shown.set(withTiming(1, { duration: 180, ...always })); return; }
    shown.set(withTiming(1, { duration: 120 }));
    fall.set(withSpring(1, { mass: 1, damping: 15, stiffness: 240 }));
    head.set(withDelay(OPEN_DELAY, withSpring(1, { mass: 1, damping: 24, stiffness: 210 })));
    body.set(withDelay(OPEN_DELAY, withSpring(1, { mass: 1, damping: 16, stiffness: 150 })));
  }, [measured, reduced, shown, fall, head, body]);
  // Sai: o corpo recolhe para dentro da gota, que volta ao centro e some.
  useEffect(() => {
    if (!leaving) return;
    if (reduced) { shown.set(withTiming(0, { duration: 160, ...always })); return; }
    body.set(withTiming(0, { duration: BODY_EXIT, easing: Easing.inOut(Easing.cubic) }));
    head.set(withTiming(0, { duration: BODY_EXIT, easing: Easing.inOut(Easing.cubic) }));
    shown.set(withDelay(TOAST_EXIT_MS - 140, withTiming(0, { duration: 140, easing: Easing.out(Easing.quad) })));
  }, [leaving, reduced, shown, head, body]);

  // Toque dispensa; arrastar para cima também. Enquanto o dedo está em cima, o relógio para.
  const touch = useRef({ x: 0, y: 0 });
  const settle = () => { drag.set(withSpring(0, { mass: 1, damping: 18, stiffness: 260 })); onResume(); };
  const onGrant = (event: GestureResponderEvent) => { touch.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }; onHold(); };
  const onMove = (event: GestureResponderEvent) => { const dy = event.nativeEvent.pageY - touch.current.y; drag.set(dy < 0 ? dy : dy * 0.15); };
  const onRelease = (event: GestureResponderEvent) => {
    const dx = event.nativeEvent.pageX - touch.current.x, dy = event.nativeEvent.pageY - touch.current.y;
    if (dy < -18 || (Math.abs(dy) < 6 && Math.abs(dx) < 6)) onDismiss(); else settle();
  };

  const w = size?.w ?? DROP;
  const slide = (w - DROP) / 2; // quanto a gota anda do centro até a ponta esquerda
  const boxStyle = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: -(top + DROP + PAD) * (1 - fall.get()) + drag.get() }] }));
  // O conteúdo tem a largura final desde o início; uma janela do tamanho do corpo o descobre, o texto não se reacomoda.
  const windowStyle = useAnimatedStyle(() => {
    const left = slide * (1 - head.get());
    return { left, width: Math.min(w - left, Math.max(DROP, DROP + (w - DROP) * body.get())) };
  });
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -slide * (1 - head.get()) }] }));
  const leadStyle = useAnimatedStyle(() => ({ transform: [{ translateX: slide * (1 - head.get()) }] }));
  const bodyStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, (body.get() - 0.6) / 0.35)) }));

  if (!size) {
    // Medida: o mesmo conteúdo, invisível e fora do leitor de tela, só para saber o tamanho final da pílula.
    return (
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[s.host, { top }]}>
        <View style={[s.row, s.measure, { maxWidth }]} onLayout={event => setSize({ w: Math.ceil(event.nativeEvent.layout.width) + 1, h: Math.ceil(event.nativeEvent.layout.height) })}>
          {lead}<View style={s.body}>{children}</View>
        </View>
      </View>
    );
  }
  return (
    <View pointerEvents="box-none" style={[s.host, { top }]}>
      <Animated.View onStartShouldSetResponder={() => true} onResponderGrant={onGrant} onResponderMove={onMove} onResponderRelease={onRelease} onResponderTerminate={settle} style={[{ width: size.w, height: size.h }, boxStyle]}>
        <Canvas pointerEvents="none" style={{ position: 'absolute', left: -PAD, top: -TAIL, width: size.w + PAD * 2, height: size.h + TAIL + PAD }}>
          <Group layer={<Paint opacity={0.22}><Blur blur={9} /></Paint>} transform={[{ translateY: 6 }]}>
            <Shapes w={size.w} h={size.h} color={shadow} fall={fall} head={head} body={body} />
          </Group>
          <Group layer={<Paint><Blur blur={7} /><ColorMatrix matrix={GOO} /></Paint>}>
            <Shapes w={size.w} h={size.h} color={fill} fall={fall} head={head} body={body} tail />
          </Group>
        </Canvas>
        <Animated.View style={[s.window, { height: size.h }, windowStyle]}>
          <Animated.View style={[s.row, { width: size.w, minHeight: size.h }, rowStyle]}>
            <Animated.View style={leadStyle}>{lead}</Animated.View>
            <Animated.View style={[s.body, bodyStyle]}>{children}</Animated.View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// As formas da gota, em coordenadas do Canvas (a pílula final ocupa de PAD a PAD + w, de TAIL a TAIL + h).
function Shapes({ w, h, color, fall, head, body, tail = false }: { w: number; h: number; color: string; fall: SharedValue<number>; head: SharedValue<number>; body: SharedValue<number>; tail?: boolean }) {
  const slide = (w - DROP) / 2, cy = TAIL + h / 2;
  const cx = useDerivedValue(() => PAD + DROP / 2 + slide * (1 - head.get()));
  // O corpo sai da gota mais fino que ela e engrossa ao abrir: o pescoço entre os dois é a gosma que alisa.
  const bodyX = useDerivedValue(() => cx.get() - DROP / 2);
  const bodyW = useDerivedValue(() => Math.min(PAD + w - bodyX.get(), DROP + (w - DROP) * Math.max(0, body.get())));
  const bodyH = useDerivedValue(() => Math.max(8, DROP * 0.5 + (h - DROP * 0.5) * Math.min(1.04, Math.max(0, body.get()))));
  const bodyY = useDerivedValue(() => cy - bodyH.get() / 2);
  const bodyR = useDerivedValue(() => Math.min(DROP / 2, bodyH.get() / 2));
  // Caindo, a gota estica e uma gotinha vem atrás; ao pousar, as duas se fundem.
  const stretch = useDerivedValue(() => [{ scaleX: 1 - Math.max(0, 1 - fall.get()) * 0.14 }, { scaleY: 1 + Math.max(0, 1 - fall.get()) * 0.35 }]);
  const origin = useDerivedValue(() => ({ x: cx.get(), y: cy }));
  const tailY = useDerivedValue(() => cy - Math.max(0, 1 - fall.get()) * 150);
  const tailR = useDerivedValue(() => 4 + 7 * Math.min(1, Math.max(0, 1 - fall.get()) * 4));
  return (
    <>
      <RoundedRect x={bodyX} y={bodyY} width={bodyW} height={bodyH} r={bodyR} color={color} />
      <Group origin={origin} transform={stretch}>
        <Circle cx={cx} cy={cy} r={DROP / 2} color={color} />
      </Group>
      {tail ? <Circle cx={cx} cy={tailY} r={tailR} color={color} /> : null}
    </>
  );
}

const s = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 20 },
  window: { position: 'absolute', top: 0, overflow: 'hidden', borderRadius: DROP / 2 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: DROP, paddingLeft: 8, paddingRight: 18, paddingVertical: 8, gap: 10 },
  measure: { position: 'absolute', opacity: 0 },
  body: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
});
