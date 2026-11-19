import { useRef, useState } from 'react';
import { Appear } from './skeleton';
import { PressableScale } from '@/components/pressable-scale';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Alert, Keyboard, StyleSheet, Text, View } from 'react-native';
import { PrivateScreen, usePrivateResource, Feedback, Button, useUi } from './private-screen';
import { StatusBadge } from './workflow-screen';
import { useSession } from './session';
import { useToast } from './toast';
import { api, ApiError } from '@/lib/api';
import { FieldError, FieldInput } from './field-motion';
import { themed, useTheme } from '@/theme';

// Conclusão confirmada pelo cliente (UC07.3 e UC07.4): os dados que a API devolve, os blocos que os mostram e a tela
// em que o cliente confirma ou contesta a conclusão registrada pelo prestador.
export type CompletionContest = { at: string; reason: string };
export type CompletionInfo = {
  completion_reported_at?: string | null;
  completion_deadline_at?: string | null;
  completion_confirmed_by?: string | null;
  completion_contest?: CompletionContest | null;
};
export const AWAITING = 'Aguardando confirmação';
export const AUTO_CONFIRM_DAYS = 7;
export const formatWhen = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Araguaina' }).format(new Date(iso));
// Quem confirmou a conclusão. Nulo: pedido não concluído ou concluído antes deste fluxo.
export const confirmedBy = (by: string | null | undefined) => by === 'customer' ? 'Confirmada pelo cliente' : by === 'system' ? 'Confirmada automaticamente ao fim do prazo' : null;

// "Conclusão contestada pelo cliente em 18/11/2026, 12:55" + motivo.
export function ContestNote({ contest, mine = false }: { contest?: CompletionContest | null; mine?: boolean }) {
  const s = useS();
  if (!contest) return null;
  return (
    <View style={s.note}>
      <Text style={s.eyebrow}>CONTESTAÇÃO</Text>
      <Text style={s.noteTitle}>{mine ? 'Você contestou a conclusão' : 'Conclusão contestada pelo cliente'} em {formatWhen(contest.at)}</Text>
      <Text selectable style={s.body}><Text style={s.strong}>Motivo: </Text>{contest.reason}</Text>
    </View>
  );
}

// Selo das listas: o pedido espera uma resposta de quem está olhando. Contorno + sinal + texto (não depende de cor).
export function AttentionSeal({ label }: { label: string }) {
  const s = useS();
  return (
    <View accessible accessibilityLabel={`Atenção: ${label}`} style={s.seal}>
      <Text accessible={false} style={s.sealMark}>!</Text>
      <Text style={s.sealText}>{label}</Text>
    </View>
  );
}

type Request = CompletionInfo & { id: string; category: string; description: string; neighborhood: string; neighborhood_label?: string; status: string; can_confirm_completion?: boolean; can_contest_completion?: boolean; can_review?: boolean };
type Data = { request: Request; proposals: { id: string; status: string; provider_name: string; amount: string }[]; role: 'customer' | 'provider' };
type Mode = 'confirm' | 'contest';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 500;
const REFUSALS = ['COMPLETION_NOT_PENDING', 'COMPLETION_NOT_ALLOWED', 'CONTEST_DEADLINE_PASSED'];
const TITLE: Record<Mode, string> = { confirm: 'Confirmar conclusão', contest: 'Contestar conclusão' };

