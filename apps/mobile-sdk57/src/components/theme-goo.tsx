import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

// A gosma da troca de tema. Porte para React Native (Skia + SkSL) do desenho feito para o Segue-me
// (segue-me-next/src/componentes/gosma.ts): mesmas formas, mesmos números, mesmos tempos e curvas.
//
// Ao escurecer, uma mancha escura sai do botão da lua, com 6 tentáculos e 4 gotas, e cobre a tela; com a tela
// coberta as cores trocam (onCovered) e a mancha esmaece. Ao clarear, a tela escurece num instante, as cores
// trocam por baixo e a mancha se recolhe para dentro do botão.
//
// Quem desenha é a placa de vídeo: uma conta por ponto da tela num <Canvas> por cima de tudo, que não pega o
// toque. Os uniformes saem de valores compartilhados do Reanimated, na thread de UI: a troca pesada do tema
// (thread de JS) não trava a mancha. A conta do desenho usa o y para cima, como no original; a tela usa o y
// para baixo, e é o desenho que converte (uH - y).

// NT tentáculos e NG gotas (os mesmos números estão escritos no desenho abaixo); UNE é o raio em que gota e corpo se fundem
const NT = 6, NG = 4, UNE = 30, ONDA = 0.012, VOLTA = 2 * Math.PI;
// quanto dura cada parte, em ms (as partes da mancha encolhem com o instante em que ela acaba de cobrir a tela)
const CRESCE = 2400, RECOLHE = 2000, SOME = 240, COBRE = 160, FOLGA = 2500;
// a largura da borda lisa, em pontos da tela (no original é a variação da conta entre pontos vizinhos, que o SkSL não tem)
const BORDA = 0.8;

const effect = Skia.RuntimeEffect.Make(`
uniform float2 uO; uniform float uB; uniform float uK; uniform float uA; uniform float uF; uniform float uW;
uniform float uH; uniform float uE; uniform float4 uT[6]; uniform float3 uG[4]; uniform float3 uC;
float une(float a, float b, float k) { float h = max(k - abs(a - b), 0.) / k; return min(a, b) - h * h * k * .25; }
half4 main(float2 xy) {
  float2 fc = float2(xy.x, uH - xy.y);
  float2 p = fc - uO;
  float ro = length(p), th = atan(p.y, p.x);
  float r = uB * (1. + .05 * sin(2. * th + uF) + .035 * sin(3. * th - 1.3 * uF) + .02 * sin(5. * th + 2.1 * uF));
  for (int i = 0; i < 6; i++) {
    float4 t = uT[i];
    float d = mod(th - t.x - t.w * sin(ro * uW + 3. * t.x) + 3.14159265, 6.2831853) - 3.14159265;
    r += t.y * exp(-d * d / (t.z * t.z));
  }
  float f = ro - r;
  for (int i = 0; i < 4; i++) { float3 g = uG[i]; f = une(f, length(fc - g.xy) - g.z, uK); }
  float a = clamp(.5 - f / uE, 0., 1.) * uA;
  return half4(half3(uC * a), half(a));
}`);

/** false quando o desenho não compilou neste aparelho: quem chama usa a troca simples */
export const gooAvailable = effect !== null;

type Tentacle = { a: number; ponta: number; ini: number; gr: number; curva: number; gIni: number; gVoo: number; gRaio: number };
type Goo = { ox: number; oy: number; RB: number; tent: Tentacle[]; fase: number };

