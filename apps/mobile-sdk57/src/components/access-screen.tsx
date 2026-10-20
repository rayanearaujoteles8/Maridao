import { Link } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = { green: '#A1FF1D', black: '#020300', white: '#FFFFFF', pale: '#DCFFA4' };

export function AccessScreen({ title, description, fields }: { title: string; description: string; fields: string[] }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Link href="/" style={styles.back}>← Voltar ao início</Link>
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

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  page: { padding: 24, gap: 24, width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1 },
  back: { color: colors.black, fontSize: 16, paddingVertical: 12, textDecorationLine: 'underline' },
  logo: { width: 180, height: 48 },
  title: { fontSize: 34, fontWeight: '800', color: colors.black, lineHeight: 40 },
  description: { color: '#38402E', fontSize: 17, lineHeight: 26 },
  card: { backgroundColor: colors.pale, borderRadius: 24, padding: 24, gap: 14 },
  cardTitle: { fontSize: 19, fontWeight: '700', color: colors.black },
  field: { fontSize: 16, lineHeight: 24, color: colors.black },
  note: { fontSize: 15, lineHeight: 23, color: '#46503C' },
});
