import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, styles } from '@/components/access-screen';

type Field = 'name' | 'email' | 'phone' | 'cpf' | 'neighborhood' | 'password';
const fields: { key: Field; label: string; props?: TextInputProps }[] = [
  { key: 'name', label: 'Nome completo', props: { autoCapitalize: 'words', autoComplete: 'name', maxLength: 150 } },
  { key: 'email', label: 'E-mail', props: { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email', maxLength: 254 } },
  { key: 'phone', label: 'Telefone com DDD', props: { keyboardType: 'phone-pad', autoComplete: 'tel', maxLength: 16, placeholder: '(63) 99999-9999' } },
  { key: 'cpf', label: 'CPF', props: { keyboardType: 'number-pad', maxLength: 14, placeholder: '000.000.000-00' } },
  { key: 'neighborhood', label: 'Bairro em Palmas', props: { autoCapitalize: 'words', maxLength: 100 } },
  { key: 'password', label: 'Senha', props: { autoCapitalize: 'none', autoComplete: 'new-password', maxLength: 128 } },
];
const empty = { name: '', email: '', phone: '', cpf: '', neighborhood: '', password: '' };

function validCpf(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  for (const length of [9, 10]) {
    const sum = [...digits.slice(0, length)].reduce((total, digit, i) => total + Number(digit) * (length + 1 - i), 0);
    const check = (sum * 10) % 11;
    if (Number(digits[length]) !== (check === 10 ? 0 : check)) return false;
  }
  return true;
}

export default function CustomerRegistration() {
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const requestActive = useRef(false);
  async function review() {
    if (requestActive.current) return;
    const next: Partial<Record<Field, string>> = {};
    for (const field of fields) if (!values[field.key].trim()) next[field.key] = 'Preencha este campo.';
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) next.email = 'Informe um e-mail válido.';
    if (values.phone.trim() && !/^\d{10,11}$/.test(values.phone.replace(/\D/g, ''))) next.phone = 'Informe o telefone com DDD (10 ou 11 dígitos).';
    if (values.cpf.trim() && !validCpf(values.cpf)) next.cpf = 'Confira os números do CPF.';
    if ([...values.password].length < 8 || [...values.password].length > 128) next.password = 'Use uma senha de 8 a 128 caracteres.';
    setErrors(next);
    if (Object.keys(next).length) { setMessage('Revise os campos indicados abaixo.'); return; }
    const base = process.env.EXPO_PUBLIC_API_URL;
    if (!base) { setMessage('A conexão com o servidor ainda precisa ser configurada.'); return; }
    if (!__DEV__ && !base.startsWith('https://')) { setMessage('O servidor precisa usar uma conexão segura.'); return; }
    requestActive.current = true;
    setSending(true);
    setMessage('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${base.replace(/\/$/, '')}/customers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values), signal: controller.signal,
      });
      const result = await response.json();
      if (response.status === 201) {
        setValues(empty);
        setVisiblePassword(false);
        setMessage('Cadastro criado com sucesso! Toque em Já tenho conta para entrar.');
      } else {
        if (response.status === 400 && result.fields) setErrors(result.fields);
        setMessage(typeof result.error === 'string' ? result.error : 'Não foi possível concluir o cadastro.');
      }
    } catch {
      setMessage('Não foi possível confirmar o cadastro. Confira a conexão com o servidor. Se tentar novamente e houver duplicidade, a primeira tentativa pode ter sido concluída.');
    } finally {
      clearTimeout(timeout);
      requestActive.current = false;
      setSending(false);
    }
  }
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Link href="/" style={styles.back}>← Voltar ao início</Link>
          <Text accessibilityRole="header" style={styles.title}>Cadastro de cliente</Text>
          <Text style={styles.description}>Encontre profissionais perto de você.</Text>
          <View style={s.location}><Text style={s.locationTitle}>Palmas – TO</Text><Text style={styles.note}>Nesta primeira versão, atendemos somente Palmas.</Text></View>
          <Text style={styles.note}>Todos os campos são obrigatórios. Ao criar a conta, seus dados serão enviados ao servidor do Maridão. Use uma senha de 8 a 128 caracteres; pode ser uma frase longa.</Text>
          {message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
          {fields.map(field => <View key={field.key} style={s.group}>
            <Text style={s.label}>{field.label}</Text>
            <TextInput {...field.props} editable={!sending} value={values[field.key]} autoCorrect={false} secureTextEntry={field.key === 'password' && !visiblePassword} accessibilityLabel={field.label} accessibilityHint={errors[field.key]} placeholderTextColor="#64705C" style={[s.input, errors[field.key] ? s.invalid : undefined]} onChangeText={text => { setValues(previous => ({ ...previous, [field.key]: text })); setErrors(previous => ({ ...previous, [field.key]: undefined })); setMessage(''); }} />
            {errors[field.key] ? <Text style={s.error}>{errors[field.key]}</Text> : null}
            {field.key === 'password' ? <Pressable accessibilityRole="button" accessibilityLabel={visiblePassword ? 'Ocultar senha' : 'Mostrar senha'} onPress={() => setVisiblePassword(value => !value)} style={s.toggle}><Text>{visiblePassword ? 'Ocultar senha' : 'Mostrar senha'}</Text></Pressable> : null}
          </View>)}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: sending, busy: sending }} disabled={sending} style={({ pressed }) => [s.button, (pressed || sending) && { opacity: 0.7 }]} onPress={review}><Text style={s.buttonText}>{sending ? 'Criando cadastro…' : 'Criar conta'}</Text></Pressable>
          <Link href="/entrar" style={styles.back}>Já tenho conta</Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  fill: { flex: 1 }, group: { gap: 8 }, label: { color: colors.black, fontSize: 16, fontWeight: '600' },
  input: { minHeight: 54, borderWidth: 1, borderColor: '#64705C', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, color: colors.black, backgroundColor: colors.white },
  invalid: { borderColor: '#A32121', borderWidth: 2 }, error: { color: '#A32121', fontSize: 14 },
  location: { backgroundColor: colors.pale, borderRadius: 18, padding: 18, gap: 6 }, locationTitle: { fontSize: 19, fontWeight: '700', color: colors.black },
  toggle: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 4 },
  button: { backgroundColor: colors.black, padding: 18, borderRadius: 16, minHeight: 56, alignItems: 'center' }, buttonText: { color: colors.white, fontWeight: '700', fontSize: 17 },
  message: { color: colors.black, backgroundColor: colors.pale, padding: 16, borderRadius: 14, fontSize: 16, lineHeight: 24 },
});
