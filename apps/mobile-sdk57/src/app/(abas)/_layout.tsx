import { Tabs, type BottomTabNavigationOptions } from 'expo-router/js-tabs';
import { Easing } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { TabBar, TabScene, TAB_MS, TAB_SHIFT } from '@/components/tab-bar';
import { useSession } from '@/components/session';
import { useTheme } from '@/theme';

// Abas da área logada (cliente e prestador). O grupo entre parênteses não entra no endereço:
// as telas continuam em /minha-conta, /buscar-prestadores e /solicitacoes.
// A barra (TabBar) existe uma vez só, aqui; as abas visitadas ficam montadas e as telas de detalhe
// (propostas, chat, configurações…) abrem por cima, no Stack da raiz.
// Troca de aba: a animação de cena da própria biblioteca (`animation: 'shift'`), com o deslocamento reduzido a 24 pt e
// 200 ms de saída suave, no driver nativo. A aba nova chega do lado em que ela fica na barra (a da direita entra pela
// direita), acompanhando o destaque verde. As abas continuam montadas e guardam a rolagem. "Reduzir movimento": troca seca.
// Na primeira visita a uma aba a biblioteca não anima (a cena acabou de nascer): o TabScene faz a mesma entrada.
const slide: NonNullable<BottomTabNavigationOptions['sceneStyleInterpolator']> = ({ current }) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
    transform: [{ translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-TAB_SHIFT, 0, TAB_SHIFT] }) }],
  },
});
const spec: NonNullable<BottomTabNavigationOptions['transitionSpec']> = { animation: 'timing', config: { duration: TAB_MS, easing: Easing.out(Easing.cubic) } };
// Só as telas declaradas abaixo viram aba. O prestador não tem a aba Profissionais (href: null a esconde).
export default function TabsLayout() {
  const { colors } = useTheme();
  const { session } = useSession();
  const provider = session?.role === 'provider';
  const reduced = useReducedMotion();
  const motion: BottomTabNavigationOptions = reduced ? { animation: 'none' } : { animation: 'shift', sceneStyleInterpolator: slide, transitionSpec: spec };
  return <Tabs tabBar={props => <TabBar {...props} />} backBehavior="initialRoute"
    screenLayout={({ children, route, navigation }) => <TabScene index={navigation.getState().routes.findIndex((item: { name: string }) => item.name === route.name)}>{children}</TabScene>}
    screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, ...motion }}>
    <Tabs.Screen name="minha-conta" options={{ title: 'Início' }} />
    <Tabs.Screen name="buscar-prestadores" options={{ title: 'Profissionais', href: provider ? null : undefined }} />
    <Tabs.Screen name="solicitacoes" options={{ title: 'Pedidos', tabBarAccessibilityLabel: provider ? 'Pedidos e propostas' : 'Pedidos' }} />
  </Tabs>;
}
