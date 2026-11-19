import { filterOptions } from '@/lib/selection';
import { useMemo, useState } from 'react';
import { FlatList, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { Option } from '@/hooks/use-catalog';
import { FieldTrigger, useToggleProgress } from './field-motion';
import { themed, useTheme } from '@/theme';
type Props={label:string;options:Option[];values:string[];onChange:(values:string[])=>void;multiple?:boolean;max?:number;disabled?:boolean;error?:string;placeholder?:string};

export function SelectionField({label,options,values,onChange,multiple=false,max=20,disabled,error,placeholder='Selecionar'}:Props){
 const s=useS();const {colors}=useTheme();
 const [visible,setVisible]=useState(false),[search,setSearch]=useState('');
 const [draft,setDraft]=useState<string[]>([]);
 const matches=useMemo(()=>filterOptions(options,search),[options,search]);
 const selectedLabels=values.map(value=>options.find(item=>item.value===value)?.label??value);
 const pick=(value:string)=>{
  if(!multiple){onChange([value]);setVisible(false);return;}
  setDraft(old=>old.includes(value)?old.filter(item=>item!==value):old.length<max?[...old,value]:old);
 };
 return <View style={s.field}>
  <FieldTrigger invalid={!!error} accessibilityRole="button" accessibilityLabel={`${label}: ${selectedLabels.length?selectedLabels.join(', '):placeholder}`} accessibilityState={{disabled}} disabled={disabled} onPress={()=>{Keyboard.dismiss();setDraft(values);setSearch('');setVisible(true);}} style={[s.trigger,error?s.invalid:undefined]} pressedStyle={s.pressed}>
   <Text style={[s.value,!values.length&&s.placeholder]} numberOfLines={3}>{selectedLabels.length>3?`${selectedLabels.slice(0,3).join(', ')} + ${selectedLabels.length-3}`:selectedLabels.join(', ')||placeholder}</Text><Text style={s.chevron}>⌄</Text>
  </FieldTrigger>
  <Modal visible={visible} transparent animationType="slide" onRequestClose={()=>setVisible(false)}>
   <View style={s.overlay}><View style={s.dialog} accessibilityViewIsModal onAccessibilityEscape={()=>setVisible(false)}>
    <View style={s.header}><Text accessibilityRole="header" style={s.title}>{label}</Text><Pressable accessibilityRole="button" onPress={()=>setVisible(false)} style={s.close}><Text style={s.plain}>Fechar</Text></Pressable></View>
    <TextInput accessibilityLabel={`Buscar em ${label}`} style={s.search} placeholder="Buscar pelo nome…" placeholderTextColor={colors.placeholder} value={search} onChangeText={setSearch} autoCorrect={false} />
    <Text style={s.count}>{multiple?`${draft.length} de ${max} selecionados · `:''}{matches.length} opções</Text>
    <FlatList data={matches} keyExtractor={item=>item.value} style={s.list} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} ListEmptyComponent={<Text style={s.empty}>Nenhuma opção encontrada. Tente outro nome.</Text>} renderItem={({item})=>{
     const selected=(multiple?draft:values).includes(item.value),blocked=multiple&&!selected&&draft.length>=max;
     return <OptionRow label={item.label} multiple={multiple} selected={selected} blocked={blocked} onPress={()=>pick(item.value)}/>;
    }}/>
    <View style={s.footer}>
     <Pressable accessibilityRole="button" onPress={()=>{if(multiple)setDraft([]);else{onChange([]);setVisible(false);}}} style={s.clear}><Text style={s.plain}>Limpar seleção</Text></Pressable>
     {multiple?<Pressable accessibilityRole="button" onPress={()=>{onChange(draft);setVisible(false);}} style={s.confirm}><Text style={s.confirmText}>Confirmar ({draft.length})</Text></Pressable>:null}
    </View>
   </View></View>
  </Modal>
 </View>;
}
// Linha da lista: ao ser marcada, o fundo verde e o ✓ aparecem juntos (140 ms); ao ser desmarcada, somem (110 ms).
// Só opacidade. Linha que entra na tela já marcada (abrir o seletor, rolar, buscar) nasce pronta, sem transição.
// "Reduzir movimento": troca seca.
function OptionRow({label,multiple,selected,blocked,onPress}:{label:string;multiple:boolean;selected:boolean;blocked:boolean;onPress:()=>void}){
 const s=useS();
 const progress=useToggleProgress(selected);
 const on=useAnimatedStyle(()=>({opacity:progress.get()}));
 return <Pressable accessibilityRole={multiple?'checkbox':'radio'} accessibilityLabel={label} accessibilityState={{checked:selected,disabled:blocked}} disabled={blocked} onPress={onPress} style={({pressed})=>[s.row,blocked&&s.blocked,pressed&&s.pressed]}><Animated.View pointerEvents="none" style={[s.rowFill,on]}/><Text style={s.rowText}>{label}</Text><Animated.Text accessible={false} style={[s.mark,on]}>✓</Animated.Text></Pressable>;
}
export function CatalogNotice({error,retry}:{error:string;retry:()=>void}){
 const s=useS();
 return <View><Text style={s.notice}>{error||'Carregando opções…'}</Text>{error?<Pressable accessibilityRole="button" style={s.clear} onPress={retry}><Text style={s.plain}>Tentar novamente</Text></Pressable>:null}</View>;
}
const useS = themed(colors => StyleSheet.create({field:{gap:4},plain:{color:colors.text},trigger:{minHeight:58,borderWidth:1,borderColor:colors.borderStrong,borderRadius:16,padding:16,flexDirection:'row',alignItems:'center',gap:12,backgroundColor:colors.bg},value:{flex:1,fontSize:17,lineHeight:24,color:colors.text},placeholder:{color:colors.placeholder},chevron:{fontSize:24,color:colors.text},invalid:{borderColor:colors.danger,borderWidth:2},pressed:{opacity:0.65},overlay:{flex:1,backgroundColor:colors.scrim,justifyContent:'center',padding:16},dialog:{height:'85%',maxWidth:520,width:'100%',alignSelf:'center',backgroundColor:colors.surfaceRaised,borderRadius:24,padding:20,gap:12},header:{flexDirection:'row',alignItems:'center',gap:10},title:{flex:1,fontSize:21,fontWeight:'700',color:colors.text},close:{minHeight:44,justifyContent:'center',paddingHorizontal:8},search:{minHeight:52,borderWidth:1,borderColor:colors.borderStrong,borderRadius:14,padding:14,fontSize:16,color:colors.text},count:{fontSize:13,color:colors.textMuted},list:{flex:1},row:{minHeight:58,padding:14,borderBottomWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',gap:12},rowFill:{position:'absolute',top:0,right:0,bottom:0,left:0,borderRadius:12,backgroundColor:colors.accentSoft},blocked:{opacity:0.45},rowText:{flex:1,fontSize:16,lineHeight:23,color:colors.text},mark:{width:24,fontSize:20,color:colors.text},empty:{padding:16,color:colors.textMuted,fontSize:16,lineHeight:24},footer:{gap:6},clear:{minHeight:44,alignItems:'center',justifyContent:'center'},confirm:{backgroundColor:colors.primary,minHeight:54,padding:16,borderRadius:16,alignItems:'center'},confirmText:{color:colors.onPrimary,fontWeight:'700',fontSize:16},notice:{fontSize:15,lineHeight:22,color:colors.textMuted}}));
