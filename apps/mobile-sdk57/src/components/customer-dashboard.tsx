import { useRef } from 'react';
import { router } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from './access-screen';
import { ClientNavigation } from './client-navigation';
import { useCatalog } from '@/hooks/use-catalog';

export type CustomerRequest = { id: string; category: string; neighborhood: string; neighborhood_label?: string; status: string };
type Props = {
  role?: 'customer' | 'provider';
  profile: { name: string; neighborhood: string; city: string; state: string };
  requests: CustomerRequest[]; requestsLoading: boolean; requestsError: string;
  accountError: string; signingOut: boolean; onRetry: () => void; onLogout: () => void;
};
export function CustomerDashboard({ role = 'customer', profile, requests, requestsLoading, requestsError, accountError, signingOut, onRetry, onLogout }: Props) {
  const provider = role === 'provider';
  const scroll = useRef<ScrollView>(null);
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 350 || fontScale > 1.2;
  const catalog = useCatalog();
  const neighborhood = catalog.data?.neighborhoods.find(item => item.value === profile.neighborhood)?.label ?? profile.neighborhood;
  const firstName = profile.name.trim().split(/\s+/)[0];
  return <SafeAreaView style={s.safe}>
    <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.page}>
      <View style={s.header}>
        <Image source={require('../../assets/brand/logotipo-preto.png')} style={s.logo} resizeMode="contain" accessibilityLabel="Maridão" />
        <View style={s.accountTag}><View style={s.avatar} accessible={false}><Text style={s.initial}>{firstName?.slice(0, 1).toLocaleUpperCase('pt-BR')}</Text></View><Text style={s.accountLabel}>{provider ? 'PRESTADOR' : 'CLIENTE'}</Text></View>
      </View>
      <View style={s.greeting}>
        <Text style={s.eyebrow}>{provider ? 'SEU TRABALHO FAZ A DIFERENÇA' : 'BOM TER VOCÊ POR AQUI'}</Text>
        <Text accessibilityRole="header" style={s.title}>{provider ? profile.name : firstName ? 'Olá, ' + firstName + '.' : 'Olá!'}</Text>
        <View style={s.location}><View style={s.dot} /><Text style={s.locationText}>{provider ? '' : neighborhood + ' · '}{profile.city} – {profile.state}</Text></View>
      </View>
      <View style={s.hero}>
        <View style={s.heroTop}><Text style={s.heroTag}>{provider ? 'OPORTUNIDADES PERTO DE VOCÊ' : 'UMA MÃOZINHA PARA O SEU DIA'}</Text><Text accessible={false} style={s.spark}>✦</Text></View>
        <Text accessibilityRole="header" style={s.heroTitle}>{provider ? 'Sua próxima\nconquista começa aqui.' : 'O que vamos\nresolver hoje?'}</Text>
        <Text style={s.heroDescription}>{provider ? 'Encontre pedidos para seus serviços e envie sua proposta para quem precisa de uma mãozinha.' : 'Conte o que precisa e receba propostas de quem atende sua região.'}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push(provider ? './solicitacoes' : './nova-solicitacao')} style={({ pressed }) => [s.newRequest, pressed && s.pressed]}><Text style={s.newRequestText}>{provider ? 'Consultar pedidos' : 'Pedir um serviço'}</Text><Text style={s.arrowGreen} accessible={false}>↗</Text></Pressable>
      </View>
      {!provider && <View style={[s.shortcuts, stacked && { flexDirection: 'column' }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Encontrar profissionais. Buscar prestadores." onPress={() => router.push('./buscar-prestadores')} style={({ pressed }) => [s.shortcut, s.searchCard, pressed && s.pressed]}>
          <Text style={s.shortcutMark} accessible={false}>↗</Text><Text style={s.searchTitle}>Encontrar{'\n'}profissionais</Text><Text style={s.searchDescription}>Busque por serviço e bairro.</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Meus pedidos. Ver todas as solicitações." onPress={() => router.push('./solicitacoes')} style={({ pressed }) => [s.shortcut, s.requestsCard, pressed && s.pressed]}>
          <Text style={s.shortcutMarkDark} accessible={false}>↗</Text><Text style={s.shortcutTitle}>Meus{'\n'}pedidos</Text><Text style={s.shortcutDescription}>Propostas e andamento.</Text>
        </Pressable>
      </View>}
      <View style={s.recentSection}>
        <View style={s.sectionHeader}><Text accessibilityRole="header" style={s.sectionTitle}>{provider ? 'Solicitações e propostas' : 'Últimos pedidos'}</Text><Pressable accessibilityRole="button" onPress={() => router.push('./solicitacoes')} style={s.seeAll}><Text style={s.seeAllText}>Ver todos ↗</Text></Pressable></View>
        {requestsLoading ? <Text style={s.helper}>{provider ? 'Buscando solicitações…' : 'Carregando seus pedidos…'}</Text> : requestsError ? <View style={s.empty}><Text accessibilityRole="alert" style={s.error}>{requestsError}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={s.retry}><Text style={s.retryText}>Tentar novamente</Text></Pressable></View> : requests.length ? requests.slice(0, 2).map(request => <Pressable key={request.id} accessibilityRole="button" accessibilityLabel={request.category + '. ' + request.status + '. Ver detalhes e propostas.'} onPress={() => router.push({ pathname: './propostas', params: { id: request.id } })} style={({ pressed }) => [s.requestRow, pressed && s.pressed]}>
          <View style={s.requestTop}><Text style={s.requestTitle} numberOfLines={2}>{request.category}</Text><Text style={[s.status, request.status === 'Em andamento' && s.statusActive, request.status === 'Concluída' && s.statusDone]}>{request.status}</Text></View>
          <View style={s.requestBottom}><Text style={s.requestPlace} numberOfLines={2}>{request.neighborhood_label ?? request.neighborhood}</Text><Text style={s.requestArrow} accessible={false}>↗</Text></View>
        </Pressable>) : <View style={s.empty}><Text style={s.emptyTitle}>{provider ? 'Novas oportunidades passam por aqui.' : 'Seu primeiro pedido começa aqui.'}</Text><Text style={s.helper}>{provider ? 'Os pedidos compatíveis com seus serviços e sua região aparecerão aqui, junto das solicitações para as quais você enviou propostas.' : 'Quando você publicar uma solicitação, ela aparecerá neste espaço.'}</Text><Pressable accessibilityRole="button" onPress={() => router.push(provider ? './solicitacoes' : './nova-solicitacao')} style={s.retry}><Text style={s.retryText}>{provider ? 'Consultar solicitações ↗' : 'Criar meu primeiro pedido ↗'}</Text></Pressable></View>}
      </View>
      {accountError ? <Text accessibilityRole="alert" style={s.error}>{accountError}</Text> : null}
      <View style={s.footer}><Text style={s.footerText}>Conectando quem precisa a quem sabe fazer.</Text><Pressable accessibilityRole="button" disabled={signingOut} accessibilityState={{ disabled: signingOut, busy: signingOut }} onPress={onLogout} style={s.logout}><Text style={s.logoutText}>{signingOut ? 'Saindo…' : 'Sair da conta'}</Text></Pressable></View>
    </ScrollView>
    {provider ? <View style={s.dockWrap}><View style={s.dock}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: true }} onPress={() => scroll.current?.scrollTo({ y: 0, animated: true })} style={[s.dockItem, s.dockActive]}><Text style={s.dockActiveText}>Início</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('./solicitacoes')} style={s.dockItem}><Text style={s.dockText}>{provider ? 'Pedidos e propostas' : 'Pedidos'}</Text></Pressable>
    </View></View> : <ClientNavigation active="home" onActivePress={()=>scroll.current?.scrollTo({y:0,animated:true})}/>}
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  page: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 16, gap: 22, width: '100%', maxWidth: 520, alignSelf: 'center' },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  logo: { width: 146, height: 44 },
  accountTag: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '700', fontSize: 17, color: colors.black },
  accountLabel: { fontSize: 9, letterSpacing: 0.8, fontWeight: '700', color: '#526047' },
  greeting: { gap: 8 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: '#526047' },
  title: { fontSize: 36, lineHeight: 42, fontWeight: '800', letterSpacing: -1.2, color: colors.black },
  location: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#43641F' },
  locationText: { fontSize: 12, lineHeight: 18, color: '#526047', flexShrink: 1 },
  hero: { backgroundColor: colors.green, padding: 22, borderRadius: 28, gap: 13 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heroTag: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: '#263715', flexShrink: 1 },
  spark: { fontSize: 24, color: colors.black, lineHeight: 27 },
  heroTitle: { fontSize: 32, lineHeight: 35, fontWeight: '800', letterSpacing: -1, color: colors.black },
  heroDescription: { fontSize: 13, lineHeight: 19, maxWidth: 300, color: '#263715' },
  newRequest: { backgroundColor: colors.black, minHeight: 52, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 3 },
  newRequestText: { color: colors.white, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  arrowGreen: { fontSize: 23, color: colors.green },
  shortcuts: { flexDirection: 'row', gap: 12 },
  shortcut: { flex: 1, minHeight: 152, borderRadius: 24, padding: 16, gap: 10 },
  searchCard: { backgroundColor: colors.black },
  requestsCard: { backgroundColor: '#F3F6EF' },
  shortcutMark: { alignSelf: 'flex-end', color: colors.green, fontSize: 22, lineHeight: 22 },
  shortcutMarkDark: { alignSelf: 'flex-end', color: colors.black, fontSize: 22, lineHeight: 22 },
  searchTitle: { fontSize: 21, lineHeight: 25, letterSpacing: -0.5, fontWeight: '700', color: colors.white },
  shortcutTitle: { fontSize: 21, lineHeight: 25, letterSpacing: -0.5, fontWeight: '700', color: colors.black },
  searchDescription: { fontSize: 11, lineHeight: 16, color: colors.pale },
  shortcutDescription: { fontSize: 11, lineHeight: 16, color: '#526047' },
  recentSection: { gap: 10 },
  sectionHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5, color: colors.black },
  seeAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  seeAllText: { fontSize: 12, color: '#43552E', fontWeight: '600' },
  requestRow: { borderWidth: 1, borderColor: '#E3E9DC', borderRadius: 20, padding: 16, gap: 12 },
  requestTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  requestTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.black, flexGrow: 1, flexShrink: 1, flexBasis: '52%' },
  status: { fontSize: 10, fontWeight: '600', color: '#39482B', backgroundColor: colors.pale, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  statusActive: { color: colors.black, backgroundColor: colors.green },
  statusDone: { color: colors.white, backgroundColor: colors.black },
  requestBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  requestPlace: { fontSize: 12, lineHeight: 18, color: '#526047', flex: 1 },
  requestArrow: { fontSize: 20, color: '#526047' },
  empty: { borderWidth: 1, borderColor: '#E3E9DC', borderRadius: 22, padding: 20, gap: 9 },
  emptyTitle: { fontSize: 17, lineHeight: 23, fontWeight: '600', color: colors.black },
  helper: { fontSize: 13, lineHeight: 20, color: '#526047' },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  retryText: { fontSize: 13, color: colors.black, fontWeight: '600', textDecorationLine: 'underline' },
  error: { color: '#A32121', fontSize: 14, lineHeight: 21 },
  footer: { alignItems: 'center', gap: 2 },
  footerText: { fontSize: 11, lineHeight: 17, textAlign: 'center', color: '#526047' },
  logout: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12 },
  logoutText: { fontSize: 12, color: '#526047', textDecorationLine: 'underline' },
  dockWrap: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 8, width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: colors.white },
  dock: { backgroundColor: colors.black, borderRadius: 24, padding: 7, flexDirection: 'row', gap: 6 },
  dockItem: { flex: 1, minHeight: 45, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  dockActive: { backgroundColor: colors.green },
  dockText: { color: colors.white, fontSize: 13, fontWeight: '600' },
  dockActiveText: { color: colors.black, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
