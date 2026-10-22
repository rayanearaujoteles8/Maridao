import { useCallback, useRef, useState } from 'react';
import { Link, Redirect, useFocusEffect, router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, styles } from '@/components/access-screen';
import { WorkflowHeading, StatusBadge, flow } from '@/components/workflow-screen';
import { useSession } from '@/components/session';
import { api, ApiError } from '@/lib/api';
import {ServiceProgressActions,type ServiceProgress} from '@/components/service-progress';

type RequestItem=ServiceProgress & {id:string;category:string;description:string;neighborhood:string;neighborhood_label?:string;city:string;state:string;preferred_date:string|null;preferred_period:string|null;status:string;created_at:string};
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
 return <SafeAreaView style={styles.safe}><FlatList data={items} keyExtractor={item=>item.id} contentContainerStyle={flow.page}
  ListHeaderComponent={<View style={s.section}>
   <Link href="/minha-conta" style={flow.back}>‹ Minha conta</Link>
   <WorkflowHeading eyebrow={role==='provider'?'OPORTUNIDADES E PROPOSTAS':'SEUS SERVIÇOS, EM UM SÓ LUGAR'} title={role==='provider'?'Vamos ao próximo serviço?':role==='customer'?'Meus pedidos':'Solicitações'} description={role==='provider'?'Consulte pedidos da sua região e acompanhe as propostas que enviou.':'Veja suas solicitações, compare propostas e acompanhe cada atendimento.'}/>
   <View style={flow.row}><Text accessibilityRole="header" style={flow.sectionTitle}>Solicitações</Text><Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} style={flow.refresh} onPress={()=>load()}><Text style={flow.refreshText}>{busy?'Carregando…':'Atualizar ↻'}</Text></Pressable></View>
   {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
  </View>}
  ListEmptyComponent={!busy&&!error?<View style={flow.empty}><Text style={flow.cardTitle}>{role==='provider'?'As oportunidades aparecem por aqui.':'Seu próximo serviço começa aqui.'}</Text><Text style={flow.description}>{role==='provider'?'Ainda não há pedidos compatíveis ou propostas enviadas. Consulte novamente em outro momento.':'Você ainda não publicou nenhuma solicitação.'}</Text>{role==='customer'?<Pressable accessibilityRole="button" style={s.button} onPress={()=>router.push('./nova-solicitacao')}><Text style={s.buttonText}>Pedir um serviço ↗</Text></Pressable>:null}</View>:null}
  renderItem={({item})=><View style={flow.card}>
   <View style={flow.row}><StatusBadge status={item.status}/><Text style={flow.note}>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Araguaina'}).format(new Date(item.created_at))}</Text></View>
   <Text accessibilityRole="header" style={flow.cardTitle}>{item.category}</Text>
   <Text style={flow.field}>{item.neighborhood_label??item.neighborhood} · {item.city} – {item.state}</Text>
   <Text numberOfLines={expanded===item.id?undefined:2} style={flow.description}>{item.description}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel={(expanded===item.id?'Fechar detalhes de ':'Ver detalhes de ')+item.category} accessibilityState={{expanded:expanded===item.id}} style={s.details} onPress={()=>setExpanded(old=>old===item.id?null:item.id)}><Text style={s.label}>{expanded===item.id?'Menos detalhes −':'Mais detalhes +'}</Text></Pressable>
   {expanded===item.id?<View style={flow.info}><Text style={s.label}>Preferência de atendimento</Text><Text style={flow.field}>{item.preferred_date?item.preferred_date.split('-').reverse().join('/'):'Sem data definida'}{item.preferred_period?` · ${item.preferred_period}`:''}</Text><Text style={flow.note}>A data é uma preferência, sujeita à combinação com o prestador.</Text><ServiceProgressActions request={item} disabled={busy} onUpdated={updated=>setItems(old=>old.map(entry=>entry.id===updated.id?{...entry,...updated}:entry))}/></View>:null}
   <Pressable accessibilityRole="button" accessibilityLabel={(role==='provider'&&item.status==='Aberta'?'Ver ou enviar proposta para ':'Ver propostas de ')+item.category} style={s.button} onPress={()=>router.push({pathname:'./propostas',params:{id:item.id}})}><Text style={s.buttonText}>{role==='provider'&&item.status==='Aberta'?'Ver / enviar proposta ↗':'Ver propostas ↗'}</Text></Pressable>
  </View>}
  ListFooterComponent={more?<Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} style={[s.button,busy&&s.disabled]} onPress={()=>load(page+1)}><Text style={s.buttonText}>{busy?'Carregando…':'Carregar mais'}</Text></Pressable>:null}
 /></SafeAreaView>;
}

const s=StyleSheet.create({section:{gap:16},button:{backgroundColor:colors.black,minHeight:56,padding:18,borderRadius:16,alignItems:'center'},buttonText:{color:colors.white,fontSize:17,fontWeight:'700'},disabled:{opacity:0.6},error:{color:'#A32121',fontSize:16,lineHeight:24},label:{fontSize:16,fontWeight:'600',color:colors.black},status:{alignSelf:'flex-start',backgroundColor:colors.pale,color:colors.black,paddingHorizontal:12,paddingVertical:6,borderRadius:12,fontWeight:'600'},details:{minHeight:44,justifyContent:'center'}});