// UC07.4 — a mesma tela nos dois modos; as rotas /confirmar-conclusao e /contestar-conclusao escolhem o modo.
export function CompletionDecision({ mode }: { mode: Mode }) {
  const ui = useUi();
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const valid = typeof id === 'string' && uuid.test(id);
  const r = usePrivateResource<Data>(valid ? `/requests/${id}/proposals` : null);
  // Volta para onde a pessoa estava: a lista (from=list) ou o detalhe do pedido.
  const back: Href = !valid || from === 'list' ? '/solicitacoes' : { pathname: '/propostas', params: from === 'history' ? { id, from } : { id } };
  const backLabel = !valid || from === 'list' ? 'Meus pedidos' : 'Voltar ao pedido';
  return (
    <PrivateScreen title={TITLE[mode]} backHref={back} backLabel={backLabel} onRefresh={valid ? r.refresh : undefined}>
      {!valid ? <Text accessibilityRole="alert" style={ui.error}>Solicitação inválida. Volte à lista e tente novamente.</Text> : null}
      <Feedback busy={r.busy && !r.data} error={r.data ? '' : r.error} message="" skeleton="detail" />
      {!r.data && r.error ? <Button secondary label="Tentar novamente" disabled={r.busy} onPress={() => void r.reload()} /> : null}
      {r.data ? <Appear><Panel mode={mode} data={r.data} back={back} backLabel={backLabel} reload={r.reload} /></Appear> : null}
    </PrivateScreen>
  );
}

