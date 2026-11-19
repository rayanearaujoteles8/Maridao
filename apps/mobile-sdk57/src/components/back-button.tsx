import { router, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from './pressable-scale';
import { themed } from '@/theme';

// Botão de voltar único do app: pílula discreta no canto superior esquerdo.
// Dentro de uma folha (tela de ação que sobe de baixo) ele fecha a folha: o destino é a tela de onde ela foi aberta.
// Volta de verdade: desempilha até `href` se ele estiver no histórico; se não estiver (ex.: link direto), troca a tela atual por ele.
export function BackButton({ href, label }: { href: Href; label: string }) {
 const s=useS();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label.startsWith('Voltar') ? label : `Voltar para ${label}`}
      onPress={() => router.dismissTo(href)}
      style={s.pill}>
      <View style={s.chevron} />
      <Text style={s.label} numberOfLines={1}>{label}</Text>
    </PressableScale>
  );
}

const useS = themed(colors => StyleSheet.create({
  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, maxWidth: '100%', paddingLeft: 16, paddingRight: 18, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  chevron: { width: 8, height: 8, marginLeft: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: colors.text, transform: [{ rotate: '45deg' }] },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
}));
