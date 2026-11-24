import {Redirect,router} from 'expo-router';
import { PressableScale } from '@/components/pressable-scale';
import {Image,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSession} from '@/components/session';
import {ThemeToggle} from '@/components/theme-toggle';
import {usePrivateResource,useLogout,Feedback} from '@/components/private-screen';
import {usePullRefresh} from '@/components/pull-refresh';
import {Skeleton} from '@/components/skeleton';
import { themed } from '@/theme';

type Me={user:{name:string;email:string;role:string}};
type Pending={providers:{id:string}[];hasMore:boolean};
const create=[
 {href:'/admin/cadastrar-cliente',title:'Cliente',description:'Conta de quem pede serviços.'},
 {href:'/admin/cadastrar-prestador',title:'Prestador',description:'Já entra aprovado, sem análise.'},
 {href:'/admin/cadastrar-administrador',title:'Administrador',description:'Acesso a esta área.'},
] as const;
// Início da área administrativa: o bloco preto mostra o que pede atenção (cadastros em análise); abaixo, os atalhos.
export default function AdminHome(){
 const s=useS();
 const {session}=useSession();
 const me=usePrivateResource<Me>('/auth/me'),pending=usePrivateResource<Pending>('/admin/providers/pending'),exit=useLogout();
 const pull=usePullRefresh(()=>Promise.all([me.refresh(),pending.refresh()]));
 if(!session)return <Redirect href="/entrar"/>;
 const firstName=me.data?.user.name.trim().split(/\s+/)[0];
 const count=pending.data?pending.data.providers.length:null;
 const countText=count===null?'—':String(count)+(pending.data?.hasMore?'+':'');
 const countLabel=count===1&&!pending.data?.hasMore?'cadastro em análise':'cadastros em análise';
 return <SafeAreaView style={s.safe}><ScrollView {...pull.props} showsVerticalScrollIndicator={false} contentContainerStyle={s.page}>
  <View style={s.header}>
   <Image source={require('../../../assets/brand/logotipo-preto.png')} style={s.logo} resizeMode="contain" accessibilityLabel="Maridão"/>
   <View style={s.headerEnd}><View style={s.accountTag}><View style={s.avatar} accessible={false}><Text style={s.initial}>{firstName?.slice(0,1).toLocaleUpperCase('pt-BR')??'A'}</Text></View><Text style={s.accountLabel}>ADMINISTRAÇÃO</Text></View><ThemeToggle/></View>
  </View>
  <View style={s.greeting}>
   <Text style={s.eyebrow}>ÁREA ADMINISTRATIVA</Text>
   <Text accessibilityRole="header" style={s.title}>{firstName?'Olá, '+firstName+'.':'Olá!'}</Text>
   <Text style={s.helper}>Contas, cadastros e aprovações do Maridão em Palmas – TO.</Text>
  </View>
  <Feedback busy={false} error={me.error||pending.error||exit.error} message=""/>
  <View style={s.hero}>
   <View style={s.heroTop}><Text style={s.heroTag}>{count?'PEDE SUA ATENÇÃO':'CADASTROS DE PRESTADORES'}</Text><Text accessible={false} style={s.spark}>✦</Text></View>
   <View accessible accessibilityLabel={count===null?'Carregando cadastros em análise':`${countText} ${countLabel}`} style={s.countRow}>{count===null&&!pending.error?<Skeleton shape="block"/>:<Text style={s.count}>{countText}</Text>}<Text style={s.countLabel}>{countLabel}</Text></View>
   <Text style={s.heroDescription}>{count===null?(pending.error?'Não foi possível conferir os cadastros agora.':'Prestadores aguardando sua decisão aparecem aqui.'):count?'Prestadores aguardando sua decisão para aparecer nas buscas e enviar propostas.':'Tudo em dia. Novos cadastros de prestadores aparecem aqui para você aprovar ou rejeitar.'}</Text>
   <PressableScale accessibilityRole="button" accessibilityLabel="Cadastros em análise. Abrir lista." onPress={()=>router.push('/admin/cadastros-em-analise')} style={s.heroButton}><Text style={s.heroButtonText}>{count?'Analisar cadastros':'Ver cadastros em análise'}</Text><Text accessible={false} style={s.arrow}>↗</Text></PressableScale>
  </View>
  <PressableScale accessibilityRole="button" accessibilityLabel="Usuários. Consultar e gerenciar clientes e prestadores." onPress={()=>router.push('/admin/usuarios')} scaleTo={0.98} style={s.users}>
   <View style={s.usersText}><Text style={s.cardTitle}>Usuários</Text><Text style={s.cardDescription}>Consulte clientes e prestadores, edite, inative ou exclua contas.</Text></View><Text accessible={false} style={s.arrow}>↗</Text>
  </PressableScale>
  <View style={s.section}>
   <Text accessibilityRole="header" style={s.sectionTitle}>Cadastrar</Text>
   {create.map(item=><PressableScale key={item.href} accessibilityRole="button" accessibilityLabel={`Cadastrar ${item.title.toLocaleLowerCase('pt-BR')}. ${item.description}`} onPress={()=>router.push(item.href)} scaleTo={0.98} style={s.row}>
    <Text accessible={false} style={s.plus}>+</Text><View style={s.usersText}><Text style={s.rowTitle}>{item.title}</Text><Text style={s.helper}>{item.description}</Text></View><Text accessible={false} style={s.rowArrow}>↗</Text>
   </PressableScale>)}
  </View>
  <View style={s.footer}><Text style={s.footerText}>{me.data?.user.email??''}</Text><Pressable accessibilityRole="button" disabled={exit.busy} accessibilityState={{disabled:exit.busy,busy:exit.busy}} onPress={()=>void exit.logout()} style={s.logout}><Text style={s.logoutText}>{exit.busy?'Saindo…':'Sair da conta'}</Text></Pressable></View>
 </ScrollView></SafeAreaView>;
}
const useS = themed(colors => StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.bg},
 page:{paddingHorizontal:22,paddingTop:12,paddingBottom:24,gap:22,width:'100%',maxWidth:520,alignSelf:'center'},
 header:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:12},
 logo:{width:146,height:44,tintColor:colors.text},
 headerEnd:{flexDirection:'row',alignItems:'center',gap:12},
 accountTag:{flexDirection:'row',alignItems:'center',gap:8},
 avatar:{width:36,height:36,borderRadius:18,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'},
 initial:{fontWeight:'700',fontSize:17,color:colors.onAccentSoft},
 accountLabel:{fontSize:9,letterSpacing:0.8,fontWeight:'700',color:colors.textMuted},
 greeting:{gap:8},
 eyebrow:{fontSize:10,fontWeight:'700',letterSpacing:1.2,color:colors.textMuted},
 title:{fontSize:36,lineHeight:42,fontWeight:'800',letterSpacing:-1.2,color:colors.text},
 helper:{fontSize:13,lineHeight:20,color:colors.textMuted},
 hero:{backgroundColor:colors.ink,padding:22,borderRadius:28,gap:13,borderWidth:1,borderColor:colors.inkBorder},
 heroTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
 heroTag:{fontSize:9,fontWeight:'700',letterSpacing:1,color:colors.onInkAccent,flexShrink:1},
 spark:{fontSize:24,color:colors.onInkAccent,lineHeight:27},
 countRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',gap:10,minHeight:60},
 count:{fontSize:56,lineHeight:60,fontWeight:'800',letterSpacing:-2,color:colors.onInk},
 countLabel:{fontSize:18,lineHeight:24,fontWeight:'700',color:colors.onInk,flexShrink:1},
 heroDescription:{fontSize:13,lineHeight:19,maxWidth:300,color:colors.onInkSoft},
 heroButton:{backgroundColor:colors.accent,minHeight:52,borderRadius:18,paddingHorizontal:18,paddingVertical:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12,marginTop:3},
 heroButtonText:{color:colors.onAccent,fontSize:16,fontWeight:'700',flexShrink:1},
 arrow:{fontSize:23,color:colors.onAccent},
 users:{backgroundColor:colors.accentSoft,borderRadius:24,padding:20,flexDirection:'row',alignItems:'center',gap:14},
 usersText:{flex:1,gap:4},
 cardTitle:{fontSize:21,lineHeight:25,letterSpacing:-0.5,fontWeight:'700',color:colors.onAccentSoft},
 cardDescription:{fontSize:13,lineHeight:19,color:colors.onAccentSoftMuted},
 section:{gap:10},
 sectionTitle:{fontSize:20,fontWeight:'700',letterSpacing:-0.5,color:colors.text},
 row:{minHeight:72,borderWidth:1,borderColor:colors.border,borderRadius:20,padding:16,flexDirection:'row',alignItems:'center',gap:14},
 plus:{width:36,height:36,borderRadius:18,backgroundColor:colors.surface,textAlign:'center',lineHeight:36,fontSize:20,fontWeight:'600',color:colors.text,overflow:'hidden'},
 rowTitle:{fontSize:17,lineHeight:23,fontWeight:'600',color:colors.text},
 rowArrow:{fontSize:20,color:colors.textMuted},
 footer:{alignItems:'center',gap:2},
 footerText:{fontSize:11,lineHeight:17,textAlign:'center',color:colors.textMuted},
 logout:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderStrong,borderRadius:14,minHeight:48,paddingHorizontal:16,paddingVertical:12},
 logoutText:{fontSize:12,color:colors.textMuted,fontWeight:'600'},
 pressed:{opacity:0.75},
}));
