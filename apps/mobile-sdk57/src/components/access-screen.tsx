import { Link } from 'expo-router';
import { BackButton } from './back-button';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { themed } from '@/theme';

export function AccessScreen({ title, description, fields }: { title: string; description: string; fields: string[] }) {
 const styles=useStyles();
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <BackButton href="/" label="Voltar ao início" />
        <Image source={require('../../assets/brand/logotipo-preto.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Maridão" />
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Informações do cadastro</Text>
          {fields.map(field => <Text key={field} style={styles.field}>• {field}</Text>)}
        </View>
        <Text style={styles.note}>Estamos preparando esta etapa. O formulário ainda não está disponível.</Text>
        <Link href="/entrar" style={styles.back}>Já tenho conta</Link>
      </ScrollView>
    </SafeAreaView>
  );
}

export const useStyles = themed(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: { padding: 24, gap: 24, width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1 },
  back: { color: colors.text, fontSize: 16, paddingVertical: 12, textDecorationLine: 'underline' },
  logo: { width: 180, height: 48, tintColor: colors.text },
  title: { fontSize: 34, fontWeight: '800', color: colors.text, lineHeight: 40 },
  description: { color: colors.textSoft, fontSize: 17, lineHeight: 26 },
  card: { backgroundColor: colors.accentSoft, borderRadius: 24, padding: 24, gap: 14 },
  cardTitle: { fontSize: 19, fontWeight: '700', color: colors.onAccentSoft},
  field: { fontSize: 16, lineHeight: 24, color: colors.onAccentSoft},
  plain: { color: colors.text },
  note: { fontSize: 15, lineHeight: 23, color: colors.textSoft },
}));
