import { useCatalog } from '@/hooks/use-catalog';
import { PressableScale } from '@/components/pressable-scale';
import { SelectionField, CatalogNotice } from '@/components/selection-field';
import { useRef, useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { Keyboard, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStyles } from '@/components/access-screen';
import { BackButton } from '@/components/back-button';
import { ToastHost } from '@/components/toast-host';
import { DateField } from '@/components/date-field';
import { FieldError, FieldInput } from '@/components/field-motion';
import { useSession } from '@/components/session';
import { todayInPalmas } from '@/lib/calendar';
import { api, ApiError } from '@/lib/api';
import { themed, useTheme } from '@/theme';

const empty = { category: '', description: '', neighborhood: '', preferredDate: '', preferredPeriod: '' };
const fields = [
  { key: 'category', label: 'Qual serviço você precisa?', hint: 'Ex.: montagem de móveis', max: 100 },
  { key: 'description', label: 'Conte um pouco mais', hint: 'O que precisa ser feito? Inclua os detalhes que podem ajudar o profissional.', max: 3000 },
  { key: 'neighborhood', label: 'Em qual bairro ou quadra?', hint: 'Bairro do atendimento em Palmas', max: 100 },
] as const;

export default function NewRequest() {
 const s=useS();const styles=useStyles();const {colors}=useTheme();
  const catalog = useCatalog();
  const { session, setSession } = useSession();
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(false);
  const [cancelledCount,setCancelledCount]=useState(0);
  const pending = useRef(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
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
      const result=await api('/requests', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: JSON.stringify(values) });
      setCancelledCount(result.cancelledCount ?? 0);
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
      <BackButton href="/minha-conta" label="Minha conta" />
      {published ? <View style={s.success}>
        <View style={s.check} accessible={false}><Text style={s.checkText}>✓</Text></View>
        <Text accessibilityRole="header" style={s.title}>Solicitação publicada!</Text>
        {cancelledCount > 0 ? <Text style={s.subtitle}>{cancelledCount === 1 ? 'O pedido aberto anterior desta categoria foi cancelado.' : 'Os ' + cancelledCount + ' pedidos abertos anteriores desta categoria foram cancelados.'}</Text> : null}
        <View style={s.status}><Text style={s.statusText}>Status: Aberta</Text></View>
        <Link href="/minha-conta" dismissTo style={s.returnLink}>Voltar para minha conta</Link>
        <PressableScale accessibilityRole="button" onPress={() => { setPublished(false); setMessage(''); }} style={s.secondary}><Text style={s.secondaryText}>Criar outra solicitação</Text></PressableScale>
      </View> : <>
        <View style={s.header}><Text style={s.location}>PALMAS · TO</Text><Text accessibilityRole="header" style={s.title}>Como podemos ajudar?</Text><Text style={s.subtitle}>Descreva o serviço que você precisa.</Text></View>
        {!catalog.data ? <CatalogNotice error={catalog.error} retry={catalog.retry} /> : null}
        <View style={s.section}>
          {fields.map(field => <View key={field.key} style={s.group}>
            <Text style={s.label}>{field.label}</Text>
            {field.key === 'category' || field.key === 'neighborhood' ? <SelectionField label={field.label} options={field.key === 'category' ? catalog.data?.services ?? [] : catalog.data?.neighborhoods ?? []} values={values[field.key] ? [values[field.key]] : []} disabled={busy || !catalog.data} error={errors[field.key]} onChange={selected => change(field.key, selected[0] ?? '')} /> : <FieldInput invalid={!!errors[field.key]} accessibilityLabel={field.label} accessibilityHint={errors[field.key]} editable={!busy} style={[s.input, field.key === 'description' && s.description, errors[field.key] ? s.invalid : undefined]} placeholder={field.hint} placeholderTextColor={colors.placeholder} maxLength={field.max} value={values[field.key]} multiline={field.key === 'description'} scrollEnabled={false} onChangeText={text => change(field.key, text)} />}
            <FieldError style={s.error}>{errors[field.key]}</FieldError>
          </View>)}
        </View>
        <View style={s.preference}>
          <Text accessibilityRole="header" style={s.sectionTitle}>Quando seria melhor?</Text>
          <Text style={s.optional}>Opcional</Text>
          <View style={s.group}><Text style={s.label}>Data de preferência</Text><DateField value={values.preferredDate} onChange={value => change('preferredDate', value)} disabled={busy} error={errors.preferredDate} /><FieldError style={s.error}>{errors.preferredDate}</FieldError></View>
          <View style={s.group}><Text style={s.label}>Período de preferência</Text><FieldInput invalid={!!errors.preferredPeriod} accessibilityLabel="Período de preferência, opcional" editable={!busy} style={[s.input, errors.preferredPeriod ? s.invalid : undefined]} value={values.preferredPeriod} onChangeText={text => change('preferredPeriod', text)} placeholder="Ex.: pela manhã" placeholderTextColor={colors.placeholder} maxLength={100} /><FieldError style={s.error}>{errors.preferredPeriod}</FieldError></View>
          <Text style={s.hint}>A data é uma preferência, sujeita à combinação com o prestador.</Text>
        </View>
        <Text style={s.hint}>Ao publicar, seus pedidos anteriores desta categoria que ainda estiverem abertos serão cancelados. Pedidos com proposta aceita serão mantidos.</Text>
        {message ? <Text accessibilityRole="alert" style={s.errorSummary}>{message}</Text> : null}
        <PressableScale accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={submit} style={s.button}><Text style={s.buttonText}>{busy ? 'Publicando…' : 'Publicar solicitação'}</Text></PressableScale>
      </>}
    </ScrollView>
    <ToastHost />
  </SafeAreaView>;
}
const useS = themed(colors => StyleSheet.create({
  page: { padding: 24, paddingBottom: 56, gap: 28, width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1 },
  back: { paddingVertical: 12, fontSize: 16, color: colors.textSoft }, header: { gap: 12 }, location: { alignSelf: 'flex-start', backgroundColor: colors.accentSoft, color: colors.onAccentSoft, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '800', color: colors.text }, subtitle: { fontSize: 17, lineHeight: 25, color: colors.textMuted }, section: { gap: 24 }, group: { gap: 10 }, label: { fontSize: 16, fontWeight: '600', color: colors.text }, input: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 16, padding: 16, minHeight: 58, fontSize: 17, lineHeight: 24, color: colors.text, backgroundColor: colors.bg }, description: { minHeight: 140, textAlignVertical: 'top' },
  preference: { gap: 16, backgroundColor: colors.accentWash, borderRadius: 24, padding: 20 }, sectionTitle: { fontSize: 21, fontWeight: '700', color: colors.text }, optional: { fontSize: 13, color: colors.textMuted, marginTop: -8 }, hint: { fontSize: 13, lineHeight: 20, color: colors.textMuted }, invalid: { borderColor: colors.danger, borderWidth: 2 }, error: { color: colors.danger, fontSize: 14 }, errorSummary: { color: colors.danger, fontSize: 15, lineHeight: 22 },
  button: { backgroundColor: colors.primary, minHeight: 58, padding: 18, borderRadius: 18, alignItems: 'center' }, buttonText: { color: colors.onPrimary, fontSize: 17, fontWeight: '700' }, success: { gap: 24, paddingTop: 36, alignItems: 'center' }, check: { width: 72, height: 72, backgroundColor: colors.accent, borderRadius: 36, alignItems: 'center', justifyContent: 'center' }, checkText: { color: colors.onAccent, fontSize: 38 }, status: { backgroundColor: colors.accentSoft, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 }, statusText: { color: colors.onAccentSoft, fontWeight: '600', fontSize: 15 }, returnLink: { fontSize: 16, color: colors.text, paddingVertical: 14, textDecorationLine: 'underline' }, secondary: { minHeight: 54, padding: 16, borderRadius: 16, borderColor: colors.borderStrong, borderWidth: 1, alignSelf: 'stretch', alignItems: 'center' }, secondaryText: { fontSize: 16, color: colors.text, fontWeight: '600' },
}));
