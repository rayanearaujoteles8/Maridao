import { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { calendarMonth, displayDate, moveMonth, todayInPalmas } from '@/lib/calendar';
import { themed, useTheme } from '@/theme';
import { FieldTrigger, useToggleProgress } from './field-motion';

// Movimento do calendário, só no que muda de estado:
// - trocar de mês: a grade de dias entra com opacidade + 10 pt vindos do lado da seta tocada (180 ms). O nome do mês e
//   os dias da semana trocam secos. Abrir o calendário não move a grade.
// - escolher um dia: o dia preenche (120 ms) e o calendário fecha logo depois (140 ms após o toque), para a escolha
//   ser vista antes de a janela sair. A data vale desde o toque.
// "Reduzir movimento": troca seca e fechamento imediato, como antes.
const MONTH_MS = 180;
const MONTH_SHIFT = 10;
const PICK_MS = 120;
const CLOSE_AFTER_PICK_MS = 140;
const out = Easing.out(Easing.cubic);

// `title` e `hint`: o que o calendário aberto pergunta. O padrão é o da data de preferência do pedido; quem usa o campo
// para outra data (ex.: validade da proposta) passa os seus.
type Props = { label?: string; title?: string; hint?: string; value: string; onChange: (value: string) => void; disabled?: boolean; error?: string };
const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export function DateField({ label = 'data de preferência', title = 'Quando você prefere?', hint = 'Escolha hoje ou uma data futura.', value, onChange, disabled, error }: Props) {
 const s=useS();
  const [open, setOpen] = useState(false);
  const today = todayInPalmas();
  const [page, setPage] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
  const monthId = `${page.year}-${String(page.month + 1).padStart(2, '0')}`;
  const previousDisabled = monthId <= today.slice(0, 7);
  const reduced = useReducedMotion();
  const fade = useSharedValue(1), shift = useSharedValue(0);
  const grid = useAnimatedStyle(() => ({ opacity: fade.get(), transform: [{ translateX: shift.get() }] }));
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => { if (closing.current) { clearTimeout(closing.current); closing.current = null; } };
  useEffect(() => () => { if (closing.current) clearTimeout(closing.current); }, []);
  function close() { cancelClose(); setOpen(false); }
  function turn(delta: 1 | -1) {
    setPage(moveMonth(page.year, page.month, delta));
    if (reduced) return;
    // A grade some no mesmo toque e volta já com o mês novo, vinda do lado para onde a pessoa avançou.
    fade.set(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: MONTH_MS, easing: out })));
    shift.set(withSequence(withTiming(delta * MONTH_SHIFT, { duration: 0 }), withTiming(0, { duration: MONTH_MS, easing: out })));
  }
  function pick(date: string) {
    if (date < todayInPalmas()) return;
    onChange(date);
    cancelClose();
    if (reduced) { setOpen(false); return; }
    closing.current = setTimeout(() => { closing.current = null; setOpen(false); }, CLOSE_AFTER_PICK_MS);
  }
  function show() {
    Keyboard.dismiss();
    cancelClose();
    const initial = value && value >= today ? value : today;
    setPage({ year: Number(initial.slice(0, 4)), month: Number(initial.slice(5, 7)) - 1 });
    setOpen(true);
  }
  const heading = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(page.year, page.month, 1)));
  return <View style={s.field}>
    <FieldTrigger invalid={!!error} accessibilityRole="button" accessibilityLabel={value ? `Alterar ${label}, ${displayDate(value)}` : `Escolher ${label}`} accessibilityState={{ disabled }} disabled={disabled} onPress={show} style={[s.trigger, error ? s.invalid : undefined]} pressedStyle={s.pressed}>
      <Text style={[s.dateText, !value && s.placeholder]}>{value ? displayDate(value) : 'Escolher uma data'}</Text><Text style={s.action}>Calendário</Text>
    </FieldTrigger>
    {value ? <Pressable accessibilityRole="button" disabled={disabled} onPress={() => onChange('')} style={s.clear}><Text style={s.clearText}>Remover data</Text></Pressable> : null}
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View style={s.overlay}>
        <View style={s.dialog} accessibilityViewIsModal onAccessibilityEscape={close}>
          <ScrollView contentContainerStyle={s.dialogContent} bounces={false}>
            <Text accessibilityRole="header" style={s.title}>{title}</Text>
            <Text style={s.hint}>{hint}</Text>
            <View style={s.navigation}>
              <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" accessibilityState={{ disabled: previousDisabled }} disabled={previousDisabled} onPress={() => turn(-1)} style={s.arrow}><Text style={[s.arrowText, previousDisabled && s.muted]}>‹</Text></Pressable>
              <Text accessibilityLiveRegion="polite" style={s.month}>{heading}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Próximo mês" onPress={() => turn(1)} style={s.arrow}><Text style={s.arrowText}>›</Text></Pressable>
            </View>
            <View style={s.grid}>
              {weekdays.map(day => <View key={day} style={s.cell}><Text style={s.weekday}>{day}</Text></View>)}
            </View>
            <Animated.View style={[s.grid, s.days, grid]}>
              {calendarMonth(page.year, page.month).map((date, index) => date ? <View key={date} style={s.cell}>
                <Day date={date} today={today} selected={value === date} onPress={() => pick(date)} />
              </View> : <View key={`empty-${index}`} style={s.cell} />)}
            </Animated.View>
            <Pressable accessibilityRole="button" onPress={close} style={s.close}><Text style={s.closeText}>Fechar calendário</Text></Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
