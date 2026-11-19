import { useRef } from 'react';
import { PressableScale } from '@/components/pressable-scale';
import { router, useScrollToTop } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TAB_EDGES } from './tab-bar';
import { ThemeToggle } from './theme-toggle';
import { usePullRefresh } from './pull-refresh';
import { AttentionSeal, AWAITING } from './completion';
import { useCatalog } from '@/hooks/use-catalog';
import Animated from 'react-native-reanimated';
import { ListEntrance, StaggerItem, useStatusPulse } from './list-entrance';
import { Skeleton } from './skeleton';
import { themed } from '@/theme';

export type CustomerRequest = { id: string; category: string; neighborhood: string; neighborhood_label?: string; status: string; can_confirm_completion?: boolean };
type Props = {
  role?: 'customer' | 'provider';
  profile: { name: string; neighborhood: string; city: string; state: string; approvalStatus?: string; approvalReason?: string };
  requests: CustomerRequest[]; requestsLoading: boolean; requestsError: string;
  accountError: string; signingOut: boolean; onRetry: () => void; onLogout: () => void;
  /** puxar para atualizar: recarrega perfil e últimos pedidos sem apagar a tela */
  onRefresh?: () => unknown;
};
export function CustomerDashboard({ role = 'customer', profile, requests, requestsLoading, requestsError, accountError, signingOut, onRetry, onLogout, onRefresh }: Props) {
 const s=useS();const pull=usePullRefresh(onRefresh);
  const provider = role === 'provider';
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  // Tocar na aba Início já ativa leva a tela ao topo (a barra das abas fica em src/app/(abas)/_layout.tsx).
  useScrollToTop(scroll);
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 350 || fontScale > 1.2;
  const catalog = useCatalog();
  const neighborhood = catalog.data?.neighborhoods.find(item => item.value === profile.neighborhood)?.label ?? profile.neighborhood;
  const firstName = profile.name.trim().split(/\s+/)[0];
  return <SafeAreaView edges={TAB_EDGES} style={s.safe}>
    <ScrollView {...pull.props} ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.page}>
      <View style={s.header}>
        <Image source={require('../../assets/brand/logotipo-preto.png')} style={s.logo} resizeMode="contain" accessibilityLabel="Maridão" />
        <View style={s.headerEnd}><View style={s.accountTag}><View style={s.avatar} accessible={false}><Text style={s.initial}>{firstName?.slice(0, 1).toLocaleUpperCase('pt-BR')}</Text></View><Text style={s.accountLabel}>{provider ? 'PRESTADOR' : 'CLIENTE'}</Text></View><ThemeToggle /></View>
      </View>
      <View style={s.greeting}>
        <Text style={s.eyebrow}>{provider ? 'SEU TRABALHO FAZ A DIFERENÇA' : 'BOM TER VOCÊ POR AQUI'}</Text>
        <Text accessibilityRole="header" style={s.title}>{provider ? profile.name : firstName ? 'Olá, ' + firstName + '.' : 'Olá!'}</Text>
        <View style={s.location}><View style={s.dot} /><Text style={s.locationText}>{provider ? '' : neighborhood + ' · '}{profile.city} – {profile.state}</Text></View>
      </View>
      {provider && profile.approvalStatus === 'Em análise' ? <View accessible accessibilityRole="alert" style={s.review}><Text style={s.reviewTag}>CADASTRO EM ANÁLISE</Text><Text style={s.reviewText}>Seu cadastro está em análise. Seu perfil aparecerá nas buscas e você poderá enviar propostas depois da aprovação de um administrador.</Text></View> : null}
      {provider && profile.approvalStatus === 'Rejeitado' ? <View accessible accessibilityRole="alert" style={[s.review, s.rejected]}><Text style={[s.reviewTag, s.rejectedTag]}>CADASTRO REJEITADO</Text><Text style={[s.reviewText, s.rejectedText]}>Seu cadastro foi rejeitado pela administração. Seu perfil não aparece nas buscas e você não pode enviar propostas.</Text>{profile.approvalReason ? <Text style={[s.reviewText, s.rejectedText]}><Text style={s.reviewStrong}>Motivo: </Text>{profile.approvalReason}</Text> : null}</View> : null}
      <View style={s.hero}>
        <View style={s.heroTop}><Text style={s.heroTag}>{provider ? 'OPORTUNIDADES PERTO DE VOCÊ' : 'UMA MÃOZINHA PARA O SEU DIA'}</Text><Text accessible={false} style={s.spark}>✦</Text></View>
        <Text accessibilityRole="header" style={s.heroTitle}>{provider ? 'Sua próxima\nconquista começa aqui.' : 'O que vamos\nresolver hoje?'}</Text>
        <Text style={s.heroDescription}>{provider ? 'Encontre pedidos para seus serviços e envie sua proposta para quem precisa de uma mãozinha.' : 'Conte o que precisa e receba propostas de quem atende sua região.'}</Text>
        <PressableScale accessibilityRole="button" onPress={() => router.push(provider ? '/solicitacoes' : '/nova-solicitacao')} style={s.newRequest}><Text style={s.newRequestText}>{provider ? 'Consultar pedidos' : 'Pedir um serviço'}</Text><Text style={s.arrowGreen} accessible={false}>↗</Text></PressableScale>
      </View>
      {!provider && <View style={[s.shortcuts, stacked && { flexDirection: 'column' }]}>
        <PressableScale accessibilityRole="button" accessibilityLabel="Encontrar profissionais. Buscar prestadores." onPress={() => router.push('/buscar-prestadores')} scaleTo={0.98} style={[s.shortcut, s.searchCard]}>
          <Text style={s.shortcutMark} accessible={false}>↗</Text><Text style={s.searchTitle}>Encontrar{'\n'}profissionais</Text><Text style={s.searchDescription}>Busque por serviço e bairro.</Text>
        </PressableScale>
        <PressableScale accessibilityRole="button" accessibilityLabel="Meus pedidos. Ver todas as solicitações." onPress={() => router.push('/solicitacoes')} scaleTo={0.98} style={[s.shortcut, s.requestsCard]}>
          <Text style={s.shortcutMarkDark} accessible={false}>↗</Text><Text style={s.shortcutTitle}>Meus{'\n'}pedidos</Text><Text style={s.shortcutDescription}>Propostas e andamento.</Text>
        </PressableScale>
      </View>}
      <ListEntrance ready={!requestsLoading}><View style={s.recentSection}>
        <View style={s.sectionHeader}><Text accessibilityRole="header" style={s.sectionTitle}>{provider ? 'Solicitações e propostas' : 'Últimos pedidos'}</Text><Pressable accessibilityRole="button" onPress={() => router.push('/solicitacoes')} style={s.seeAll}><Text style={s.seeAllText}>Ver todos ↗</Text></Pressable></View>
        {requestsLoading ? <Skeleton shape="rows" /> : requestsError ? <View style={s.empty}><Text accessibilityRole="alert" style={s.error}>{requestsError}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={s.retry}><Text style={s.retryText}>Tentar novamente</Text></Pressable></View> : requests.length ? requests.slice(0, 2).map((request, index) => <StaggerItem key={request.id} index={index}><PressableScale accessibilityRole="button" accessibilityLabel={request.category + '. ' + request.status + (request.can_confirm_completion ? '. Confirme a conclusão' : '') + '. Ver detalhes e propostas.'} onPress={() => router.push({ pathname: '/propostas', params: { id: request.id } })} scaleTo={0.98} style={s.requestRow}>
          <View style={s.requestTop}><Text style={s.requestTitle} numberOfLines={2}>{request.category}</Text><RowStatus status={request.status} /></View>
          {request.can_confirm_completion ? <AttentionSeal label="Confirme a conclusão" /> : null}
          <View style={s.requestBottom}><Text style={s.requestPlace} numberOfLines={2}>{request.neighborhood_label ?? request.neighborhood}</Text><Text style={s.requestArrow} accessible={false}>↗</Text></View>
        </PressableScale></StaggerItem>) : <View style={s.empty}><Text style={s.emptyTitle}>{provider ? 'Novas oportunidades passam por aqui.' : 'Seu primeiro pedido começa aqui.'}</Text><Text style={s.helper}>{provider ? 'Os pedidos compatíveis com seus serviços e sua região aparecerão aqui, junto das solicitações para as quais você enviou propostas.' : 'Quando você publicar uma solicitação, ela aparecerá neste espaço.'}</Text><Pressable accessibilityRole="button" onPress={() => router.push(provider ? '/solicitacoes' : '/nova-solicitacao')} style={s.retry}><Text style={s.retryText}>{provider ? 'Consultar solicitações ↗' : 'Criar meu primeiro pedido ↗'}</Text></Pressable></View>}
      </View></ListEntrance>
      <PressableScale accessibilityRole="button" onPress={()=>router.push('/historico')} scaleTo={0.98} style={s.empty}><Text style={s.emptyTitle}>Meu histórico ↗</Text><Text style={s.helper}>{provider?'Consulte suas propostas e atendimentos anteriores.':'Reveja seus pedidos, propostas escolhidas e atendimentos.'}</Text></PressableScale>
      <PressableScale accessibilityRole="button" onPress={()=>router.push('/configuracoes')} scaleTo={0.98} style={s.empty}><Text style={s.emptyTitle}>Menu · Configurações ↗</Text><Text style={s.helper}>Editar perfil, senha e dados da conta.</Text></PressableScale><PressableScale accessibilityRole="button" onPress={()=>router.push('/notificacoes')} scaleTo={0.98} style={s.empty}><Text style={s.emptyTitle}>Notificações ↗</Text><Text style={s.helper}>Propostas, mensagens e atualizações dos pedidos.</Text></PressableScale>{accountError ? <Text accessibilityRole="alert" style={s.error}>{accountError}</Text> : null}
      <View style={s.footer}><Text style={s.footerText}>Conectando quem precisa a quem sabe fazer.</Text><Pressable accessibilityRole="button" disabled={signingOut} accessibilityState={{ disabled: signingOut, busy: signingOut }} onPress={onLogout} style={s.logout}><Text style={s.logoutText}>{signingOut ? 'Saindo…' : 'Sair da conta'}</Text></Pressable></View>
    </ScrollView>
  </SafeAreaView>;
}
// Etiqueta de status da linha do painel: pulsa quando o valor muda com a linha na tela (ex.: depois de puxar para atualizar).
function RowStatus({ status }: { status: string }) {
  const s = useS();
  const pulse = useStatusPulse(status);
  return <Animated.Text style={[s.status, (status === 'Em andamento' || status === AWAITING) && s.statusActive, status === 'Concluída' && s.statusDone, pulse]}>{status}</Animated.Text>;
}
const useS = themed(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 16, gap: 22, width: '100%', maxWidth: 520, alignSelf: 'center' },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  logo: { width: 146, height: 44, tintColor: colors.text },
  headerEnd: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  accountTag: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '700', fontSize: 17, color: colors.onAccentSoft},
  accountLabel: { fontSize: 9, letterSpacing: 0.8, fontWeight: '700', color: colors.textMuted },
  greeting: { gap: 8 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: colors.textMuted },
  title: { fontSize: 36, lineHeight: 42, fontWeight: '800', letterSpacing: -1.2, color: colors.text },
  location: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.link },
  locationText: { fontSize: 12, lineHeight: 18, color: colors.textMuted, flexShrink: 1 },
  review: { backgroundColor: colors.ink, borderRadius: 24, padding: 20, gap: 10, borderWidth: 1, borderColor: colors.inkBorder },
  reviewTag: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: colors.onInkAccent },
  reviewText: { fontSize: 15, lineHeight: 22, color: colors.onInk },
  reviewStrong: { fontWeight: '700' },
  rejected: { backgroundColor: colors.dangerSoft, borderWidth: 2, borderColor: colors.danger },
  rejectedTag: { color: colors.danger },
  rejectedText: { color: colors.text },
  hero: { backgroundColor: colors.accent, padding: 22, borderRadius: 28, gap: 13 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heroTag: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: colors.onAccentMuted, flexShrink: 1 },
  spark: { fontSize: 24, color: colors.onAccent, lineHeight: 27 },
  heroTitle: { fontSize: 32, lineHeight: 35, fontWeight: '800', letterSpacing: -1, color: colors.onAccent},
  heroDescription: { fontSize: 13, lineHeight: 19, maxWidth: 300, color: colors.onAccentMuted },
  newRequest: { backgroundColor: colors.onAccent, minHeight: 52, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 3 },
  newRequestText: { color: colors.onInk, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  arrowGreen: { fontSize: 23, color: colors.onInkAccent },
  shortcuts: { flexDirection: 'row', gap: 12 },
  shortcut: { flex: 1, minHeight: 152, borderRadius: 24, padding: 16, gap: 10 },
  searchCard: { backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.inkBorder },
  requestsCard: { backgroundColor: colors.surface },
  shortcutMark: { alignSelf: 'flex-end', color: colors.onInkAccent, fontSize: 22, lineHeight: 22 },
  shortcutMarkDark: { alignSelf: 'flex-end', color: colors.text, fontSize: 22, lineHeight: 22 },
  searchTitle: { fontSize: 21, lineHeight: 25, letterSpacing: -0.5, fontWeight: '700', color: colors.onInk },
  shortcutTitle: { fontSize: 21, lineHeight: 25, letterSpacing: -0.5, fontWeight: '700', color: colors.text },
  searchDescription: { fontSize: 11, lineHeight: 16, color: colors.onInkSoft },
  shortcutDescription: { fontSize: 11, lineHeight: 16, color: colors.textMuted },
  recentSection: { gap: 10 },
  sectionHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5, color: colors.text },
  seeAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  seeAllText: { fontSize: 12, color: colors.link, fontWeight: '600' },
  requestRow: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 16, gap: 12 },
  requestTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  requestTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.text, flexGrow: 1, flexShrink: 1, flexBasis: '52%' },
  status: { fontSize: 10, fontWeight: '600', color: colors.onAccentSoftMuted, backgroundColor: colors.accentSoft, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: 9, paddingVertical: 5, overflow: 'hidden' },
  statusActive: { color: colors.onAccent, backgroundColor: colors.accent },
  statusDone: { color: colors.onInk, backgroundColor: colors.ink, borderColor: colors.inkBorder },
  requestBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  requestPlace: { fontSize: 12, lineHeight: 18, color: colors.textMuted, flex: 1 },
  requestArrow: { fontSize: 20, color: colors.textMuted },
  empty: { borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 20, gap: 9 },
  emptyTitle: { fontSize: 17, lineHeight: 23, fontWeight: '600', color: colors.text },
  helper: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  retryText: { fontSize: 13, color: colors.text, fontWeight: '600', textDecorationLine: 'underline' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  footer: { alignItems: 'center', gap: 2 },
  footerText: { fontSize: 11, lineHeight: 17, textAlign: 'center', color: colors.textMuted },
  logout: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12 },
  logoutText: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'underline' },
  pressed: { opacity: 0.75 },
}));
