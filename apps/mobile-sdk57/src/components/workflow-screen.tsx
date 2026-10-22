import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from './access-screen';

export function WorkflowHeading({eyebrow,title,description}:{eyebrow:string;title:string;description:string}){
 return <View style={flow.heading}>
  <View style={flow.headingTop}><Image source={require('../../assets/brand/logotipo-preto.png')} style={flow.logo} resizeMode="contain" accessibilityLabel="Maridão"/><Text accessible={false} style={flow.spark}>✦</Text></View>
  <Text style={flow.eyebrow}>{eyebrow}</Text>
  <Text accessibilityRole="header" style={flow.title}>{title}</Text>
  <Text style={flow.subtitle}>{description}</Text>
 </View>;
}
export function StatusBadge({status}:{status:string}){
 const dark=status==='Concluída'||status==='Aceita';
 const muted=['Cancelada','Retirada','Não selecionada','Validade encerrada'].includes(status);
 return <Text style={[flow.badge,dark&&flow.badgeDark,muted&&flow.badgeMuted]}>{status}</Text>;
}
export const flow=StyleSheet.create({
 page:{paddingHorizontal:22,paddingTop:8,paddingBottom:48,gap:18,width:'100%',maxWidth:520,alignSelf:'center',flexGrow:1},
 back:{minHeight:44,paddingVertical:12,fontSize:14,fontWeight:'600',color:'#43552E'},
 heading:{backgroundColor:colors.green,padding:22,borderRadius:28,gap:10},
 headingTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:10},
 logo:{width:136,height:38},spark:{fontSize:28,color:colors.black},
 eyebrow:{fontSize:10,letterSpacing:1.2,fontWeight:'700',color:'#30451C'},
 title:{fontSize:32,lineHeight:37,letterSpacing:-0.8,fontWeight:'800',color:colors.black},
 subtitle:{fontSize:14,lineHeight:21,color:'#30451C'},
 card:{backgroundColor:colors.white,borderWidth:1,borderColor:'#DEE6D6',borderRadius:24,padding:20,gap:12},
 acceptedCard:{borderColor:colors.black,borderWidth:2},
 row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:10},
 cardTitle:{fontSize:20,lineHeight:26,fontWeight:'700',letterSpacing:-0.3,color:colors.black,flexShrink:1},
 description:{fontSize:15,lineHeight:23,color:'#38402E'},
 field:{fontSize:14,lineHeight:21,color:'#526047'},
 note:{fontSize:12,lineHeight:19,color:'#526047'},
 badge:{alignSelf:'flex-start',backgroundColor:colors.pale,color:colors.black,borderRadius:12,paddingHorizontal:12,paddingVertical:7,fontSize:12,fontWeight:'700',overflow:'hidden'},
 badgeDark:{backgroundColor:colors.black,color:colors.green},
 badgeMuted:{backgroundColor:'#EFF1EC',color:'#535D4A'},
 empty:{backgroundColor:'#F3F6EF',borderRadius:24,padding:22,gap:10},
 sectionTitle:{fontSize:20,lineHeight:26,fontWeight:'700',color:colors.black},
 refresh:{minHeight:46,justifyContent:'center',paddingVertical:12,paddingHorizontal:4,alignSelf:'flex-start'},
 refreshText:{color:'#43552E',fontSize:14,fontWeight:'600',textDecorationLine:'underline'},
 info:{backgroundColor:'#F3F6EF',borderRadius:18,padding:16,gap:8},
});
