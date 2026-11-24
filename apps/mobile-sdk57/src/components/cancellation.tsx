import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { themed } from '@/theme';

// Cancelamento de solicitação (UC04.4): o registro devolvido pela API, o bloco que o mostra e a entrada para a tela de cancelar.
export type Cancellation = { by: string; at: string; action: string; reason: string | null };
export type Cancellable = { can_cancel?: boolean; cancellation?: Cancellation | null };

const BY: Record<string, string> = { customer: 'pelo cliente', provider: 'pelo prestador', administration: 'pela administração', system: 'pelo sistema' };
// Caminho do cancelamento, quando não foi o pedido direto de uma das partes (request_cancelled).
const ACTION: Record<string, string> = {
  request_replaced: 'Substituída por um novo pedido da mesma categoria.',
  account_closed: 'A conta do cliente foi encerrada.',
  support_cancelled: 'Decisão da administração em um protocolo de suporte.',
};
const CANCELLABLE = ['Aberta', 'Aceita', 'Em andamento'];
export const canCancel = (request: Cancellable & { status: string }) => request.can_cancel === true && CANCELLABLE.includes(request.status);
export const cancelLabel = (role: 'customer' | 'provider' | null | undefined) => role === 'provider' ? 'Cancelar atendimento' : 'Cancelar solicitação';
export const formatCancelDate = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Araguaina' }).format(new Date(iso));

// "Cancelada pelo cliente em 18/11/2026, 12:12" + motivo, quando a API devolve. Sem registro (pedido antigo): não mostra nada.
export function CancellationNote({ cancellation }: { cancellation?: Cancellation | null }) {
  const s = useS();
  if (!cancellation) return null;
  const who = BY[cancellation.by];
  const reason = cancellation.reason?.trim();
  const how = !reason ? ACTION[cancellation.action] : undefined;
  return (
    <View style={s.note}>
      <Text style={s.eyebrow}>CANCELAMENTO</Text>
      <Text style={s.who}>Cancelada{who ? ` ${who}` : ''} em {formatCancelDate(cancellation.at)}</Text>
      {reason ? <Text selectable style={s.reason}><Text style={s.strong}>Motivo: </Text>{reason}</Text> : null}
      {how ? <Text style={s.reason}>{how}</Text> : null}
    </View>
  );
}

// Botão de cancelamento com fundo e contorno próprios para a ação destrutiva.
export function CancelLink({ id, role, from, disabled = false }: { id: string; role: 'customer' | 'provider' | null | undefined; from?: 'list' | 'history'; disabled?: boolean }) {
  const s = useS();
  const label = cancelLabel(role);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Abre a confirmação. Nada é cancelado ainda."
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={() => router.push({ pathname: '/cancelar-solicitacao', params: from ? { id, from } : { id } })}
      style={({ pressed }) => [s.link, (pressed || disabled) && s.pressed]}>
      <Text style={s.linkText}>{label}</Text>
    </Pressable>
  );
}

const useS = themed(colors => StyleSheet.create({
  note: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 6 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: colors.textMuted },
  who: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: colors.text },
  reason: { fontSize: 15, lineHeight: 22, color: colors.textSoft },
  strong: { fontWeight: '700', color: colors.text },
  link: { minHeight: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  linkText: { fontSize: 15, fontWeight: '600', color: colors.danger, textAlign: 'center' },
  pressed: { opacity: 0.5 },
}));
