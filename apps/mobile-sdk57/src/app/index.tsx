import { Link, router } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/components/access-screen';
import { useSession } from '@/components/session';

export default function HomeScreen() {
  const { session } = useSession();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 350 || fontScale > 1.2;
  return <SafeAreaView style={s.safe}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.page}>
      <View style={s.header}>
        <Image source={require('../../assets/brand/logotipo-preto.png')} style={s.logo} resizeMode="contain" accessibilityLabel="Maridão" />
        <View style={s.location}><View style={s.locationDot} /><Text style={s.locationText}>Palmas · TO</Text></View>
      </View>
      <View style={s.intro}>
        <Text style={s.eyebrow}>UM APOIO PARA A SUA ROTINA</Text>
        <Text accessibilityRole="header" style={[s.title, stacked && s.titleCompact]}>O que precisa de{'\n'}uma mãozinha?</Text>
        <Text style={s.description}>Encontre quem faz. Ou mostre o que você sabe fazer.</Text>
      </View>
      <View style={s.feature}>
        <View style={[s.featureCopy, stacked && { maxWidth: '100%' }]}>
          <View style={s.featureTag}><View style={s.smallDot} /><Text style={s.featureTagText}>AQUI EM PALMAS</Text></View>
          <Text style={s.featureTitle}>Serviços perto.{'\n'}Rotina mais leve.</Text>
          <View style={s.serviceTags}><Text style={s.serviceTag}>Reparos</Text><Text style={s.serviceTag}>Montagem</Text><Text style={s.serviceTag}>Instalações</Text></View>
        </View>
        {!stacked ? <View style={s.art} accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
          <View style={s.orbit} /><View style={s.orbitSmall} />
          <View style={s.sticker}><Text style={s.spark}>✦</Text><Text style={s.stickerText}>BORA{'\n'}RESOLVER?</Text><View style={s.stickerLine} /></View>
        </View> : null}
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.push(session ? './minha-conta' : '/entrar')} style={({ pressed }) => [s.login, pressed && s.pressed]}>
        <Text style={s.loginText}>{session ? 'Ir para minha conta' : 'Entrar na minha conta'}</Text>
        <View style={s.loginArrow} accessible={false}><Text style={s.arrowLight}>↗</Text></View>
      </Pressable>
      <View style={s.signupSection}>
        <View style={s.sectionHeading}><Text accessibilityRole="header" style={s.sectionTitle}>Seu primeiro passo</Text><Text style={s.sectionHint}>Ainda não tem conta?</Text></View>
        <View style={[s.choices, stacked && s.choicesStacked]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Encontrar serviços. Criar conta de cliente." onPress={() => router.push('/cadastro-cliente')} style={({ pressed }) => [s.choice, s.clientChoice, pressed && s.pressed]}>
            <View style={s.choiceTop}><Text style={s.choiceKicker}>PARA QUEM PRECISA</Text><Text accessible={false} style={s.choiceMark}>↗</Text></View>
            <Text style={s.choiceTitle}>Encontrar{'\n'}serviços</Text><Text style={s.choiceDescription}>Crie sua conta de cliente.</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Oferecer serviços. Criar conta de prestador." onPress={() => router.push('/cadastro-prestador')} style={({ pressed }) => [s.choice, s.providerChoice, pressed && s.pressed]}>
            <View style={s.choiceTop}><Text style={s.choiceKicker}>PARA QUEM FAZ</Text><Text accessible={false} style={s.choiceMark}>↗</Text></View>
            <Text style={s.choiceTitle}>Oferecer{'\n'}serviços</Text><Text style={s.choiceDescription}>Crie seu perfil de prestador.</Text>
          </Pressable>
        </View>
      </View>
      <View style={s.footer}>
        <Text style={s.footerText}>Conectando quem precisa{'\n'}a quem sabe fazer.</Text>
        {!session ? <Link href="/recuperar-senha" style={s.recovery}>Esqueci minha senha</Link> : null}
      </View>
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 24, gap: 18, width: '100%', maxWidth: 520, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 },
  logo: { width: 158, height: 44 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F3F6EF', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 9, flexShrink: 1 },
  locationDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#365519' },
  locationText: { fontSize: 11, fontWeight: '600', color: colors.black, flexShrink: 1 },
  intro: { gap: 10, paddingTop: 6 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: '#526047' },
  title: { fontSize: 37, lineHeight: 41, letterSpacing: -1.5, fontWeight: '800', color: colors.black },
  titleCompact: { fontSize: 32, lineHeight: 37, letterSpacing: -1 },
  description: { fontSize: 15, lineHeight: 22, color: '#526047', maxWidth: 320 },
  feature: { minHeight: 166, backgroundColor: colors.black, borderRadius: 28, padding: 22, overflow: 'hidden', justifyContent: 'center' },
  featureCopy: { gap: 14, maxWidth: '73%', zIndex: 1 },
  featureTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  smallDot: { width: 5, height: 5, backgroundColor: colors.green, borderRadius: 3 },
  featureTagText: { fontSize: 9, letterSpacing: 1.1, fontWeight: '700', color: colors.pale },
  featureTitle: { fontSize: 25, lineHeight: 29, letterSpacing: -0.6, fontWeight: '700', color: colors.white },
  serviceTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  serviceTag: { borderWidth: 1, borderColor: '#39452B', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5, fontSize: 9, color: colors.pale },
  art: { position: 'absolute', right: -12, top: 0, bottom: 0, width: 126 },
  orbit: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 21, borderColor: colors.green, right: -62, top: -76, transform: [{ rotate: '-22deg' }] },
  orbitSmall: { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 1, borderColor: '#4D662C', right: -47, bottom: -95 },
  sticker: { position: 'absolute', right: 19, top: 56, width: 88, minHeight: 101, borderRadius: 20, backgroundColor: colors.pale, padding: 12, transform: [{ rotate: '9deg' }], gap: 6 },
  spark: { fontSize: 23, color: colors.black, lineHeight: 25 },
  stickerText: { fontSize: 11, lineHeight: 13, letterSpacing: -0.3, fontWeight: '800', color: colors.black },
  stickerLine: { height: 2, width: 30, backgroundColor: colors.black, marginTop: 1 },
  login: { minHeight: 62, borderRadius: 22, paddingVertical: 12, paddingLeft: 22, paddingRight: 12, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  loginText: { fontSize: 17, letterSpacing: -0.3, fontWeight: '700', color: colors.black, flexShrink: 1 },
  loginArrow: { width: 36, height: 36, backgroundColor: colors.black, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  arrowLight: { fontSize: 22, color: colors.green, lineHeight: 27 },
  signupSection: { gap: 12 },
  sectionHeading: { gap: 3 },
  sectionTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.4, color: colors.black },
  sectionHint: { fontSize: 12, color: '#526047' },
  choices: { flexDirection: 'row', gap: 12 },
  choicesStacked: { flexDirection: 'column' },
  choice: { flex: 1, padding: 16, borderRadius: 22, borderWidth: 1, minHeight: 158, gap: 12 },
  clientChoice: { backgroundColor: '#F5F8F0', borderColor: '#E1E9D9' },
  providerChoice: { backgroundColor: colors.pale, borderColor: colors.pale },
  choiceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 },
  choiceKicker: { fontSize: 8, lineHeight: 12, letterSpacing: 0.6, fontWeight: '700', color: '#3F4E30', flexShrink: 1 },
  choiceMark: { fontSize: 21, lineHeight: 22, color: colors.black },
  choiceTitle: { fontSize: 23, lineHeight: 26, letterSpacing: -0.7, fontWeight: '700', color: colors.black },
  choiceDescription: { fontSize: 11, lineHeight: 16, color: '#46503C' },
  footer: { alignItems: 'center', gap: 8, paddingTop: 1 },
  footerText: { textAlign: 'center', fontSize: 12, lineHeight: 17, color: '#526047' },
  recovery: { color: colors.black, fontSize: 12, paddingHorizontal: 12, paddingVertical: 12, minHeight: 44, textDecorationLine: 'underline' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
});
