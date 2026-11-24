import { Image, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useStatusPulse } from './list-entrance';
import { themed } from '@/theme';

export function WorkflowHeading({eyebrow,title,description}:{eyebrow:string;title:string;description:string}){
 const flow=useFlow();
 return <View style={flow.heading}>
  <View style={flow.headingTop}><Image source={require('../../assets/brand/logotipo-preto.png')} style={flow.logo} resizeMode="contain" accessibilityLabel="Maridão"/><Text accessible={false} style={flow.spark}>✦</Text></View>
  <Text style={flow.eyebrow}>{eyebrow}</Text>
  <Text accessibilityRole="header" style={flow.title}>{title}</Text>
  <Text style={flow.subtitle}>{description}</Text>
 </View>;
}
// A pílula troca de cor com um pulso curto quando o status muda com ela na tela (useStatusPulse); na montagem, não.
export function StatusBadge({status}:{status:string}){
 const flow=useFlow();const pulse=useStatusPulse(status);
 const dark=status==='Concluída'||status==='Aceita';
 // "Aguardando confirmação": o verde cheio da marca, para a etapa que espera a resposta de alguém.
 const waiting=status==='Aguardando confirmação';
 const muted=['Cancelada','Retirada','Não selecionada','Substituída'].includes(status);
 // "Expirada": tom de alerta (texto + cor), diferente das apagadas, porque ainda pede uma ação (reenviar).
 const expired=status==='Expirada';
 return <Animated.Text accessibilityLabel={`Status: ${status}`} style={[flow.badge,dark&&flow.badgeDark,waiting&&flow.badgeWaiting,muted&&flow.badgeMuted,expired&&flow.badgeExpired,pulse]}>{status}</Animated.Text>;
}
export const useFlow = themed(colors => StyleSheet.create({
 page:{paddingHorizontal:22,paddingTop:8,paddingBottom:48,gap:18,width:'100%',maxWidth:520,alignSelf:'center',flexGrow:1},
 back:{minHeight:44,paddingVertical:12,fontSize:14,fontWeight:'600',color:colors.link},
 heading:{backgroundColor:colors.accent,padding:22,borderRadius:28,gap:10},
 headingTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:10},
 logo:{width:136,height:38,tintColor:colors.onAccent},spark:{fontSize:28,color:colors.onAccent},
 eyebrow:{fontSize:10,letterSpacing:1.2,fontWeight:'700',color:colors.onAccentMuted},
 title:{fontSize:32,lineHeight:37,letterSpacing:-0.8,fontWeight:'800',color:colors.onAccent},
 subtitle:{fontSize:14,lineHeight:21,color:colors.onAccentMuted},
 card:{backgroundColor:colors.surfaceRaised,borderWidth:1,borderColor:colors.border,borderRadius:24,padding:20,gap:12},
 acceptedCard:{borderColor:colors.text,borderWidth:2},
 row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:10},
 cardTitle:{fontSize:20,lineHeight:26,fontWeight:'700',letterSpacing:-0.3,color:colors.text,flexShrink:1},
 description:{fontSize:15,lineHeight:23,color:colors.textSoft},
 field:{fontSize:14,lineHeight:21,color:colors.textMuted},
 note:{fontSize:12,lineHeight:19,color:colors.textMuted},
 // Toda pílula tem contorno de 1 pt (transparente nas claras) para manter o mesmo tamanho.
 badge:{alignSelf:'flex-start',backgroundColor:colors.accentSoft,color:colors.onAccentSoft,borderRadius:12,borderWidth:1,borderColor:'transparent',paddingHorizontal:12,paddingVertical:6,fontSize:12,fontWeight:'700',overflow:'hidden'},
 // Tinta: no escuro `ink` é igual a `surfaceRaised` (fundo do cartão), então o contorno em `primary` desenha a pílula
 // (verde no escuro, 13,9:1 sobre o cartão; no claro é o próprio preto da pílula e não aparece).
 badgeDark:{backgroundColor:colors.ink,color:colors.onInkAccent,borderColor:colors.primary},
 badgeWaiting:{backgroundColor:colors.accent,color:colors.onAccent},
 badgeMuted:{backgroundColor:colors.neutral,color:colors.onNeutral},
 badgeExpired:{backgroundColor:colors.dangerSoft,color:colors.danger,borderColor:colors.danger},
 empty:{backgroundColor:colors.surface,borderRadius:24,padding:22,gap:10},
 sectionTitle:{fontSize:20,lineHeight:26,fontWeight:'700',color:colors.text},
 refresh:{minHeight:48,justifyContent:'center',alignItems:'center',paddingVertical:13,paddingHorizontal:16,alignSelf:'flex-start',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderStrong,borderRadius:14},
 refreshText:{color:colors.link,fontSize:14,fontWeight:'600'},
 info:{backgroundColor:colors.surface,borderRadius:18,padding:16,gap:8},
}));