function Panel({ mode, data, back, backLabel, reload }: { mode: Mode; data: Data; back: Href; backLabel: string; reload: () => Promise<void> }) {
  const s = useS(); const ui = useUi(); const { colors } = useTheme();
  const { session, setSession } = useSession();
  const toast = useToast();
  const { request, role, proposals } = data;
  const contest = mode === 'contest';
  const [reason, setReason] = useState(''), [fieldError, setFieldError] = useState(''), [error, setError] = useState('');
  const [refused, setRefused] = useState(''), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false);
  const pending = useRef(false);
  const allowed = contest ? request.can_contest_completion === true : request.can_confirm_completion === true;
  const chosen = proposals.find(item => item.status === 'Aceita');
  const provider = chosen?.provider_name ?? 'o prestador';
  const review = () => router.replace({ pathname: '/avaliar', params: { id: request.id } });

  async function send() {
    if (!session || pending.current) return;
    pending.current = true; setBusy(true); setError(''); setFieldError('');
    try {
      const result = await api(`/requests/${encodeURIComponent(request.id)}/completion/${contest ? 'contest' : 'confirm'}`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(contest ? { reason: reason.trim() } : {}) });
      toast.success(result?.message ?? (contest ? 'Contestação registrada. O atendimento voltou para "Em andamento".' : 'Conclusão confirmada. Você já pode avaliar o atendimento.'));
      if (contest) router.dismissTo(back);
      else { pending.current = false; setBusy(false); setConfirmed(true); }
    } catch (failure) {
      pending.current = false; setBusy(false);
      if (!(failure instanceof ApiError)) { setError(failure instanceof Error ? failure.message : 'Não foi possível enviar. Tente novamente.'); return; }
      if (failure.status === 401) { setSession(null); return; }
      if (failure.code && REFUSALS.includes(failure.code)) { setRefused(failure.message); void reload(); }
      else if (failure.code === 'CONTEST_REASON_REQUIRED' || failure.fields?.reason) setFieldError(failure.fields?.reason ?? failure.message);
      else setError(failure.message);
    }
  }
  function ask() {
    if (pending.current) return;
    if (contest && !reason.trim()) { setFieldError('Informe o motivo da contestação.'); return; }
    setFieldError(''); Keyboard.dismiss();
    if (contest) Alert.alert('Contestar a conclusão?', `O pedido de ${request.category} volta para "Em andamento" e ${provider} é avisado com o motivo.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Contestar conclusão', onPress: () => void send() },
    ]);
    else Alert.alert('Confirmar a conclusão?', `O pedido de ${request.category} passa para "Concluída". Depois de confirmar não é mais possível contestar.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Confirmar conclusão', onPress: () => void send() },
    ]);
  }

  const amount = chosen ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(chosen.amount)) : '';
  const summary = (
    <View style={ui.card}>
      <Text style={s.eyebrow}>PEDIDO</Text>
      <Text accessibilityRole="header" style={s.cardTitle}>{request.category}</Text>
      <Text style={s.place}>{request.neighborhood_label ?? request.neighborhood}</Text>
      <Text numberOfLines={3} style={s.body}>{request.description}</Text>
      <View accessible accessibilityLabel={`Status atual: ${confirmed ? 'Concluída' : request.status}`} style={s.statusRow}><Text style={s.eyebrow}>STATUS ATUAL</Text><StatusBadge status={confirmed ? 'Concluída' : request.status} /></View>
      {chosen ? <><Text style={s.eyebrow}>PRESTADOR</Text><Text style={s.who}>{chosen.provider_name}</Text><Text style={s.body}>Proposta aceita: {amount}</Text></> : null}
    </View>
  );

  if (confirmed) return (
    <View style={ui.group}>
      {summary}
      <View accessible style={s.done}>
        <Text accessibilityRole="header" style={s.doneTitle}>Conclusão confirmada</Text>
        <Text style={s.doneText}>O atendimento foi concluído e a conversa ficou só para leitura. Que tal contar como foi o serviço?</Text>
      </View>
      <Button label="Avaliar agora" onPress={review} />
      <Button secondary label={backLabel} onPress={() => router.dismissTo(back)} />
    </View>
  );

  if (refused || !allowed) {
    const done = request.status === 'Concluída';
    const message = refused
      || (role === 'provider' ? 'Somente o cliente da solicitação pode confirmar ou contestar a conclusão.'
        : done ? (contest ? 'Este atendimento já foi concluído e não pode mais ser contestado.' : 'Este atendimento já foi concluído.')
        : request.status === 'Cancelada' ? 'Esta solicitação foi cancelada.'
        : request.status === 'Em andamento' ? 'O prestador ainda não registrou a conclusão deste atendimento. Quando registrar, você será avisado para confirmar ou contestar.'
        : 'Esta operação não é permitida nesta etapa: a solicitação não está aguardando confirmação.');
    const how = done ? confirmedBy(request.completion_confirmed_by) : null;
    return (
      <View style={ui.group}>
        {summary}
        <View accessible accessibilityRole="alert" style={s.blocked}>
          <Text style={s.blockedTitle}>{contest ? (done ? 'Não dá mais para contestar' : 'Não dá para contestar agora') : (done ? 'A conclusão já foi confirmada' : 'Não há conclusão para confirmar')}</Text>
          <Text style={s.body}>{message}</Text>
          {how ? <Text style={s.body}>{how}.</Text> : null}
        </View>
        {request.status === 'Em andamento' && role === 'customer' ? <ContestNote contest={request.completion_contest} mine /> : null}
        {done && request.can_review ? <Button label="Avaliar atendimento" onPress={review} /> : null}
        <Button secondary={done && request.can_review === true} label={backLabel} onPress={() => router.dismissTo(back)} />
      </View>
    );
  }

  const label = 'Motivo da contestação (obrigatório)';
  const lines = contest
    ? ['O pedido volta para "Em andamento".', 'O prestador é avisado e vê o motivo.', `Ele pode registrar a conclusão de novo, e você volta a ter ${AUTO_CONFIRM_DAYS} dias para responder.`]
    : ['O pedido passa para "Concluída".', 'A avaliação do atendimento é liberada.', 'A conversa fica só para leitura.', 'O prestador é avisado.'];
  return (
    <View style={ui.group}>
      {summary}
      <View style={s.note}>
        <Text style={s.eyebrow}>CONCLUSÃO REGISTRADA</Text>
        {request.completion_reported_at ? <Text style={s.noteTitle}>{provider} registrou a conclusão em {formatWhen(request.completion_reported_at)}</Text> : null}
        {request.completion_deadline_at ? <Text style={s.body}>Responda até <Text style={s.strong}>{formatWhen(request.completion_deadline_at)}</Text>. Depois disso a conclusão é confirmada automaticamente.</Text> : null}
      </View>
      <View style={s.effects}>
        <Text accessibilityRole="header" style={s.effectsTitle}>{contest ? 'Ao contestar' : 'Ao confirmar'}</Text>
        {lines.map(line => <View key={line} style={s.line}><Text accessible={false} style={s.lineText}>•</Text><Text style={[s.lineText, s.grow]}>{line}</Text></View>)}
      </View>
      {contest ? <View style={s.field}>
        <Text style={ui.label}>{label}</Text>
        <FieldInput
          invalid={!!fieldError}
          accessibilityLabel={label} accessibilityHint={fieldError || undefined}
          value={reason} onChangeText={text => { setReason(text); setFieldError(''); setError(''); }}
          editable={!busy} multiline scrollEnabled={false} maxLength={MAX}
          placeholder="Conte o que faltou ou não ficou como combinado" placeholderTextColor={colors.placeholder}
          style={[ui.input, s.input, fieldError ? s.invalid : undefined]} />
        <View style={s.under}>
          <Text style={s.hint}>Fica registrado no pedido e é mostrado ao prestador.</Text>
          <Text accessibilityLabel={`${reason.length} de ${MAX} caracteres`} style={s.counter}>{reason.length}/{MAX}</Text>
        </View>
        <FieldError style={s.error}>{fieldError}</FieldError>
      </View> : null}
      {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
      {contest
        ? <PressableScale accessibilityRole="button" accessibilityLabel="Contestar conclusão" disabled={busy} accessibilityState={{ disabled: busy, busy }} onPress={ask} style={s.outline}><Text style={s.outlineText}>{busy ? 'Enviando…' : 'Contestar conclusão'}</Text></PressableScale>
        : <Button label={busy ? 'Confirmando…' : 'Confirmar conclusão'} disabled={busy} onPress={ask} />}
      <Button secondary label={contest ? 'Voltar sem contestar' : 'Agora não'} disabled={busy} onPress={() => router.dismissTo(back)} />
    </View>
  );
}

