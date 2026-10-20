import { Link, router } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/components/access-screen';

export default function HomeScreen() {
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.hero}>
          <Text style={s.eyebrow}>SERVIÇOS PERTO DE VOCÊ</Text>
          <Image source={require('../../assets/brand/logotipo-preto.png')} style={s.logo} resizeMode="contain" accessibilityLabel="Maridão" />
          <Text accessibilityRole="header" style={s.title}>Uma mãozinha para o que você precisa.</Text>
          <Text style={s.description}>Encontre prestadores na sua cidade e no seu bairro ou ofereça seus serviços.</Text>
        </View>
        <View style={s.actions}>
          <Pressable onPress={() => router.push('/entrar')} accessibilityRole="button" style={({ pressed }) => [s.primary, pressed && s.pressed]}><Text style={s.primaryText}>Entrar</Text></Pressable>
          <Text style={s.caption}>É sua primeira vez aqui?</Text>
          <Pressable onPress={() => router.push('/cadastro-cliente')} accessibilityRole="button" style={({ pressed }) => [s.secondary, pressed && s.pressed]}><Text style={s.secondaryText}>Cadastrar como cliente</Text></Pressable>
          <Pressable onPress={() => router.push('/cadastro-prestador')} accessibilityRole="button" style={({ pressed }) => [s.secondary, pressed && s.pressed]}><Text style={s.secondaryText}>Cadastrar como prestador</Text></Pressable>
          <Link href="/recuperar-senha" style={s.recovery}>Esqueci minha senha</Link>
        </View>
        <Text style={s.footer}>Conectando quem precisa a quem sabe fazer.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.green },
  page: { flexGrow: 1, backgroundColor: colors.white },
  hero: { backgroundColor: colors.green, padding: 28, paddingTop: 32, paddingBottom: 40, gap: 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 2, color: colors.black },
  logo: { width: '80%', maxWidth: 310, height: 70 },
  title: { fontSize: 34, lineHeight: 39, fontWeight: '800', color: colors.black, maxWidth: 460 },
  description: { fontSize: 17, lineHeight: 25, color: colors.black, maxWidth: 460 },
  actions: { padding: 28, gap: 14, width: '100%', maxWidth: 520, alignSelf: 'center' },
  primary: { backgroundColor: colors.black, padding: 18, borderRadius: 16, alignItems: 'center', minHeight: 56 },
  primaryText: { color: colors.white, fontSize: 17, fontWeight: '700' },
  caption: { color: '#46503C', textAlign: 'center', marginTop: 10, marginBottom: 4, fontSize: 15 },
  secondary: { backgroundColor: colors.white, borderColor: colors.black, borderWidth: 1, padding: 18, borderRadius: 16, alignItems: 'center', minHeight: 56 },
  secondaryText: { color: colors.black, fontSize: 16, fontWeight: '600' },
  recovery: { textAlign: 'center', color: colors.black, textDecorationLine: 'underline', padding: 14, fontSize: 15 },
  pressed: { opacity: 0.7 },
  footer: { color: '#46503C', fontSize: 13, textAlign: 'center', paddingHorizontal: 24, paddingBottom: 24 },
});
