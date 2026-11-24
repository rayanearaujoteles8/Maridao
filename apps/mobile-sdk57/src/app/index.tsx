import { useEffect } from 'react';
import { Link, router } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IntroReveal, useIntroPhase } from '@/components/intro-animation';
import { PressableScale } from '@/components/pressable-scale';
import { useSession } from '@/components/session';
import { ThemeToggle } from '@/components/theme-toggle';
import { themed } from '@/theme';

// Etiqueta "Bora resolver?" pendurada na argola: balança uma vez quando a abertura revela a tela e assenta.
function HangingTag() {
 const s=useS();
  const phase = useIntroPhase();
  const reduced = useReducedMotion();
  const tilt = useSharedValue(phase === 'done' || reduced ? 7 : 22);
  useEffect(() => {
    if (phase !== 'playing' && !reduced) tilt.set(withDelay(260, withSpring(7, { mass: 1, damping: 7, stiffness: 80 })));
  }, [phase, reduced, tilt]);
  const swing = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.get()}deg` }] }));
  return <Animated.View style={[s.sticker, swing]}>
    <View style={s.eyelet} />
    <Text style={s.spark}>✦</Text><Text style={s.stickerText}>BORA{'\n'}RESOLVER?</Text><View style={s.stickerLine} />
  </Animated.View>;
}

export default function HomeScreen() {
 const s=useS();
  const { session } = useSession();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 350 || fontScale > 1.2;
  return <SafeAreaView style={s.safe}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.page}>
      <IntroReveal order={0} style={s.header}>
        <Image source={require('../../assets/brand/logotipo-preto.png')} style={s.logo} resizeMode="contain" accessibilityLabel="Maridão" />
        <View style={s.headerEnd}>{!stacked ? <View style={s.location}><View style={s.locationDot} /><Text style={s.locationText}>Palmas · TO</Text></View> : null}<ThemeToggle /></View>
      </IntroReveal>
      <IntroReveal order={1} style={s.intro}>
        <Text style={s.eyebrow}>UM APOIO PARA A SUA ROTINA</Text>
        <Text accessibilityRole="header" style={[s.title, stacked && s.titleCompact]}>O que precisa de{'\n'}uma mãozinha?</Text>
        <Text style={s.description}>Encontre quem faz. Ou mostre o que você sabe fazer.</Text>
      </IntroReveal>
      <IntroReveal order={2} style={s.feature}>
        <View style={[s.featureCopy, stacked && s.featureCopyStacked]}>
          <View style={s.featureTag}><View style={s.smallDot} /><Text style={s.featureTagText}>AQUI EM PALMAS</Text></View>
          <Text style={s.featureTitle}>Serviços perto.{'\n'}Rotina mais leve.</Text>
          <View style={s.serviceTags}><Text style={s.serviceTag}>Reparos</Text><Text style={s.serviceTag}>Montagem</Text><Text style={s.serviceTag}>Instalações</Text></View>
        </View>
        {!stacked ? <View style={s.art} accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
          <HangingTag />
          <View style={s.orbit} />
        </View> : null}
      </IntroReveal>
      <IntroReveal order={3} style={s.loginWrap}>
        <PressableScale accessibilityRole="button" onPress={() => router.push(session ? './minha-conta' : '/entrar')} style={s.login}>
          <Text style={s.loginText}>{session ? 'Ir para minha conta' : 'Entrar na minha conta'}</Text>
          <View style={s.loginArrow} accessible={false}><Text style={s.arrowLight}>↗</Text></View>
        </PressableScale>
      </IntroReveal>
      <IntroReveal order={4} style={s.signupSection}>
        <View style={s.sectionHeading}><Text accessibilityRole="header" style={s.sectionTitle}>Seu primeiro passo</Text><Text style={s.sectionHint}>Ainda não tem conta?</Text></View>
        <View style={[s.choices, stacked && s.choicesStacked]}>
          <PressableScale accessibilityRole="button" accessibilityLabel="Encontrar serviços. Criar conta de cliente." onPress={() => router.push('/cadastro-cliente')} style={[s.choice, s.clientChoice]}>
            <View style={s.choiceTop}><Text style={s.choiceKicker}>PARA QUEM PRECISA</Text><View style={[s.choiceMark, s.clientMark]} accessible={false}><Text style={s.choiceMarkText}>↗</Text></View></View>
            <View style={s.choiceBody}><Text style={s.choiceTitle}>Encontrar{'\n'}serviços</Text><Text style={s.choiceDescription}>Crie sua conta de cliente.</Text></View>
          </PressableScale>
          <PressableScale accessibilityRole="button" accessibilityLabel="Oferecer serviços. Criar conta de prestador." onPress={() => router.push('/cadastro-prestador')} style={[s.choice, s.providerChoice]}>
            <View style={s.choiceTop}><Text style={s.choiceKicker}>PARA QUEM FAZ</Text><View style={[s.choiceMark, s.providerMark]} accessible={false}><Text style={[s.choiceMarkText, s.providerMarkText]}>↗</Text></View></View>
            <View style={s.choiceBody}><Text style={s.choiceTitle}>Oferecer{'\n'}serviços</Text><Text style={s.choiceDescription}>Crie seu perfil de prestador.</Text></View>
          </PressableScale>
        </View>
      </IntroReveal>
      <IntroReveal order={5} style={s.footer}>
        <Text style={s.footerText}>Conectando quem precisa a quem sabe fazer.</Text>
        {!session ? <Link href="/recuperar-senha" style={s.recovery}>Esqueci minha senha</Link> : null}
      </IntroReveal>
    </ScrollView>
  </SafeAreaView>;
}
const useS = themed(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 10, width: '100%', maxWidth: 520, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  headerEnd: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  logo: { width: 158, height: 44, tintColor: colors.text },
  location: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9, flexShrink: 1 },
  locationDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.link },
  locationText: { fontSize: 12, fontWeight: '600', color: colors.text, flexShrink: 1 },
  intro: { gap: 8, marginTop: 22 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: colors.textMuted },
  title: { fontSize: 38, lineHeight: 42, letterSpacing: -1.4, fontWeight: '800', color: colors.text },
  titleCompact: { fontSize: 32, lineHeight: 37, letterSpacing: -1 },
  description: { fontSize: 15, lineHeight: 22, color: colors.textSoft, maxWidth: 300 },
  feature: { minHeight: 162, marginTop: 22, backgroundColor: colors.ink, borderRadius: 28, paddingVertical: 22, paddingLeft: 22, overflow: 'hidden', justifyContent: 'center', borderWidth: 1, borderColor: colors.inkBorder },
  featureCopy: { gap: 12, paddingRight: 112, zIndex: 1 },
  featureCopyStacked: { paddingRight: 22 },
  featureTag: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  smallDot: { width: 6, height: 6, backgroundColor: colors.accent, borderRadius: 3 },
  featureTagText: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700', color: colors.onInkSoft },
  featureTitle: { fontSize: 25, lineHeight: 29, letterSpacing: -0.6, fontWeight: '700', color: colors.onInk },
  serviceTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  serviceTag: { borderWidth: 1, borderColor: colors.inkLine, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 5, fontSize: 10, color: colors.onInkSoft, overflow: 'hidden' },
  art: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 132 },
  orbit: { position: 'absolute', width: 108, height: 108, borderRadius: 54, borderWidth: 14, borderColor: colors.accent, right: 11, top: -62 },
  sticker: { position: 'absolute', right: 22, top: 32, width: 86, minHeight: 104, borderRadius: 18, backgroundColor: colors.onInkSoft, paddingHorizontal: 10, paddingTop: 28, paddingBottom: 12, transformOrigin: '50% 14%', gap: 5 },
  eyelet: { position: 'absolute', top: 10, alignSelf: 'center', width: 10, height: 10, borderRadius: 5, backgroundColor: colors.onAccent},
  spark: { fontSize: 20, color: colors.onAccent, lineHeight: 22 },
  stickerText: { fontSize: 10.5, lineHeight: 13, letterSpacing: -0.3, fontWeight: '800', color: colors.onAccent},
  stickerLine: { height: 2, width: 30, backgroundColor: colors.onAccent, marginTop: 1 },
  loginWrap: { marginTop: 12 },
  login: { minHeight: 62, borderRadius: 22, paddingVertical: 12, paddingLeft: 22, paddingRight: 12, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  loginText: { fontSize: 17, letterSpacing: -0.3, fontWeight: '700', color: colors.onAccent, flexShrink: 1 },
  loginArrow: { width: 38, height: 38, backgroundColor: colors.onAccent, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  arrowLight: { fontSize: 22, color: colors.onInkAccent, lineHeight: 27 },
  signupSection: { gap: 12, marginTop: 26 },
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12, rowGap: 2 },
  sectionTitle: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
  sectionHint: { fontSize: 13, color: colors.textMuted },
  choices: { flexDirection: 'row', gap: 12 },
  choicesStacked: { flexDirection: 'column' },
  choice: { flex: 1, padding: 14, borderRadius: 24, borderWidth: 1, minHeight: 142, justifyContent: 'space-between', gap: 14 },
  clientChoice: { backgroundColor: colors.surface, borderColor: colors.border },
  providerChoice: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  choiceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  choiceKicker: { fontSize: 9.5, lineHeight: 13, letterSpacing: 0.3, fontWeight: '700', color: colors.onAccentSoftMuted, flexShrink: 1 },
  choiceMark: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  clientMark: { backgroundColor: colors.surfacePressed },
  providerMark: { backgroundColor: colors.accent },
  providerMarkText: { color: colors.onAccent },
  choiceMarkText: { fontSize: 16, lineHeight: 20, color: colors.text },
  choiceBody: { gap: 6 },
  choiceTitle: { fontSize: 23, lineHeight: 26, letterSpacing: -0.7, fontWeight: '700', color: colors.text },
  choiceDescription: { fontSize: 11, lineHeight: 16, minHeight: 32, color: colors.textSoft },
  footer: { alignItems: 'center', marginTop: 'auto', paddingTop: 16 },
  footerText: { textAlign: 'center', fontSize: 12, lineHeight: 17, color: colors.textMuted },
  recovery: { color: colors.text, fontSize: 13, fontWeight: '600', paddingVertical: 13, minHeight: 44, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 14, paddingHorizontal: 16, textAlign: 'center', overflow: 'hidden' },
}));
