import { useCatalog } from '@/hooks/use-catalog';
import { SelectionField, CatalogNotice } from '@/components/selection-field';
import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStyles } from '@/components/access-screen';
import { BackButton } from '@/components/back-button';
import { FieldError, FieldInput } from '@/components/field-motion';
import { validCpf } from '@/lib/validation';
import { themed, useTheme } from '@/theme';

type Field = 'name' | 'email' | 'phone' | 'cpf' | 'neighborhood' | 'password';
const fields: { key: Field; label: string; props?: TextInputProps }[] = [
  { key: 'name', label: 'Nome completo', props: { autoCapitalize: 'words', autoComplete: 'name', maxLength: 150 } },
  { key: 'email', label: 'E-mail', props: { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email', maxLength: 254 } },
  { key: 'phone', label: 'Telefone com DDD', props: { keyboardType: 'phone-pad', autoComplete: 'tel', maxLength: 16, placeholder: '(63) 99999-9999' } },
  { key: 'cpf', label: 'CPF', props: { keyboardType: 'number-pad', maxLength: 14, placeholder: '000.000.000-00' } },
  { key: 'neighborhood', label: 'Bairro ou quadra em Palmas', props: { autoCapitalize: 'words', maxLength: 100 } },
  { key: 'password', label: 'Senha', props: { autoCapitalize: 'none', autoComplete: 'new-password', maxLength: 128 } },
];
const empty = { name: '', email: '', phone: '', cpf: '', neighborhood: '', password: '' };

export default function CustomerRegistration() {
 const s=useS();const styles=useStyles();const {colors}=useTheme();
  const catalog = useCatalog();
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
          <BackButton href="/" label="Voltar ao início" />
          <Text accessibilityRole="header" style={styles.title}>Cadastro de cliente</Text>
          <Text style={styles.description}>Encontre profissionais perto de você.</Text>
          <View style={s.location}><Text style={s.locationTitle}>Palmas – TO</Text><Text style={styles.note}>Nesta primeira versão, atendemos somente Palmas.</Text></View>
          <Text style={styles.note}>Todos os campos são obrigatórios. Ao criar a conta, seus dados serão enviados ao servidor do Maridão. Use uma senha de 8 a 128 caracteres; pode ser uma frase longa.</Text>
          {message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
          {!catalog.data ? <CatalogNotice error={catalog.error} retry={catalog.retry} /> : null}
          {fields.map(field => <View key={field.key} style={s.group}>
            <Text style={s.label}>{field.label}</Text>
            {field.key === 'neighborhood' ? <SelectionField label="Bairro ou quadra em Palmas" options={catalog.data?.neighborhoods ?? []} values={values.neighborhood ? [values.neighborhood] : []} disabled={sending || !catalog.data} error={errors.neighborhood} onChange={selected => { setValues(old => ({ ...old, neighborhood: selected[0] ?? '' })); setErrors(old => ({ ...old, neighborhood: undefined })); }} /> : <FieldInput invalid={!!errors[field.key]} borderColor={colors.borderBold} {...field.props} editable={!sending} value={values[field.key]} autoCorrect={false} secureTextEntry={field.key === 'password' && !visiblePassword} accessibilityLabel={field.label} accessibilityHint={errors[field.key]} placeholderTextColor={colors.placeholder} style={[s.input, errors[field.key] ? s.invalid : undefined]} onChangeText={text => { setValues(previous => ({ ...previous, [field.key]: text })); setErrors(previous => ({ ...previous, [field.key]: undefined })); setMessage(''); }} />}
            <FieldError style={s.error}>{errors[field.key]}</FieldError>
            {field.key === 'password' ? <Pressable accessibilityRole="button" accessibilityLabel={visiblePassword ? 'Ocultar senha' : 'Mostrar senha'} onPress={() => setVisiblePassword(value => !value)} style={s.toggle}><Text style={styles.plain}>{visiblePassword ? 'Ocultar senha' : 'Mostrar senha'}</Text></Pressable> : null}
          </View>)}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: sending, busy: sending }} disabled={sending} style={({ pressed }) => [s.button, (pressed || sending) && { opacity: 0.7 }]} onPress={review}><Text style={s.buttonText}>{sending ? 'Criando cadastro…' : 'Criar conta'}</Text></Pressable>
          <Link href="/entrar" style={styles.back}>Já tenho conta</Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const useS = themed(colors => StyleSheet.create({
  fill: { flex: 1 }, group: { gap: 8 }, label: { color: colors.text, fontSize: 16, fontWeight: '600' },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.borderBold, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, color: colors.text, backgroundColor: colors.bg },
  invalid: { borderColor: colors.danger, borderWidth: 2 }, error: { color: colors.danger, fontSize: 14 },
  location: { backgroundColor: colors.accentSoft, borderRadius: 18, padding: 18, gap: 6 }, locationTitle: { fontSize: 19, fontWeight: '700', color: colors.onAccentSoft},
  toggle: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 4 },
  button: { backgroundColor: colors.primary, padding: 18, borderRadius: 16, minHeight: 56, alignItems: 'center' }, buttonText: { color: colors.onPrimary, fontWeight: '700', fontSize: 17 },
  message: { color: colors.onAccentSoft, backgroundColor: colors.accentSoft, padding: 16, borderRadius: 14, fontSize: 16, lineHeight: 24 },
}));
