import { StyleSheet, Text } from 'react-native';
import { themed } from '@/theme';

// Conta de cliente excluída (UC01.3): o histórico continua, com o autor "Usuário removido". A API manda a marca e o texto
// pronto só para o prestador (pedidos: customer_removed/customer_name; avaliações: author_removed/author_name; chat:
// counterpart). Aqui ficam os tipos desses campos e a linha discreta que os mostra — texto, sem etiqueta colorida.
export const REMOVED_NAME = 'Usuário removido';
export type CustomerRemoved = { customer_removed?: boolean; customer_name?: string | null };
export type AuthorRemoved = { author_removed?: boolean; author_name?: string | null };
export type Counterpart = { role: 'customer' | 'provider'; removed: boolean; name: string | null };

// "Cliente: Usuário removido". Sem a marca (cliente ativo, ou quem consulta é o próprio cliente) não mostra nada.
export function RemovedNote({ removed, name, label = 'Cliente' }: { removed?: boolean; name?: string | null; label?: string }) {
  const s = useS();
  if (!removed) return null;
  return <Text style={s.note}>{label}: {name || REMOVED_NAME}</Text>;
}

const useS = themed(colors => StyleSheet.create({
  note: { fontSize: 14, lineHeight: 21, color: colors.textMuted },
}));
