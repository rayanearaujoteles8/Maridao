import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { themed } from '@/theme';

// Histórico de versões da proposta (UC05.3, UC06.1, UC09.3): a entrada discreta para a tela "Versões da proposta".
// `from` diz para onde a tela volta: 'history' = detalhe do pedido aberto pelo histórico; 'historyList' = a própria
// lista do histórico; sem ele, o detalhe do pedido.
export type VersionsFrom = 'history' | 'historyList';
export const hasVersions = (previous?: boolean | null, count?: number | null) => previous === true || (count ?? 0) > 1;
export const shortDate = (iso: string) => iso.split('-').reverse().join('/');
export const dateTime = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Araguaina' }).format(new Date(iso));
export const money = (amount: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(amount));

// Link de texto (alvo de 44 pt), sem preenchimento, para não competir com Aceitar/Reenviar.
export function VersionsLink({ requestId, proposalId, count, from, provider, disabled = false }: { requestId: string; proposalId: string; count?: number | null; from?: VersionsFrom; provider?: string; disabled?: boolean }) {
  const s = useS();
  const label = count && count > 1 ? `Ver versões (${count})` : 'Ver versões';
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={provider ? `${label} da proposta de ${provider}` : `${label} da proposta`}
      accessibilityHint="Abre o histórico de versões desta proposta."
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={() => router.push({ pathname: '/versoes-proposta', params: from ? { requestId, proposalId, from } : { requestId, proposalId } })}
      style={({ pressed }) => [s.link, (pressed || disabled) && s.pressed]}>
      <Text style={s.linkText}>{label} ↗</Text>
    </Pressable>
  );
}

const useS = themed(colors => StyleSheet.create({
  link: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingVertical: 10, paddingRight: 12 },
  linkText: { fontSize: 14, fontWeight: '600', color: colors.link, textDecorationLine: 'underline' },
  pressed: { opacity: 0.5 },
}));