function Day({ date, today, selected, onPress }: { date: string; today: string; selected: boolean; onPress: () => void }) {
  const s = useS();
  const { colors } = useTheme();
  const past = date < today;
  const rest = past ? colors.disabledText : colors.text, on = colors.onPrimary;
  const progress = useToggleProgress(selected, PICK_MS, 100);
  const fill = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const ink = useAnimatedStyle(() => ({ color: interpolateColor(progress.get(), [0, 1], [rest, on]) }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'))} accessibilityState={{ disabled: past, selected }} disabled={past} onPress={onPress} style={({ pressed }) => [s.day, date === today && s.today, pressed && s.pressed]}>
      <Animated.View pointerEvents="none" style={[s.dayFill, fill]} />
      <Animated.Text style={[s.dayText, ink]}>{Number(date.slice(-2))}</Animated.Text>
    </Pressable>
  );
}
const useS = themed(colors => StyleSheet.create({
  field: { gap: 4 }, trigger: { minHeight: 58, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: colors.bg }, dateText: { fontSize: 17, color: colors.text, flexShrink: 1 }, placeholder: { color: colors.placeholder}, action: { fontSize: 13, fontWeight: '700', color: colors.text }, invalid: { borderColor: colors.danger }, clear: { minHeight: 44, justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12 }, clearText: { fontSize: 14, color: colors.textSoft, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: 20 }, dialog: { backgroundColor: colors.surfaceRaised, borderRadius: 28, width: '100%', maxWidth: 440, maxHeight: '85%', alignSelf: 'center', overflow: 'hidden' }, dialogContent: { padding: 20, gap: 12 }, title: { fontSize: 23, fontWeight: '800', color: colors.text }, hint: { fontSize: 15, lineHeight: 22, color: colors.textSoft }, navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }, month: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', textTransform: 'capitalize', color: colors.text }, arrow: { width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, arrowText: { fontSize: 32, color: colors.text }, grid: { flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: '14.285714%', minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 3 }, weekday: { fontSize: 12, fontWeight: '600', color: colors.textMuted }, day: { width: '100%', minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: 'transparent' }, dayText: { fontSize: 17, color: colors.text }, today: { borderColor: colors.link, backgroundColor: colors.accentWash }, dayFill: { position: 'absolute', top: -1, right: -1, bottom: -1, left: -1, borderRadius: 14, backgroundColor: colors.primary }, days: { marginTop: -12 }, muted: { color: colors.disabledText }, pressed: { opacity: 0.65 }, close: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.accent, marginTop: 8 }, closeText: { fontSize: 16, fontWeight: '700', color: colors.onAccent},
}));
