import { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { IntroAnimation } from '@/components/intro-animation';
import { ToastProvider } from '@/components/toast';
import { SHEET_ROUTES } from '@/components/toast-host';
import { ThemeProvider, useTheme } from '@/theme';
import * as SystemUI from 'expo-system-ui';
import { SessionProvider, useSession } from '@/components/session';
import { Stack, router, usePathname, type Href, type NativeStackNavigationOptions } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

// Guarda central: senha provisória pendente prende o usuário na tela de troca; administrador só usa /admin.
// A tela de entrada (/entrar) faz o próprio redirecionamento.
function SessionGate() {
  const { session } = useSession();
  const pathname = usePathname();
  const must = session?.mustChangePassword === true, admin = session?.role === 'admin', signedIn = !!session;
  useEffect(() => {
    if (!signedIn || pathname === '/entrar') return;
    const change = pathname === '/trocar-senha-provisoria';
    // Todo redirecionamento reinicia a pilha (volta à primeira tela e a substitui). Um `replace` sozinho troca só a tela
    // do topo: se houver uma folha aberta por baixo, a tela nova herda a apresentação de folha (cantos arredondados,
    // fundo cinza atrás, e a troca de tema, desenhada na raiz, fica escondida atrás da folha nativa).
    const go = (href: Href) => { if (router.canDismiss()) router.dismissAll(); router.replace(href); };
    if (must) { if (!change) go('/trocar-senha-provisoria'); }
    else if (admin) { if (!pathname.startsWith('/admin')) go('/admin'); }
    else if (change) go('/minha-conta');
  }, [signedIn, must, admin, pathname]);
  return null;
}
// Barra de status, fundo das telas e fundo nativo (atrás do teclado e das transições) acompanham o tema.
// Ao escurecer, a barra de status já fica clara no toque, porque a cobertura passa pelo topo primeiro.
//
// Transições entre telas (tudo nativo, do react-native-screens):
// - Detalhes: padrão do iOS (desliza da direita, volta arrastando da borda). Nada declarado.
// - Telas de ação: folha que sobe de baixo e fecha arrastando para baixo, inclusive pelo conteúdo quando a rolagem está
//   no topo (`presentation: 'formSheet'` com um único ponto de parada, na altura cheia, e a alça visível). Com
//   `presentation: 'modal'` o ScrollView engole o arrasto e a folha não fecha. A troca obrigatória da senha provisória
//   também é folha, mas não fecha por gesto. A duração da subida é a do sistema (não é configurável em folhas).
// - Entrar e sair da conta: a área logada e a tela de entrada chegam com esmaecimento curto em vez de corte seco.
// "Reduzir movimento": folhas e esmaecimento aparecem direto, sem animação.
const FADE_MS = 220;
function Shell() {
  const { name, target, colors } = useTheme();
  const { session } = useSession();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  useEffect(() => { void SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {}); }, [colors.bg]);
  // A tela de entrada desliza quando vem da tela inicial e esmaece quando vem de um logout (ou sessão expirada).
  const signedIn = !!session;
  const [wasSignedIn, setWasSignedIn] = useState(signedIn);
  const [leaving, setLeaving] = useState(false);
  if (wasSignedIn !== signedIn) { setWasSignedIn(signedIn); setLeaving(!signedIn); }
  useEffect(() => {
    if (!leaving || pathname !== '/entrar') return;
    const timer = setTimeout(() => setLeaving(false), FADE_MS + 400);
    return () => clearTimeout(timer);
  }, [leaving, pathname]);
  const fade = reduced ? { animation: 'none' } as const : { animation: 'fade', animationDuration: FADE_MS } as const;
  const sheet: NativeStackNavigationOptions = { presentation: 'formSheet', sheetAllowedDetents: [1], sheetGrabberVisible: true, sheetCornerRadius: 28, animation: reduced ? 'none' : 'default' };
  return <>
    <StatusBar style={name === 'dark' || target === 'dark' ? 'light' : 'dark'} />
    <SessionGate />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(abas)" options={fade} />
      <Stack.Screen name="admin/index" options={fade} />
      <Stack.Screen name="entrar" options={leaving ? fade : undefined} />
      {SHEET_ROUTES.map(route => <Stack.Screen key={route} name={route} options={route === 'trocar-senha-provisoria' ? { ...sheet, gestureEnabled: false } : sheet} />)}
    </Stack>
    <IntroAnimation />
  </>;
}
// Ordem: tema (com a transição por cima de tudo) › avisos em gota › sessão › telas.
export default function RootLayout() {
  return <ThemeProvider><ToastProvider><SessionProvider><Shell /></SessionProvider></ToastProvider></ThemeProvider>;
}
