import { useRef, useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, styles } from '@/components/access-screen';
import { useSession } from '@/components/session';
import { api } from '@/lib/api';

export default function LoginScreen() {
  const { session, setSession } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  if (session) return <Redirect href="./minha-conta" />;
  async function submit() {
    if (pending.current) return;
    if (!email.trim() || !password.trim()) { setError('Preencha e-mail e senha.'); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      const result = await api('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      setPassword('');
      setSession({ token: result.token, expiresAt: result.expiresAt });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível entrar.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Link href="/" style={styles.back}>← Voltar ao início</Link>
    <Image source={require('../../assets/brand/logotipo-preto.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Maridão" />
    <Text accessibilityRole="header" style={styles.title}>Entre na sua conta</Text>
    <Text style={styles.description}>Seus serviços começam por aqui.</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <View style={s.group}><Text style={s.label}>E-mail</Text><TextInput accessibilityLabel="E-mail" placeholder="Digite seu e-mail" placeholderTextColor="#64705C" style={s.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={254} editable={!busy} /></View>
    <View style={s.group}><Text style={s.label}>Senha</Text><TextInput accessibilityLabel="Senha" placeholder="Digite sua senha" placeholderTextColor="#64705C" style={s.input} value={password} onChangeText={setPassword} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="current-password" maxLength={128} editable={!busy} /><Pressable accessibilityRole="button" onPress={() => setVisible(value => !value)} style={s.toggle}><Text>{visible ? 'Ocultar senha' : 'Mostrar senha'}</Text></Pressable></View>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={submit} style={({ pressed }) => [s.button, (busy || pressed) && { opacity: 0.7 }]}><Text style={s.buttonText}>{busy ? 'Entrando…' : 'Entrar'}</Text></Pressable>
    <Link href="/recuperar-senha" style={styles.back}>Esqueci minha senha</Link>
    <Link href="/cadastro-cliente" style={styles.back}>Quero me cadastrar como cliente</Link>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const s = StyleSheet.create({
  group: { gap: 8 }, label: { fontWeight: '600', fontSize: 16, color: colors.black },
  input: { borderWidth: 1, borderColor: '#64705C', borderRadius: 14, minHeight: 54, padding: 16, fontSize: 17, color: colors.black },
  button: { padding: 18, backgroundColor: colors.black, borderRadius: 16, minHeight: 56, alignItems: 'center' },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 17 }, toggle: { minHeight: 44, justifyContent: 'center' },
  error: { color: '#A32121', lineHeight: 24, fontSize: 16 },
});
