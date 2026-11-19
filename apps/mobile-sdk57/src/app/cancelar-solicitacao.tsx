import { useRef, useState } from 'react';
import { Appear } from '@/components/skeleton';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Alert, Keyboard, StyleSheet, Text, View } from 'react-native';
import { PrivateScreen, usePrivateResource, Feedback, Button, useUi } from '@/components/private-screen';
import { DangerButton } from '@/components/admin-ui';
import { StatusBadge } from '@/components/workflow-screen';
import { CancellationNote, canCancel, cancelLabel, type Cancellable } from '@/components/cancellation';
import { useSession } from '@/components/session';
import { useToast } from '@/components/toast';
import { api, ApiError } from '@/lib/api';
import { FieldError, FieldInput } from '@/components/field-motion';
import { themed, useTheme } from '@/theme';

type Request = Cancellable & { id: string; category: string; description: string; neighborhood: string; neighborhood_label?: string; status: string };
type Data = { request: Request; proposals: { id: string; status: string; provider_name: string }[]; role: 'customer' | 'provider' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 500;

// UC04.4 — Cancelar solicitação. A mesma tela serve ao cliente ("Cancelar solicitação") e ao prestador da proposta
// aceita ("Cancelar atendimento"). Motivo opcional só para o cliente em "Aberta"; obrigatório depois do aceite.
export default function CancelRequest() {
  const ui = useUi();
  const { session } = useSession();
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const valid = typeof id === 'string' && uuid.test(id);
  const r = usePrivateResource<Data>(valid ? `/requests/${id}/proposals` : null);
  const role = r.data?.role ?? (session?.role === 'provider' ? 'provider' : 'customer');
  // Volta para onde a pessoa estava: a lista (from=list) ou o detalhe do pedido.
  const back: Href = !valid || from === 'list' ? '/solicitacoes' : { pathname: '/propostas', params: from === 'history' ? { id, from } : { id } };
  const backLabel = !valid || from === 'list' ? 'Meus pedidos' : 'Voltar ao pedido';
  return (
    <PrivateScreen title={cancelLabel(role)} backHref={back} backLabel={backLabel} onRefresh={valid ? r.refresh : undefined}>
      {!valid ? <Text accessibilityRole="alert" style={ui.error}>Solicitação inválida. Volte à lista e tente novamente.</Text> : null}
      <Feedback busy={r.busy && !r.data} error={r.data ? '' : r.error} message="" skeleton="detail" />
      {!r.data && r.error ? <Button secondary label="Tentar novamente" disabled={r.busy} onPress={() => void r.reload()} /> : null}
      {r.data ? <Appear><Panel data={r.data} back={back} backLabel={backLabel} reload={r.reload} /></Appear> : null}
    </PrivateScreen>
  );
}

function Panel({ data, back, backLabel, reload }: { data: Data; back: Href; backLabel: string; reload: () => Promise<void> }) {
  const s = useS(); const ui = useUi(); const { colors } = useTheme();
  const { session, setSession } = useSession();
  const toast = useToast();
  const { request, role, proposals } = data;
  const provider = role === 'provider';
  const open = request.status === 'Aberta';
  const required = !open;
  const [reason, setReason] = useState(''), [fieldError, setFieldError] = useState(''), [error, setError] = useState('');
  const [refused, setRefused] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const blocked = !!refused || !canCancel(request);
  const action = cancelLabel(role);
  const thing = provider ? 'atendimento' : 'solicitação';
  const chosen = proposals.find(item => item.status === 'Aceita' || (request.status === 'Cancelada' && item.status === 'Cancelada'));
  const waiting = proposals.filter(item => item.status === 'Pendente').length;
  const withWhom = provider ? (canCancel(request) ? 'Você é o prestador escolhido pelo cliente.' : '')
    : chosen ? `Com ${chosen.provider_name}`
    : open ? (waiting === 1 ? '1 proposta pendente' : waiting ? `${waiting} propostas pendentes` : 'Ainda sem propostas pendentes') : '';

  async function send() {
    if (!session || pending.current) return;
    pending.current = true; setBusy(true); setError(''); setFieldError('');
    const text = reason.trim();
    try {
      const result = await api(`/requests/${encodeURIComponent(request.id)}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(text ? { reason: text } : {}) });
      toast.success(result?.message ?? (provider ? 'Atendimento cancelado.' : 'Solicitação cancelada.'));
      router.dismissTo(back);
    } catch (failure) {
      pending.current = false; setBusy(false);
      if (!(failure instanceof ApiError)) { setError(failure instanceof Error ? failure.message : 'Não foi possível cancelar. Tente novamente.'); return; }
      if (failure.status === 401) { setSession(null); return; }
      if (failure.code === 'REQUEST_NOT_CANCELLABLE' || failure.code === 'CANCEL_NOT_ALLOWED') { setRefused(failure.message); void reload(); }
      else if (failure.code === 'CANCEL_REASON_REQUIRED' || failure.fields?.reason) setFieldError(failure.fields?.reason ?? failure.message);
      else setError(failure.message);
    }
  }
  function confirm() {
    if (pending.current) return;
    if (required && !reason.trim()) { setFieldError('Informe o motivo do cancelamento.'); return; }
    setFieldError(''); Keyboard.dismiss();
    Alert.alert(provider ? 'Cancelar este atendimento?' : 'Cancelar esta solicitação?', `O pedido de ${request.category} passa para Cancelada. Isso não pode ser desfeito.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: action, style: 'destructive', onPress: () => void send() },
    ]);
  }

  const summary = (
    <View style={ui.card}>
      <Text style={s.eyebrow}>PEDIDO</Text>
      <Text accessibilityRole="header" style={s.cardTitle}>{request.category}</Text>
      <Text style={s.place}>{request.neighborhood_label ?? request.neighborhood}</Text>
      <Text numberOfLines={3} style={s.body}>{request.description}</Text>
      <View accessible accessibilityLabel={`Status atual: ${request.status}`} style={s.statusRow}><Text style={s.eyebrow}>STATUS ATUAL</Text><StatusBadge status={request.status} /></View>
      {withWhom ? <Text style={s.body}>{withWhom}</Text> : null}
    </View>
  );

  if (blocked) {
    const awaiting = request.status === 'Aguardando confirmação';
    const message = refused
      || (request.status === 'Concluída' ? 'Esta solicitação já foi concluída e não pode mais ser cancelada.'
        : request.status === 'Cancelada' ? 'Esta solicitação já foi cancelada.'
        : awaiting ? (provider ? 'Esta solicitação aguarda a confirmação do cliente e não pode ser cancelada nesta etapa.' : 'Esta solicitação aguarda a sua confirmação da conclusão e não pode ser cancelada nesta etapa. Confirme ou conteste a conclusão.')
        : provider ? 'O cancelamento não é permitido: só o prestador da proposta aceita pode cancelar o atendimento.'
        : 'Esta solicitação não pode mais ser cancelada.');
    return (
      <View style={ui.group}>
        {summary}
        <View accessible accessibilityRole="alert" style={s.blocked}>
          <Text style={s.blockedTitle}>{awaiting ? 'Não dá para cancelar nesta etapa' : refused.startsWith('O cancelamento não é permitido') || (provider && !['Concluída', 'Cancelada'].includes(request.status)) ? 'Cancelamento não permitido' : 'Não dá mais para cancelar'}</Text>
          <Text style={s.body}>{message}</Text>
        </View>
        <CancellationNote cancellation={request.cancellation} />
        <Button label={backLabel} onPress={() => router.dismissTo(back)} />
      </View>
    );
  }

  const label = `Motivo do cancelamento (${required ? 'obrigatório' : 'opcional'})`;
  return (
    <View style={ui.group}>
      {summary}
      <View style={s.warning}>
        <Text accessibilityRole="header" style={s.warningTitle}>O cancelamento não pode ser desfeito</Text>
        {[
          'O pedido passa para "Cancelada".',
          open ? 'As propostas pendentes ficam como "Não selecionada".' : 'A proposta aceita é cancelada.',
          ...(open ? [] : ['O chat fica só para leitura.']),
          provider ? 'O cliente é avisado.' : open ? 'Os prestadores que enviaram proposta são avisados.' : 'O prestador é avisado.',
        ].map(line => <View key={line} style={s.line}><Text accessible={false} style={s.bullet}>•</Text><Text style={s.lineText}>{line}</Text></View>)}
      </View>
      <View style={s.field}>
        <Text style={ui.label}>{label}</Text>
        <FieldInput
          invalid={!!fieldError}
          accessibilityLabel={label} accessibilityHint={fieldError || undefined}
          value={reason} onChangeText={text => { setReason(text); setFieldError(''); setError(''); }}
          editable={!busy} multiline scrollEnabled={false} maxLength={MAX}
          placeholder={required ? 'Conte o que aconteceu' : 'Se quiser, conte por que está cancelando'} placeholderTextColor={colors.placeholder}
          style={[ui.input, s.input, fieldError ? s.invalid : undefined]} />
        <View style={s.under}>
          <Text style={s.hint}>{required ? 'Fica registrado no pedido e é mostrado à outra parte.' : 'Fica registrado no pedido.'}</Text>
          <Text accessibilityLabel={`${reason.length} de ${MAX} caracteres`} style={s.counter}>{reason.length}/{MAX}</Text>
        </View>
        <FieldError style={s.error}>{fieldError}</FieldError>
      </View>
      {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
      <DangerButton label={busy ? 'Cancelando…' : action} disabled={busy} onPress={confirm} />
      <Button secondary label={`Manter ${thing}`} disabled={busy} onPress={() => router.dismissTo(back)} />
    </View>
  );
}

const useS = themed(colors => StyleSheet.create({
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: colors.textMuted },
  cardTitle: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  place: { fontSize: 14, lineHeight: 21, color: colors.textMuted },
  body: { fontSize: 15, lineHeight: 23, color: colors.textSoft },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  warning: { backgroundColor: colors.dangerSoft, borderRadius: 20, padding: 18, gap: 8 },
  warningTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700', color: colors.danger, marginBottom: 2 },
  line: { flexDirection: 'row', gap: 8 },
  bullet: { fontSize: 15, lineHeight: 23, color: colors.text },
  lineText: { flex: 1, fontSize: 15, lineHeight: 23, color: colors.text },
  blocked: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, gap: 6 },
  blockedTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700', color: colors.text },
  field: { gap: 8 },
  input: { minHeight: 120, textAlignVertical: 'top' },
  invalid: { borderColor: colors.danger, borderWidth: 2 },
  under: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  hint: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  counter: { fontSize: 13, lineHeight: 19, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
}));
