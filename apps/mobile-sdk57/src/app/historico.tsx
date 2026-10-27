import {useCallback,useRef,useState} from 'react';
import {Link,Redirect,router,useFocusEffect} from 'expo-router';
import {FlatList,Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSession} from '@/components/session';
import {api,ApiError} from '@/lib/api';
import {colors} from '@/components/access-screen';
import {WorkflowHeading,StatusBadge,flow} from '@/components/workflow-screen';

type Entry={id:string;category:string;description:string;neighborhood:string;neighborhood_label?:string;status:string;created_at:string;started_at:string|null;completed_at:string|null;proposal_id:string|null;proposal_amount:string|null;proposal_status:string|null;proposal_created_at:string|null;proposal_updated_at:string|null;withdrawn_at:string|null};
type Result={requests:Entry[];role:'customer'|'provider';page:number;hasMore:boolean};
const date=(value:string)=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Araguaina'}).format(new Date(value));
export default function HistoryScreen(){
 const {session,setSession}=useSession();
 const [data,setData]=useState<Result|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const pending=useRef(false),generation=useRef(0),failedPage=useRef(1);
 const load=useCallback(async(page=1)=>{
  if(!session||pending.current)return;
  const run=generation.current;pending.current=true;failedPage.current=page;setBusy(true);setError('');
  try{
   const result:Result=await api(`/requests/history?page=${page}`,{headers:{Authorization:`Bearer ${session.token}`}});
   if(run!==generation.current)return;
   setData(old=>page===1||!old?result:{...result,requests:[...old.requests,...result.requests.filter(item=>!old.requests.some(previous=>previous.id===item.id))]});
  }catch(failure){if(run!==generation.current)return;if(failure instanceof ApiError&&failure.status===401)setSession(null);else setError(failure instanceof Error?failure.message:'Não foi possível carregar o histórico.');}
  finally{if(run===generation.current){pending.current=false;setBusy(false);}}
 },[session,setSession]);
 useFocusEffect(useCallback(()=>{
  generation.current++;pending.current=false;setData(null);void load();
  return()=>{generation.current++;pending.current=false;};
 },[load]));
 if(!session)return <Redirect href="/entrar"/>;
 return <SafeAreaView style={s.safe}><FlatList
  data={data?.requests??[]} keyExtractor={item=>item.id} contentContainerStyle={flow.page}
  ItemSeparatorComponent={()=><View style={{height:18}}/>}
  ListHeaderComponent={<View style={s.section}>
   <Link href="./minha-conta" style={flow.back}>‹ Início</Link>
   <WorkflowHeading eyebrow="CADA SERVIÇO CONTA UMA HISTÓRIA" title="Meu histórico" description={data?.role==='provider'?'Suas propostas e atendimentos, incluindo retiradas e pedidos encerrados.':'Seus pedidos e atendimentos, incluindo os cancelados.'}/>
   <Text style={flow.note}>Do mais recente para o mais antigo. Datas no horário de Palmas.</Text>
   <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} style={flow.refresh} onPress={()=>load()}><Text style={flow.refreshText}>{busy?'Carregando histórico…':'Atualizar histórico ↻'}</Text></Pressable>
   {error?<View style={flow.empty}><Text accessibilityRole="alert" style={s.error}>{error}</Text><Pressable accessibilityRole="button" disabled={busy} style={flow.refresh} onPress={()=>load(failedPage.current)}><Text style={flow.refreshText}>Tentar novamente</Text></Pressable></View>:null}
  </View>}
  ListEmptyComponent={!busy&&!error?<View style={flow.empty}><Text style={flow.cardTitle}>Seu histórico começa por aqui.</Text><Text style={flow.description}>{data?.role==='provider'?'Quando você enviar uma proposta, o pedido aparecerá neste espaço.':'Os pedidos que você publicar aparecerão neste espaço.'}</Text></View>:undefined}
  renderItem={({item})=><View style={flow.card}>
   <View style={flow.row}><StatusBadge status={item.status}/><Text style={flow.note}>{date(item.created_at)}</Text></View>
   <Text accessibilityRole="header" style={flow.cardTitle}>{item.category}</Text>
   <Text style={flow.field}>{item.neighborhood_label??item.neighborhood}</Text>
   <Text numberOfLines={3} style={flow.description}>{item.description}</Text>
   {item.proposal_status?<View style={flow.info}><Text style={flow.note}>{data?.role==='provider'?'Sua proposta':'Proposta escolhida'}</Text><StatusBadge status={item.proposal_status}/>{item.proposal_amount?<Text style={s.amount}>{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(item.proposal_amount))}</Text>:null}{item.withdrawn_at?<Text style={flow.note}>Retirada em {date(item.withdrawn_at)}</Text>:null}</View>:null}
   {item.started_at?<Text style={flow.field}>Início: {date(item.started_at)}</Text>:null}
   {item.completed_at?<Text style={flow.field}>Conclusão: {date(item.completed_at)}</Text>:null}
   <Pressable accessibilityRole="button" accessibilityLabel={`Ver detalhes de ${item.category}`} style={s.button} onPress={()=>router.push({pathname:'./propostas',params:{id:item.id,from:'history'}})}><Text style={s.buttonText}>Ver detalhes e propostas ↗</Text></Pressable>
  </View>}
  ListFooterComponent={data?.hasMore?<Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} style={s.button} onPress={()=>load(data.page+1)}><Text style={s.buttonText}>{busy?'Carregando…':'Carregar mais registros'}</Text></Pressable>:undefined}
 /></SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.white},section:{gap:14,marginBottom:18},error:{color:'#A32121',fontSize:15,lineHeight:22},amount:{fontSize:24,fontWeight:'800',color:colors.black},button:{minHeight:52,padding:16,borderRadius:16,backgroundColor:colors.black,alignItems:'center',justifyContent:'center'},buttonText:{color:colors.white,fontSize:15,fontWeight:'700'}});