/** cada troca sorteia a sua gosma: para onde vão os tentáculos (só para onde há tela), até onde, a grossura e as gotas */
function newGoo(ox: number, oy: number, W: number, H: number): Goo {
  const Rmax = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy));
  const tent: Tentacle[] = [];
  let tries = 0;
  while (tent.length < NT && tries++ < 240) {
    // o y do desenho cresce para cima e o da tela para baixo
    const a = Math.random() * VOLTA, c = Math.cos(a), sn = -Math.sin(a);
    const reach = Math.min(c > 1e-6 ? (W - ox) / c : c < -1e-6 ? -ox / c : 1e9, sn > 1e-6 ? (H - oy) / sn : sn < -1e-6 ? -oy / sn : 1e9);
    if (reach < 0.3 * Rmax) continue;
    if (tent.some(q => Math.min(Math.abs(a - q.a), VOLTA - Math.abs(a - q.a)) < 0.34)) continue;
    const ini = 0.02 + 0.2 * Math.random();
    tent.push({
      a, ini, ponta: Math.min(reach * 0.92, (0.45 + 0.35 * Math.random()) * Rmax), gr: 26 + 20 * Math.random(),
      curva: (Math.random() < 0.5 ? -1 : 1) * (0.05 + 0.07 * Math.random()),
      gIni: ini + 0.14 + 0.1 * Math.random(), gVoo: 40 + 50 * Math.random(), gRaio: 7 + 6 * Math.random(),
    });
  }
  return { ox, oy, RB: (Rmax / 0.895) * 1.03 + 4, tent, fase: Math.random() * VOLTA };
}

function so(x: number) { 'worklet'; return Math.sin((x < 0 ? 0 : x > 1 ? 1 : x) * (Math.PI / 2)); }
function io(x: number) { 'worklet'; return 0.5 - 0.5 * Math.cos((x < 0 ? 0 : x > 1 ? 1 : x) * Math.PI); }
/** o raio do corpo: sai devagar do botão e depois cresce em curva suave */
function body(RB: number, t: number) { 'worklet'; return (0.12 * so(t / 0.4) + 0.88 * io((t - 0.28) / 0.72)) * RB; }

/** a gosma já cobre a tela toda? Confere o corpo (a mesma conta do desenho) em 96 direções e nos quatro cantos, com folga */
function covers(g: Goo, t: number, W: number, H: number) {
  const f = g.fase + 3 * t, B = body(g.RB, t), y0 = H - g.oy;
  for (let i = 0; i < 100; i++) {
    const th = i < 96 ? (i * VOLTA) / 96 : Math.atan2((i & 1 ? H : 0) - y0, (i & 2 ? W : 0) - g.ox);
    const c = Math.cos(th), s = Math.sin(th);
    const edge = Math.min(c > 1e-6 ? (W - g.ox) / c : c < -1e-6 ? -g.ox / c : 1e9, s > 1e-6 ? (H - y0) / s : s < -1e-6 ? -y0 / s : 1e9);
    if (B * (1 + 0.05 * Math.sin(2 * th + f) + 0.035 * Math.sin(3 * th - 1.3 * f) + 0.02 * Math.sin(5 * th + 2.1 * f)) < edge * 1.01 + 2) return false;
  }
  return true;
}
/** o instante em que ela acaba de cobrir: a troca não fica parada com a tela já toda escura */
function coverage(g: Goo, W: number, H: number) {
  let t = 1;
  while (t > 0.5 && covers(g, t - 0.004, W, H)) t -= 0.004;
  return t;
}

/** um quadro: t vai de 0 (nada) a 1 (tela coberta); alfa esmaece a gosma inteira. O corpo sai devagar e cresce em curva suave; os
    tentáculos vão na frente até o alvo e o corpo os engole; cada gota se solta da ponta, estica e volta */
function frame(g: Goo, t: number, alfa: number, H: number, color: number[]) {
  'worklet';
  const full = t >= 1, B = full ? 1e5 : body(g.RB, t);
  const uT: number[] = [], uG: number[] = [];
  for (let i = 0; i < NT; i++) {
    const q = full ? undefined : g.tent[i];
    if (!q) {
      uT.push(0, 0, 1, 0);
      if (i < NG) uG.push(0, 0, -UNE);
      continue;
    }
    const ponta = q.ponta * so((t - q.ini) / 0.45), L = ponta > B ? ponta - B : 0;
    uT.push(q.a, L, Math.min(0.7, Math.max(0.03, (0.6 * q.gr) / Math.max(B + 0.5 * L, 24))), q.curva);
    if (i < NG) {
      const w = (t - q.gIni) / 0.34, sen = w > 0 && w < 1 ? Math.sin(w * Math.PI) : 0;
      const dist = Math.max(B, ponta) + 10 + q.gVoo * sen, ang = q.a + q.curva * Math.sin(dist * ONDA + 3 * q.a);
      uG.push(g.ox + dist * Math.cos(ang), H - g.oy + dist * Math.sin(ang), -UNE + (q.gRaio + UNE) * Math.pow(sen, 0.6));
    }
  }
  return { uO: [g.ox, H - g.oy], uB: B, uK: UNE, uA: alfa, uF: g.fase + 3 * t, uW: ONDA, uH: H, uE: BORDA, uT, uG, uC: color };
}

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