const useS = themed(colors => StyleSheet.create({
  note: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 6 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: colors.textMuted },
  noteTitle: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, lineHeight: 23, color: colors.textSoft },
  strong: { fontWeight: '700', color: colors.text },
  seal: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.text, borderRadius: 12, paddingLeft: 6, paddingRight: 12, paddingVertical: 5 },
  sealMark: { width: 20, height: 20, borderRadius: 10, overflow: 'hidden', textAlign: 'center', fontSize: 13, lineHeight: 20, fontWeight: '800', backgroundColor: colors.accent, color: colors.onAccent },
  sealText: { fontSize: 13, fontWeight: '700', color: colors.text },
  cardTitle: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  place: { fontSize: 14, lineHeight: 21, color: colors.textMuted },
  who: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  effects: { backgroundColor: colors.accentSoft, borderRadius: 20, padding: 18, gap: 8 },
  effectsTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700', color: colors.onAccentSoft, marginBottom: 2 },
  line: { flexDirection: 'row', gap: 8 },
  lineText: { fontSize: 15, lineHeight: 23, color: colors.onAccentSoft },
  grow: { flex: 1 },
  blocked: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, gap: 6 },
  blockedTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700', color: colors.text },
  done: { backgroundColor: colors.accentSoft, borderRadius: 20, padding: 18, gap: 6 },
  doneTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700', color: colors.onAccentSoft },
  doneText: { fontSize: 15, lineHeight: 23, color: colors.onAccentSoft },
  field: { gap: 8 },
  input: { minHeight: 120, textAlignVertical: 'top' },
  invalid: { borderColor: colors.danger, borderWidth: 2 },
  under: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  hint: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  counter: { fontSize: 13, lineHeight: 19, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  outline: { minHeight: 54, borderRadius: 16, padding: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.text },
  outlineText: { fontSize: 16, fontWeight: '700', color: colors.text },
  pressed: { opacity: 0.5 },
}));
