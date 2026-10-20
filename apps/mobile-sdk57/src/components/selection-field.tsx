import { filterOptions } from '@/lib/selection';
import { useMemo, useState } from 'react';
import { FlatList, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from './access-screen';
import type { Option } from '@/hooks/use-catalog';
type Props={label:string;options:Option[];values:string[];onChange:(values:string[])=>void;multiple?:boolean;max?:number;disabled?:boolean;error?:string;placeholder?:string};

export function SelectionField({label,options,values,onChange,multiple=false,max=20,disabled,error,placeholder='Selecionar'}:Props){
 const [visible,setVisible]=useState(false),[search,setSearch]=useState('');
 const [draft,setDraft]=useState<string[]>([]);
 const matches=useMemo(()=>filterOptions(options,search),[options,search]);
 const selectedLabels=values.map(value=>options.find(item=>item.value===value)?.label??value);
 const pick=(value:string)=>{
  if(!multiple){onChange([value]);setVisible(false);return;}
  setDraft(old=>old.includes(value)?old.filter(item=>item!==value):old.length<max?[...old,value]:old);
 };
 return <View style={s.field}>
  <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selectedLabels.length?selectedLabels.join(', '):placeholder}`} accessibilityState={{disabled}} disabled={disabled} onPress={()=>{Keyboard.dismiss();setDraft(values);setSearch('');setVisible(true);}} style={({pressed})=>[s.trigger,error?s.invalid:undefined,pressed&&s.pressed]}>
   <Text style={[s.value,!values.length&&s.placeholder]} numberOfLines={3}>{selectedLabels.length>3?`${selectedLabels.slice(0,3).join(', ')} + ${selectedLabels.length-3}`:selectedLabels.join(', ')||placeholder}</Text><Text style={s.chevron}>⌄</Text>
  </Pressable>
  <Modal visible={visible} transparent animationType="slide" onRequestClose={()=>setVisible(false)}>
   <View style={s.overlay}><View style={s.dialog} accessibilityViewIsModal onAccessibilityEscape={()=>setVisible(false)}>
    <View style={s.header}><Text accessibilityRole="header" style={s.title}>{label}</Text><Pressable accessibilityRole="button" onPress={()=>setVisible(false)} style={s.close}><Text>Fechar</Text></Pressable></View>
    <TextInput accessibilityLabel={`Buscar em ${label}`} style={s.search} placeholder="Buscar pelo nome…" placeholderTextColor="#64705C" value={search} onChangeText={setSearch} autoCorrect={false} />
    <Text style={s.count}>{multiple?`${draft.length} de ${max} selecionados · `:''}{matches.length} opções</Text>
    <FlatList data={matches} keyExtractor={item=>item.value} style={s.list} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} ListEmptyComponent={<Text style={s.empty}>Nenhuma opção encontrada. Tente outro nome.</Text>} renderItem={({item})=>{
     const selected=(multiple?draft:values).includes(item.value),blocked=multiple&&!selected&&draft.length>=max;
     return <Pressable accessibilityRole={multiple?'checkbox':'radio'} accessibilityState={{checked:selected,disabled:blocked}} disabled={blocked} onPress={()=>pick(item.value)} style={({pressed})=>[s.row,selected&&s.selected,blocked&&s.blocked,pressed&&s.pressed]}><Text style={s.rowText}>{item.label}</Text><Text style={s.mark}>{selected?'✓':''}</Text></Pressable>;
    }}/>
    <View style={s.footer}>
     <Pressable accessibilityRole="button" onPress={()=>{if(multiple)setDraft([]);else{onChange([]);setVisible(false);}}} style={s.clear}><Text>Limpar seleção</Text></Pressable>
     {multiple?<Pressable accessibilityRole="button" onPress={()=>{onChange(draft);setVisible(false);}} style={s.confirm}><Text style={s.confirmText}>Confirmar ({draft.length})</Text></Pressable>:null}
    </View>
   </View></View>
  </Modal>
 </View>;
}
export function CatalogNotice({error,retry}:{error:string;retry:()=>void}){
 return <View><Text style={s.notice}>{error||'Carregando opções…'}</Text>{error?<Pressable accessibilityRole="button" style={s.clear} onPress={retry}><Text>Tentar novamente</Text></Pressable>:null}</View>;
}
const s=StyleSheet.create({field:{gap:4},trigger:{minHeight:58,borderWidth:1,borderColor:'#A4AF98',borderRadius:16,padding:16,flexDirection:'row',alignItems:'center',gap:12,backgroundColor:colors.white},value:{flex:1,fontSize:17,lineHeight:24,color:colors.black},placeholder:{color:'#64705C'},chevron:{fontSize:24,color:colors.black},invalid:{borderColor:'#A32121',borderWidth:2},pressed:{opacity:0.65},overlay:{flex:1,backgroundColor:'rgba(2,3,0,0.5)',justifyContent:'center',padding:16},dialog:{height:'85%',maxWidth:520,width:'100%',alignSelf:'center',backgroundColor:colors.white,borderRadius:24,padding:20,gap:12},header:{flexDirection:'row',alignItems:'center',gap:10},title:{flex:1,fontSize:21,fontWeight:'700',color:colors.black},close:{minHeight:44,justifyContent:'center',paddingHorizontal:8},search:{minHeight:52,borderWidth:1,borderColor:'#A4AF98',borderRadius:14,padding:14,fontSize:16,color:colors.black},count:{fontSize:13,color:'#58634F'},list:{flex:1},row:{minHeight:58,padding:14,borderBottomWidth:1,borderColor:'#E7EDDF',flexDirection:'row',alignItems:'center',gap:12},selected:{backgroundColor:colors.pale,borderRadius:12},blocked:{opacity:0.45},rowText:{flex:1,fontSize:16,lineHeight:23,color:colors.black},mark:{width:24,fontSize:20,color:colors.black},empty:{padding:16,color:'#58634F',fontSize:16,lineHeight:24},footer:{gap:6},clear:{minHeight:44,alignItems:'center',justifyContent:'center'},confirm:{backgroundColor:colors.black,minHeight:54,padding:16,borderRadius:16,alignItems:'center'},confirmText:{color:colors.white,fontWeight:'700',fontSize:16},notice:{fontSize:15,lineHeight:22,color:'#58634F'}});