type Props = {
  /** centro do botão da lua, em pontos da janela */
  origin: { x: number; y: number };
  toDark: boolean;
  /** a cor da mancha: o chão do tema escuro (#rrggbb) */
  color: string;
  /** o tema pedido já está pintado por baixo? Só então a mancha descobre a tela */
  painted: boolean;
  /** chamado com a tela inteira coberta: é aqui que o tema troca */
  onCovered: () => void;
  /** chamado quando a mancha sumiu (ou quando o tempo estourou: a tela nunca fica coberta) */
  onEnd: () => void;
};

export function ThemeGoo({ origin, toDark, color, painted, onCovered, onEnd }: Props) {
  const { width: W, height: H } = useWindowDimensions();
  // sorteada uma vez por troca (o componente nasce a cada troca)
  const [{ goo, tc, tint }] = useState(() => { const g = newGoo(origin.x, origin.y, W, H); return { goo: g, tc: coverage(g, W, H), tint: rgb(color) }; });
  // mode: 0 cresce (t = k·tc), 1 tela cheia, 2 recolhe (t = tc·(1 − k^1,35))
  const mode = useSharedValue(toDark ? 0 : 1);
  const k = useSharedValue(0);
  const alpha = useSharedValue(toDark ? 1 : 0);
  const revealed = useRef(false);
  const handlers = useRef({ onCovered, onEnd });
  useEffect(() => { handlers.current = { onCovered, onEnd }; });

  // 1) cobrir a tela e avisar
  useEffect(() => {
    const cover = toDark ? CRESCE * tc : COBRE;
    if (toDark) k.set(withTiming(1, { duration: cover, easing: Easing.linear }));
    else alpha.set(withTiming(1, { duration: cover, easing: Easing.linear }));
    const timer = setTimeout(() => { mode.set(1); alpha.set(1); handlers.current.onCovered(); }, cover + 20);
    // rede de segurança: a tela nunca fica coberta
    const guard = setTimeout(() => handlers.current.onEnd(), cover + (toDark ? SOME : RECOLHE * tc) + FOLGA);
    return () => { clearTimeout(timer); clearTimeout(guard); };
  }, [toDark, tc, k, alpha, mode]);

  // 2) as cores novas já estão por baixo (dois quadros de folga): esmaecer, ou recolher para o botão
  useEffect(() => {
    if (!painted || revealed.current) return;
    revealed.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined, second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const leave = toDark ? SOME : RECOLHE * tc;
        if (toDark) alpha.set(withTiming(0, { duration: leave, easing: Easing.linear }));
        else { k.set(0); mode.set(2); k.set(withTiming(1, { duration: leave, easing: Easing.linear })); }
        timer = setTimeout(() => handlers.current.onEnd(), leave + 30);
      });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); if (timer) clearTimeout(timer); };
  }, [painted, toDark, tc, k, alpha, mode]);

  const uniforms = useDerivedValue(() => {
    const m = mode.get(), p = k.get();
    return frame(goo, m === 0 ? p * tc : m === 1 ? 1 : tc * (1 - Math.pow(p, 1.35)), alpha.get(), H, tint);
  });

  if (!effect) return null;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, s.root]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Fill><Shader source={effect} uniforms={uniforms} /></Fill>
      </Canvas>
    </View>
  );
}

const s = StyleSheet.create({ root: { zIndex: 30 } });
