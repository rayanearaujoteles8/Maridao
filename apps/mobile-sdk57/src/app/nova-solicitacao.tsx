import { useCatalog } from '@/hooks/use-catalog';
import { SelectionField, CatalogNotice } from '@/components/selection-field';
import { useRef, useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, styles } from '@/components/access-screen';
import { DateField } from '@/components/date-field';
import { useSession } from '@/components/session';
import { todayInPalmas } from '@/lib/calendar';
import { api, ApiError } from '@/lib/api';

const empty = { category: '', description: '', neighborhood: '', preferredDate: '', preferredPeriod: '' };
const fields = [
  { key: 'category', label: 'Qual serviço você precisa?', hint: 'Ex.: montagem de móveis', max: 100 },
  { key: 'description', label: 'Conte um pouco mais', hint: 'O que precisa ser feito? Inclua os detalhes que podem ajudar o profissional.', max: 3000 },
  { key: 'neighborhood', label: 'Em qual bairro ou quadra?', hint: 'Bairro do atendimento em Palmas', max: 100 },
] as const;

export default function NewRequest() {
  const catalog = useCatalog();
  const { session, setSession } = useSession();
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(false);
  const pending = useRef(false);
  const scroll = useRef<ScrollView>(null);
  if (!session) return <Redirect href="/entrar" />;
  function change(key: keyof typeof empty, text: string) {
    setValues(old => ({ ...old, [key]: text }));
    setErrors(old => ({ ...old, [key]: '' }));
    setMessage('');
  }
  async function submit() {
    if (!session || pending.current) return;
    const next: Record<string, string> = {};
    for (const key of ['category', 'description', 'neighborhood'] as const) if (!values[key].trim()) next[key] = 'Preencha este campo.';
    if (values.preferredDate && values.preferredDate < todayInPalmas()) next.preferredDate = 'Escolha hoje ou uma data futura.';
    setErrors(next); setMessage('');
    if (Object.keys(next).length) { setMessage('Confira os campos destacados.'); return; }
    pending.current = true; setBusy(true); Keyboard.dismiss();
    try {
      await api('/requests', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: JSON.stringify(values) });
      setValues(empty); setPublished(true); scroll.current?.scrollTo({ y: 0, animated: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setSession(null);
      else {
        if (error instanceof ApiError && error.fields) setErrors(error.fields);
        setMessage(error instanceof Error ? error.message : 'Não foi possível publicar. Tente novamente.');
      }
    } finally { pending.current = false; setBusy(false); }
  }
  return <SafeAreaView style={styles.safe}>
    <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={s.page} automaticallyAdjustKeyboardInsets keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled">
      <Link href="/minha-conta" style={s.back}>‹ Minha conta</Link>
      {published ? <View style={s.success}>
        <View style={s.check} accessible={false}><Text style={s.checkText}>✓</Text></View>
        <Text accessibilityRole="header" style={s.title}>Solicitação publicada!</Text>
        <View style={s.status}><Text style={s.statusText}>Status: Aberta</Text></View>
        <Link href="/minha-conta" style={s.returnLink}>Voltar para minha conta</Link>
        <Pressable accessibilityRole="button" onPress={() => { setPublished(false); setMessage(''); }} style={s.secondary}><Text style={s.secondaryText}>Criar outra solicitação</Text></Pressable>
      </View> : <>
        <View style={s.header}><Text style={s.location}>PALMAS · TO</Text><Text accessibilityRole="header" style={s.title}>Como podemos ajudar?</Text><Text style={s.subtitle}>Descreva o serviço que você precisa.</Text></View>
        {!catalog.data ? <CatalogNotice error={catalog.error} retry={catalog.retry} /> : null}
        <View style={s.section}>
          {fields.map(field => <View key={field.key} style={s.group}>
            <Text style={s.label}>{field.label}</Text>
            {field.key === 'category' || field.key === 'neighborhood' ? <SelectionField label={field.label} options={field.key === 'category' ? catalog.data?.services ?? [] : catalog.data?.neighborhoods ?? []} values={values[field.key] ? [values[field.key]] : []} disabled={busy || !catalog.data} error={errors[field.key]} onChange={selected => change(field.key, selected[0] ?? '')} /> : <TextInput accessibilityLabel={field.label} accessibilityHint={errors[field.key]} editable={!busy} style={[s.input, field.key === 'description' && s.description, errors[field.key] ? s.invalid : undefined]} placeholder={field.hint} placeholderTextColor="#6B7561" maxLength={field.max} value={values[field.key]} multiline={field.key === 'description'} scrollEnabled={false} onChangeText={text => change(field.key, text)} />}
            {errors[field.key] ? <Text style={s.error}>{errors[field.key]}</Text> : null}
          </View>)}
        </View>
        <View style={s.preference}>
          <Text accessibilityRole="header" style={s.sectionTitle}>Quando seria melhor?</Text>
          <Text style={s.optional}>Opcional</Text>
          <View style={s.group}><Text style={s.label}>Data de preferência</Text><DateField value={values.preferredDate} onChange={value => change('preferredDate', value)} disabled={busy} error={errors.preferredDate} />{errors.preferredDate ? <Text style={s.error}>{errors.preferredDate}</Text> : null}</View>
          <View style={s.group}><Text style={s.label}>Período de preferência</Text><TextInput accessibilityLabel="Período de preferência, opcional" editable={!busy} style={s.input} value={values.preferredPeriod} onChangeText={text => change('preferredPeriod', text)} placeholder="Ex.: pela manhã" placeholderTextColor="#6B7561" maxLength={100} />{errors.preferredPeriod ? <Text style={s.error}>{errors.preferredPeriod}</Text> : null}</View>
          <Text style={s.hint}>A data é uma preferência, sujeita à combinação com o prestador.</Text>
        </View>
        {message ? <Text accessibilityRole="alert" style={s.errorSummary}>{message}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={submit} style={({ pressed }) => [s.button, (pressed || busy) && { opacity: 0.7 }]}><Text style={s.buttonText}>{busy ? 'Publicando…' : 'Publicar solicitação'}</Text></Pressable>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  page: { padding: 24, paddingBottom: 56, gap: 28, width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1 },
  back: { paddingVertical: 12, fontSize: 16, color: '#46503C' }, header: { gap: 12 }, location: { alignSelf: 'flex-start', backgroundColor: colors.pale, color: colors.black, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '800', color: colors.black }, subtitle: { fontSize: 17, lineHeight: 25, color: '#58634F' }, section: { gap: 24 }, group: { gap: 10 }, label: { fontSize: 16, fontWeight: '600', color: colors.black }, input: { borderWidth: 1, borderColor: '#A4AF98', borderRadius: 16, padding: 16, minHeight: 58, fontSize: 17, lineHeight: 24, color: colors.black, backgroundColor: colors.white }, description: { minHeight: 140, textAlignVertical: 'top' },
  preference: { gap: 16, backgroundColor: '#F5F9F0', borderRadius: 24, padding: 20 }, sectionTitle: { fontSize: 21, fontWeight: '700', color: colors.black }, optional: { fontSize: 13, color: '#58634F', marginTop: -8 }, hint: { fontSize: 13, lineHeight: 20, color: '#58634F' }, invalid: { borderColor: '#A32121', borderWidth: 2 }, error: { color: '#A32121', fontSize: 14 }, errorSummary: { color: '#A32121', fontSize: 15, lineHeight: 22 },
  button: { backgroundColor: colors.black, minHeight: 58, padding: 18, borderRadius: 18, alignItems: 'center' }, buttonText: { color: colors.white, fontSize: 17, fontWeight: '700' }, success: { gap: 24, paddingTop: 36, alignItems: 'center' }, check: { width: 72, height: 72, backgroundColor: colors.green, borderRadius: 36, alignItems: 'center', justifyContent: 'center' }, checkText: { color: colors.black, fontSize: 38 }, status: { backgroundColor: colors.pale, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 }, statusText: { color: colors.black, fontWeight: '600', fontSize: 15 }, returnLink: { fontSize: 16, color: colors.black, paddingVertical: 14, textDecorationLine: 'underline' }, secondary: { minHeight: 54, padding: 16, borderRadius: 16, borderColor: '#A4AF98', borderWidth: 1, alignSelf: 'stretch', alignItems: 'center' }, secondaryText: { fontSize: 16, color: colors.black, fontWeight: '600' },
});
