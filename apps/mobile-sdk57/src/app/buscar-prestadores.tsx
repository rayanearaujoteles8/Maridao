import { useRef, useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, styles } from '@/components/access-screen';
import { useSession } from '@/components/session';
import { api, ApiError } from '@/lib/api';
type Provider={id:string;name:string;categories:string[];specialties:string[];neighborhoods:string[];availability:string;city:string;state:string};
export default function SearchScreen(){
 const {session,setSession}=useSession();
 const [category,setCategory]=useState(''),[neighborhood,setNeighborhood]=useState('');
 const [providers,setProviders]=useState<Provider[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('Informe os filtros desejados ou toque em Buscar para ver os prestadores cadastrados.');
 const [page,setPage]=useState(1),[more,setMore]=useState(false),[expanded,setExpanded]=useState<string|null>(null);
 const filters=useRef({category:'',neighborhood:''});const pending=useRef(false);
 if(!session)return <Redirect href="/entrar"/>;
 async function search(nextPage=1){
  if(pending.current||!session)return;
  pending.current=true;setBusy(true);Keyboard.dismiss();setMessage('');
  if(nextPage===1){filters.current={category,neighborhood};setProviders([]);setMore(false);setExpanded(null);}
  try{
   const query=new URLSearchParams({...filters.current,page:String(nextPage)});
   const result=await api('/providers?'+query.toString(),{headers:{Authorization:`Bearer ${session.token}`}});
   setProviders(old=>nextPage===1?result.providers:[...old,...result.providers]);setPage(nextPage);setMore(result.hasMore);
   if(!result.providers.length&&nextPage===1)setMessage('Nenhum prestador encontrado para esses filtros.');
  }catch(error){
   if(error instanceof ApiError&&error.status===401)setSession(null);
   else setMessage(error instanceof Error?error.message:'Não foi possível buscar prestadores.');
  }finally{pending.current=false;setBusy(false);}
 }
 return <SafeAreaView style={styles.safe}><ScrollView style={{flex:1}} contentContainerStyle={[styles.page,{paddingBottom:64}]} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'}>
  <Link href="/minha-conta" style={styles.back}>← Minha conta</Link>
  <Text accessibilityRole="header" style={styles.title}>Encontre um prestador</Text><Text style={styles.description}>Serviços em Palmas – TO</Text>
  <View style={s.group}><Text style={s.label}>Categoria de serviço</Text><TextInput accessibilityLabel="Categoria de serviço" style={s.input} placeholder="Ex.: montagem de móveis" value={category} onChangeText={setCategory} maxLength={100} editable={!busy}/></View>
  <View style={s.group}><Text style={s.label}>Bairro</Text><TextInput accessibilityLabel="Bairro" style={s.input} placeholder="Em qual bairro precisa de atendimento?" value={neighborhood} onChangeText={setNeighborhood} maxLength={100} editable={!busy}/></View>
  <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} style={s.button} onPress={()=>search()}><Text style={s.buttonText}>{busy?'Buscando…':'Buscar prestadores'}</Text></Pressable>
  {message?<Text accessibilityRole="alert" style={styles.note}>{message}</Text>:null}
  {providers.map(provider=><View key={provider.id} style={styles.card}><Text style={styles.cardTitle}>{provider.name}</Text><Text style={styles.field}>{provider.categories.join(' · ')}</Text><Text style={styles.note}>{provider.neighborhoods.join(', ')} · {provider.city} – {provider.state}</Text><Pressable accessibilityRole="button" accessibilityState={{expanded:expanded===provider.id}} style={s.toggle} onPress={()=>setExpanded(old=>old===provider.id?null:provider.id)}><Text style={s.label}>{expanded===provider.id?'Fechar perfil':'Ver perfil profissional'}</Text></Pressable>{expanded===provider.id?<><Text style={s.label}>Especialidades</Text><Text style={styles.field}>{provider.specialties.join(', ')}</Text><Text style={s.label}>Disponibilidade informada</Text><Text style={styles.field}>{provider.availability}</Text><Text style={styles.note}>As avaliações estarão disponíveis após a implementação dos atendimentos e avaliações.</Text></>:null}</View>)}
  {more?<Pressable accessibilityRole="button" disabled={busy} style={s.toggle} onPress={()=>search(page+1)}><Text style={s.label}>{busy?'Carregando…':'Ver mais prestadores'}</Text></Pressable>:null}
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({group:{gap:8},label:{fontSize:16,fontWeight:'600',color:colors.black},input:{borderWidth:1,borderColor:'#64705C',borderRadius:14,minHeight:54,padding:16,fontSize:17,color:colors.black},button:{backgroundColor:colors.black,minHeight:56,padding:18,borderRadius:16,alignItems:'center'},buttonText:{color:colors.white,fontSize:17,fontWeight:'700'},toggle:{minHeight:48,justifyContent:'center'}});
