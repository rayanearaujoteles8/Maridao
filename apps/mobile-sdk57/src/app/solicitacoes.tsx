import { useCallback, useRef, useState } from 'react';
import { Link, Redirect, useFocusEffect, router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, styles } from '@/components/access-screen';
import { useSession } from '@/components/session';
import { api, ApiError } from '@/lib/api';

type RequestItem={id:string;category:string;description:string;neighborhood:string;neighborhood_label?:string;city:string;state:string;preferred_date:string|null;preferred_period:string|null;status:string;created_at:string};
type Result={requests:RequestItem[];page:number;hasMore:boolean;role:'customer'|'provider'};
export default function RequestsScreen(){
 const {session,setSession}=useSession();
 const [items,setItems]=useState<RequestItem[]>([]),[role,setRole]=useState<Result['role']|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[page,setPage]=useState(1),[more,setMore]=useState(false);
 const [expanded,setExpanded]=useState<string|null>(null);
 const generation=useRef(0),pending=useRef(false);
 const load=useCallback(async(nextPage=1)=>{
  if(!session||pending.current)return;
  const run=generation.current;pending.current=true;setBusy(true);setError('');
  try{
   const result:Result=await api(`/requests?page=${nextPage}`,{headers:{Authorization:`Bearer ${session.token}`}});
   if(run!==generation.current)return;
   setItems(old=>nextPage===1?result.requests:[...old,...result.requests.filter(item=>!old.some(previous=>previous.id===item.id))]);
   setRole(result.role);setPage(result.page);setMore(result.hasMore);
  }catch(failure){
   if(run!==generation.current)return;
   if(failure instanceof ApiError&&failure.status===401)setSession(null);
   else setError(failure instanceof Error?failure.message:'Não foi possível carregar as solicitações.');
  }finally{if(run===generation.current){pending.current=false;setBusy(false);}}
 },[session,setSession]);
 useFocusEffect(useCallback(()=>{
  generation.current++;pending.current=false;setItems([]);setRole(null);setExpanded(null);setMore(false);setPage(1);
  void load();
  return()=>{generation.current++;pending.current=false;};
 },[load]));
 if(!session)return <Redirect href="/entrar"/>;
 return <SafeAreaView style={styles.safe}><FlatList data={items} keyExtractor={item=>item.id} contentContainerStyle={styles.page}
  ListHeaderComponent={<View style={s.section}><Link href="/minha-conta" style={styles.back}>‹ Voltar à minha conta</Link><Text accessibilityRole="header" style={styles.title}>{role==='provider'?'Solicitações e propostas':role==='customer'?'Minhas solicitações':'Solicitações'}</Text>{role?<Text style={styles.description}>{role==='provider'?'Pedidos disponíveis e solicitações para as quais você enviou propostas.':'Acompanhe os pedidos que você publicou.'}</Text>:null}<Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} style={[s.button,busy&&s.disabled]} onPress={()=>load()}><Text style={s.buttonText}>{busy?'Carregando…':'Atualizar solicitações'}</Text></Pressable>{error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}</View>}
  ListEmptyComponent={!busy&&!error?<Text style={styles.description}>{role==='provider'?'Ainda não há pedidos compatíveis ou propostas enviadas.':'Você ainda não publicou nenhuma solicitação.'}</Text>:null}
  renderItem={({item})=><View style={styles.card}><Text style={styles.cardTitle}>{item.category}</Text><Text style={s.status}>{item.status}</Text><Text style={styles.field}>{item.neighborhood_label??item.neighborhood} · {item.city} – {item.state}</Text><Text numberOfLines={expanded===item.id?undefined:2} style={styles.description}>{item.description}</Text><Pressable accessibilityRole="button" accessibilityState={{expanded:expanded===item.id}} style={s.details} onPress={()=>setExpanded(old=>old===item.id?null:item.id)}><Text style={s.label}>{expanded===item.id?'Fechar detalhes':'Ver detalhes'}</Text></Pressable>{expanded===item.id?<View style={s.section}><Text style={s.label}>Preferência de atendimento</Text><Text style={styles.field}>{item.preferred_date?item.preferred_date.split('-').reverse().join('/'):'Sem data definida'}{item.preferred_period?` · ${item.preferred_period}`:''}</Text><Text style={styles.note}>A data é uma preferência, sujeita à combinação com o prestador.</Text><Pressable accessibilityRole="button" style={s.button} onPress={()=>router.push({pathname:'./propostas',params:{id:item.id}})}><Text style={s.buttonText}>{role==='provider'?'Ver / enviar proposta':'Ver propostas'}</Text></Pressable></View>:null}</View>}
  ListFooterComponent={more?<Pressable accessibilityRole="button" disabled={busy} style={s.button} onPress={()=>load(page+1)}><Text style={s.buttonText}>{busy?'Carregando…':'Carregar mais'}</Text></Pressable>:null}
 /></SafeAreaView>;
}
const s=StyleSheet.create({section:{gap:16},button:{backgroundColor:colors.black,minHeight:56,padding:18,borderRadius:16,alignItems:'center'},buttonText:{color:colors.white,fontSize:17,fontWeight:'700'},disabled:{opacity:0.6},error:{color:'#A32121',fontSize:16,lineHeight:24},label:{fontSize:16,fontWeight:'600',color:colors.black},status:{alignSelf:'flex-start',backgroundColor:colors.pale,color:colors.black,paddingHorizontal:12,paddingVertical:6,borderRadius:12,fontWeight:'600'},details:{minHeight:44,justifyContent:'center'}});
