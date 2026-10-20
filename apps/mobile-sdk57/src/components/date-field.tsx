import { useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from './access-screen';
import { calendarMonth, displayDate, moveMonth, todayInPalmas } from '@/lib/calendar';

type Props = { value: string; onChange: (value: string) => void; disabled?: boolean; error?: string };
const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export function DateField({ value, onChange, disabled, error }: Props) {
  const [open, setOpen] = useState(false);
  const today = todayInPalmas();
  const [page, setPage] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
  const monthId = `${page.year}-${String(page.month + 1).padStart(2, '0')}`;
  const previousDisabled = monthId <= today.slice(0, 7);
  function show() {
    Keyboard.dismiss();
    const initial = value && value >= today ? value : today;
    setPage({ year: Number(initial.slice(0, 4)), month: Number(initial.slice(5, 7)) - 1 });
    setOpen(true);
  }
  const heading = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(page.year, page.month, 1)));
  return <View style={s.field}>
    <Pressable accessibilityRole="button" accessibilityLabel={value ? `Alterar data de preferência, ${displayDate(value)}` : 'Escolher data de preferência'} accessibilityState={{ disabled }} disabled={disabled} onPress={show} style={({ pressed }) => [s.trigger, error ? s.invalid : undefined, pressed && s.pressed]}>
      <Text style={[s.dateText, !value && s.placeholder]}>{value ? displayDate(value) : 'Escolher uma data'}</Text><Text style={s.action}>Calendário</Text>
    </Pressable>
    {value ? <Pressable accessibilityRole="button" disabled={disabled} onPress={() => onChange('')} style={s.clear}><Text style={s.clearText}>Remover data</Text></Pressable> : null}
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={s.overlay}>
        <View style={s.dialog} accessibilityViewIsModal onAccessibilityEscape={() => setOpen(false)}>
          <ScrollView contentContainerStyle={s.dialogContent} bounces={false}>
            <Text accessibilityRole="header" style={s.title}>Quando você prefere?</Text>
            <Text style={s.hint}>Escolha hoje ou uma data futura.</Text>
            <View style={s.navigation}>
              <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" accessibilityState={{ disabled: previousDisabled }} disabled={previousDisabled} onPress={() => setPage(moveMonth(page.year, page.month, -1))} style={s.arrow}><Text style={[s.arrowText, previousDisabled && s.muted]}>‹</Text></Pressable>
              <Text accessibilityLiveRegion="polite" style={s.month}>{heading}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Próximo mês" onPress={() => setPage(moveMonth(page.year, page.month, 1))} style={s.arrow}><Text style={s.arrowText}>›</Text></Pressable>
            </View>
            <View style={s.grid}>
              {weekdays.map(day => <View key={day} style={s.cell}><Text style={s.weekday}>{day}</Text></View>)}
              {calendarMonth(page.year, page.month).map((date, index) => date ? <View key={date} style={s.cell}>
                <Pressable accessibilityRole="button" accessibilityLabel={new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'))} accessibilityState={{ disabled: date < today, selected: value === date }} disabled={date < today} onPress={() => { if (date < todayInPalmas()) return; onChange(date); setOpen(false); }} style={({ pressed }) => [s.day, date === today && s.today, value === date && s.selected, pressed && s.pressed]}>
                  <Text style={[s.dayText, date < today && s.muted, value === date && s.selectedText]}>{Number(date.slice(-2))}</Text>
                </Pressable>
              </View> : <View key={`empty-${index}`} style={s.cell} />)}
            </View>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={s.close}><Text style={s.closeText}>Fechar calendário</Text></Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
const s = StyleSheet.create({
  field: { gap: 4 }, trigger: { minHeight: 58, borderWidth: 1, borderColor: '#A4AF98', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: '#FFFFFF' }, dateText: { fontSize: 17, color: colors.black, flexShrink: 1 }, placeholder: { color: '#58634F' }, action: { fontSize: 13, fontWeight: '700', color: colors.black }, invalid: { borderColor: '#A32121' }, clear: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, clearText: { fontSize: 14, color: '#46503C', textDecorationLine: 'underline' },
  overlay: { flex: 1, backgroundColor: 'rgba(2,3,0,0.5)', justifyContent: 'center', padding: 20 }, dialog: { backgroundColor: colors.white, borderRadius: 28, width: '100%', maxWidth: 440, maxHeight: '85%', alignSelf: 'center', overflow: 'hidden' }, dialogContent: { padding: 20, gap: 12 }, title: { fontSize: 23, fontWeight: '800', color: colors.black }, hint: { fontSize: 15, lineHeight: 22, color: '#46503C' }, navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }, month: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', textTransform: 'capitalize', color: colors.black }, arrow: { width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, arrowText: { fontSize: 32, color: colors.black }, grid: { flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: '14.285714%', minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 3 }, weekday: { fontSize: 12, fontWeight: '600', color: '#58634F' }, day: { width: '100%', minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: 'transparent' }, dayText: { fontSize: 17, color: colors.black }, today: { borderColor: '#547A20', backgroundColor: '#F0FFDF' }, selected: { backgroundColor: colors.black, borderColor: colors.black }, selectedText: { color: colors.white }, muted: { color: '#A4AC9D' }, pressed: { opacity: 0.65 }, close: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.green, marginTop: 8 }, closeText: { fontSize: 16, fontWeight: '700', color: colors.black },
});
