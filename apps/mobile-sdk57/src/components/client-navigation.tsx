import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './access-screen';
type Tab='home'|'professionals'|'requests';
export function ClientNavigation({active,onActivePress}:{active:Tab;onActivePress?:()=>void}){
 const entries=[{key:'home',label:'Início',href:'/minha-conta'},{key:'professionals',label:'Profissionais',href:'/buscar-prestadores'},{key:'requests',label:'Pedidos',href:'/solicitacoes'}] as const;
 return <View style={s.wrap}><View style={s.dock}>{entries.map(item=><Pressable key={item.key} accessibilityRole="button" accessibilityState={{selected:active===item.key}} accessibilityLabel={item.label} style={[s.item,active===item.key&&s.active]} onPress={()=>active===item.key?onActivePress?.():router.replace(item.href)}><Text style={[s.text,active===item.key&&s.activeText]}>{item.label}</Text></Pressable>)}</View></View>;
}
const s=StyleSheet.create({wrap:{paddingHorizontal:22,paddingVertical:8,width:'100%',maxWidth:520,alignSelf:'center',backgroundColor:colors.white},dock:{backgroundColor:colors.black,borderRadius:24,padding:7,flexDirection:'row',gap:4},item:{flex:1,minHeight:46,paddingVertical:12,paddingHorizontal:4,alignItems:'center',justifyContent:'center',borderRadius:18},active:{backgroundColor:colors.green},text:{color:colors.white,fontSize:12,fontWeight:'600',textAlign:'center'},activeText:{color:colors.black,fontWeight:'700'}});
