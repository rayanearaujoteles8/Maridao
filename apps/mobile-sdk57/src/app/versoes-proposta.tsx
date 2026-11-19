import { useCallback } from 'react';
import { useLocalSearchParams, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { PrivateScreen, usePrivateResource, Feedback, Button, useUi } from '@/components/private-screen';
import { StatusBadge } from '@/components/workflow-screen';
import { ListEntrance, StaggerItem } from '@/components/list-entrance';
import { dateTime, money, shortDate } from '@/components/proposal-versions';
import { themed } from '@/theme';

// UC09.3 / UC06.1 — Versões da proposta. Tela só de consulta: a versão vigente em destaque e, abaixo, as anteriores
// ("Substituída"), da mais recente para a mais antiga. Quem vê: o prestador autor e o cliente do pedido.
type Version = { version: number; current: boolean; status: string; amount: string; description: string; estimated_duration: string; valid_until: string; sent_at: string; replaced_at: string | null; status_before: string | null };
type Data = {
  proposal: { id: string; request_id: string; provider_name: string; status: string; version: number; request_status: string; expired: boolean; versions_count: number; has_previous_versions: boolean; missing_previous_versions: boolean };
  versions: Version[];
  role: 'customer' | 'provider';
};
// O pedido (categoria e bairro) vem da rota do detalhe; a de versões só traz o status dele.
type RequestData = { request: { category: string; neighborhood: string; neighborhood_label?: string; status: string } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ProposalVersions() {
  const s = useS(); const ui = useUi();
  const { requestId, proposalId, from } = useLocalSearchParams<{ requestId?: string; proposalId?: string; from?: string }>();
  const valid = typeof requestId === 'string' && uuid.test(requestId) && typeof proposalId === 'string' && uuid.test(proposalId);
  const r = usePrivateResource<Data>(valid ? `/requests/${requestId}/proposals/${proposalId}/versions` : null);
  const q = usePrivateResource<RequestData>(valid ? `/requests/${requestId}/proposals` : null);
  // Volta para onde a pessoa estava: a lista do histórico ou o detalhe do pedido.
  const back: Href = !valid ? '/solicitacoes' : from === 'historyList' ? '/historico' : { pathname: '/propostas', params: from === 'history' ? { id: requestId, from } : { id: requestId } };
  const backLabel = !valid ? 'Meus pedidos' : from === 'historyList' ? 'Meu histórico' : 'Voltar ao pedido';
  const refreshVersions = r.refresh, refreshRequest = q.refresh;
  const refresh = useCallback(() => Promise.all([refreshVersions(), refreshRequest()]), [refreshVersions, refreshRequest]);
  const data = r.data;
  const request = q.data?.request;
  const current = data?.versions.find(item => item.current) ?? data?.versions[0];
  const previous = data ? data.versions.filter(item => item !== current) : [];
  const provider = data?.role === 'provider';
  return (
    <PrivateScreen title="Versões da proposta" backHref={back} backLabel={backLabel} onRefresh={valid ? refresh : undefined}>
      <ListEntrance ready={!!data}>
        {!valid ? <Text accessibilityRole="alert" style={ui.error}>Proposta inválida. Volte ao pedido e tente novamente.</Text> : null}
        <Feedback busy={r.busy && !data} error={r.error} message="" skeleton="cards" />
        {!data && r.error ? <Button secondary label="Tentar novamente" disabled={r.busy} onPress={() => void r.reload()} /> : null}
        {data && current ? <>
          <StaggerItem index={0}>
            <View style={s.header}>
              <Text style={s.eyebrow}>{provider ? 'SUA PROPOSTA' : 'PROPOSTA DE'}</Text>
              <Text accessibilityRole="header" style={s.provider}>{data.proposal.provider_name}</Text>
              <Text style={s.request}>{request ? `Pedido: ${request.category} · ${request.neighborhood_label ?? request.neighborhood}` : 'Pedido'}</Text>
              <View style={s.row}><Text style={s.meta}>Situação do pedido</Text><StatusBadge status={request?.status ?? data.proposal.request_status} /></View>
              <Text style={s.meta}>{data.versions.length === 1 ? '1 versão registrada' : `${data.versions.length} versões registradas, da mais recente para a mais antiga`}. Datas no horário de Palmas.</Text>
            </View>
          </StaggerItem>
          <StaggerItem index={1}><VersionCard item={current} current expired={data.proposal.expired} /></StaggerItem>
          {previous.length ? <Text accessibilityRole="header" style={s.section}>Versões anteriores</Text> : null}
          {previous.map((item, index) => <StaggerItem key={item.version} index={index + 2}><VersionCard item={item} /></StaggerItem>)}
          {data.proposal.missing_previous_versions ? <View style={s.info}><Text style={s.infoText}>Esta proposta foi alterada antes de o histórico existir; as versões antigas não foram guardadas.</Text></View>
            : !previous.length ? <View style={s.info}><Text style={s.infoTitle}>Esta proposta não foi reenviada.</Text><Text style={s.infoText}>Quando o prestador reenviar, a versão anterior aparecerá aqui como “Substituída”.</Text></View> : null}
        </> : null}
      </ListEntrance>
    </PrivateScreen>
  );
}

// Vigente: contorno forte, selo "VERSÃO VIGENTE" e valor no bloco verde. Anteriores: bloco sóbrio, valor em texto.
function VersionCard({ item, current = false, expired = false }: { item: Version; current?: boolean; expired?: boolean }) {
  const s = useS();
  const status = current && expired && item.status === 'Pendente' ? 'Expirada' : item.status;
  return (
    <View accessible={false} style={current ? s.current : s.previous}>
      <View style={s.row}>
        <View style={s.titleBlock}>
          {current ? <Text style={s.eyebrow}>VERSÃO VIGENTE</Text> : null}
          <Text accessibilityRole="header" style={current ? s.versionCurrent : s.version}>Versão {item.version}</Text>
        </View>
        <StatusBadge status={status} />
      </View>
      <Text accessibilityLabel={`Valor: ${money(item.amount)}`} style={current ? s.priceCurrent : s.price}>{money(item.amount)}</Text>
      <Text selectable style={s.description}>{item.description}</Text>
      <View style={s.facts}>
        <Fact label="Prazo estimado" value={item.estimated_duration} />
        <Fact label={current ? 'Válida até' : 'Validade'} value={shortDate(item.valid_until)} />
        <Fact label="Enviada em" value={dateTime(item.sent_at)} />
        {item.replaced_at ? <Fact label="Substituída em" value={dateTime(item.replaced_at)} /> : null}
      </View>
      {current && status === 'Expirada' ? <Text style={s.note}>A validade terminou em {shortDate(item.valid_until)}.</Text> : null}
      {!current && item.status_before === 'Expirada' ? <Text style={s.note}>Esta versão expirou antes de ser reenviada.</Text> : null}
    </View>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  const s = useS();
  return <View accessible accessibilityLabel={`${label}: ${value}`} style={s.fact}><Text style={s.factLabel}>{label}</Text><Text style={s.factValue}>{value}</Text></View>;
}

const useS = themed(colors => StyleSheet.create({
  header: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 8 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: colors.textMuted },
  provider: { fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  request: { fontSize: 15, lineHeight: 22, color: colors.textSoft },
  meta: { fontSize: 13, lineHeight: 19, color: colors.textMuted, flexShrink: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  titleBlock: { gap: 4, flexShrink: 1 },
  section: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.text, marginTop: 4 },
  current: { backgroundColor: colors.surfaceRaised, borderWidth: 2, borderColor: colors.text, borderRadius: 24, padding: 20, gap: 14 },
  previous: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 24, padding: 20, gap: 12 },
  versionCurrent: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.4, color: colors.text },
  version: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.textSoft },
  priceCurrent: { alignSelf: 'flex-start', fontSize: 32, lineHeight: 39, letterSpacing: -0.8, fontWeight: '800', color: colors.onAccentSoft, backgroundColor: colors.accentSoft, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, overflow: 'hidden' },
  price: { fontSize: 26, lineHeight: 32, letterSpacing: -0.5, fontWeight: '800', color: colors.text },
  description: { fontSize: 15, lineHeight: 23, color: colors.textSoft },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 12 },
  fact: { minWidth: '42%', flexGrow: 1, flexShrink: 1, gap: 2 },
  factLabel: { fontSize: 12, lineHeight: 17, fontWeight: '600', color: colors.textMuted },
  factValue: { fontSize: 15, lineHeight: 22, color: colors.text },
  note: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  info: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 6 },
  infoTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.text },
  infoText: { fontSize: 14, lineHeight: 21, color: colors.textSoft },
}));
