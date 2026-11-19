import {useCallback,useRef,useState} from 'react';
import { PressableScale } from '@/components/pressable-scale';
import {Redirect,router,useFocusEffect} from 'expo-router';
import {FlatList,Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSession} from '@/components/session';
import {api,ApiError} from '@/lib/api';
import { BackButton } from '@/components/back-button';
import {WorkflowHeading,StatusBadge,useFlow} from '@/components/workflow-screen';
import {CancellationNote,type Cancellation} from '@/components/cancellation';
import {AttentionSeal,AWAITING,confirmedBy,type CompletionInfo} from '@/components/completion';
import {VersionsLink} from '@/components/proposal-versions';
import {RemovedNote,type CustomerRemoved} from '@/components/removed-user';
import {usePullRefresh} from '@/components/pull-refresh';
import { ListEntrance, StaggerItem } from '@/components/list-entrance';
import { Skeleton } from '@/components/skeleton';
import { themed } from '@/theme';

type Entry={id:string;category:string;description:string;neighborhood:string;neighborhood_label?:string;status:string;created_at:string;started_at:string|null;completed_at:string|null;proposal_id:string|null;proposal_amount:string|null;proposal_status:string|null;proposal_created_at:string|null;proposal_updated_at:string|null;withdrawn_at:string|null;proposal_version?:number|null;proposal_versions_count?:number|null;proposal_has_previous_versions?:boolean|null;cancellation?:Cancellation|null}&CompletionInfo&CustomerRemoved;
type Result={requests:Entry[];role:'customer'|'provider';page:number;hasMore:boolean};
const date=(value:string)=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Araguaina'}).format(new Date(value));
export default function HistoryScreen(){
 const s=useS();const flow=useFlow();
 const {session,setSession}=useSession();
 const [data,setData]=useState<Result|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const pending=useRef(false),generation=useRef(0),failedPage=useRef(1);
 // quiet: recarga do gesto de puxar; não liga o `busy` (sem "Carregando…" nem botões travados) e a lista fica na tela.
 const load=useCallback(async(page=1,quiet=false)=>{
  if(!session||pending.current)return;
  const run=generation.current;pending.current=true;failedPage.current=page;if(!quiet)setBusy(true);setError('');
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
 const pull=usePullRefresh(useCallback(()=>load(1,true),[load]));
 if(!session)return <Redirect href="/entrar"/>;
 return <SafeAreaView style={s.safe}><ListEntrance ready={!!data}><FlatList {...pull.props}
  data={data?.requests??[]} keyExtractor={item=>item.id} contentContainerStyle={flow.page}
  ItemSeparatorComponent={()=><View style={{height:18}}/>}
  ListHeaderComponent={<View style={s.section}>
   <BackButton href="/minha-conta" label="Início" />
   <WorkflowHeading eyebrow="CADA SERVIÇO CONTA UMA HISTÓRIA" title="Meu histórico" description={data?.role==='provider'?'Suas propostas e atendimentos, incluindo retiradas e pedidos encerrados.':'Seus pedidos e atendimentos, incluindo os cancelados.'}/>
   <Text style={flow.note}>Do mais recente para o mais antigo. Datas no horário de Palmas.</Text>
   {error?<View style={flow.empty}><Text accessibilityRole="alert" style={s.error}>{error}</Text><Pressable accessibilityRole="button" disabled={busy} style={flow.refresh} onPress={()=>load(failedPage.current)}><Text style={flow.refreshText}>Tentar novamente</Text></Pressable></View>:null}
  </View>}
  ListEmptyComponent={busy&&!data?<Skeleton shape="cards"/>:!busy&&!error?<View style={flow.empty}><Text style={flow.cardTitle}>Seu histórico começa por aqui.</Text><Text style={flow.description}>{data?.role==='provider'?'Quando você enviar uma proposta, o pedido aparecerá neste espaço.':'Os pedidos que você publicar aparecerão neste espaço.'}</Text></View>:undefined}
  renderItem={({item,index})=><StaggerItem index={index}><View style={flow.card}>
   <View style={flow.row}><StatusBadge status={item.status}/><Text style={flow.note}>{date(item.created_at)}</Text></View>
   {data?.role==='customer'&&item.status===AWAITING?<AttentionSeal label="Confirme a conclusão"/>:null}
   <Text accessibilityRole="header" style={flow.cardTitle}>{item.category}</Text>
   <Text style={flow.field}>{item.neighborhood_label??item.neighborhood}</Text>
   <RemovedNote removed={item.customer_removed} name={item.customer_name}/>
   <Text numberOfLines={3} style={flow.description}>{item.description}</Text>
   {item.proposal_status?<View style={flow.info}><Text style={flow.note}>{data?.role==='provider'?'Sua proposta':'Proposta escolhida'}</Text><View style={s.statusRow}><StatusBadge status={item.proposal_status}/>{(item.proposal_version??1)>1?<Text style={flow.note}>Versão {item.proposal_version}</Text>:null}</View>{item.proposal_amount?<Text style={s.amount}>{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(item.proposal_amount))}</Text>:null}{item.withdrawn_at?<Text style={flow.note}>Retirada em {date(item.withdrawn_at)}</Text>:null}{item.proposal_id&&item.proposal_has_previous_versions?<VersionsLink requestId={item.id} proposalId={item.proposal_id} count={item.proposal_versions_count} from="historyList"/>:null}</View>:null}
   {item.status==='Cancelada'?<CancellationNote cancellation={item.cancellation}/>:null}
   {item.started_at?<Text style={flow.field}>Início: {date(item.started_at)}</Text>:null}
   {item.status===AWAITING&&item.completion_reported_at?<Text style={flow.field}>Conclusão registrada pelo prestador: {date(item.completion_reported_at)}</Text>:null}
   {item.status===AWAITING&&item.completion_deadline_at?<Text style={flow.field}>{data?.role==='customer'?'Confirme ou conteste até':'Aguardando a confirmação do cliente até'}: {date(item.completion_deadline_at)}</Text>:null}
   {item.completed_at?<Text style={flow.field}>Conclusão: {date(item.completed_at)}{confirmedBy(item.completion_confirmed_by)?` · ${confirmedBy(item.completion_confirmed_by)}`:''}</Text>:null}
   <PressableScale accessibilityRole="button" accessibilityLabel={`Ver detalhes de ${item.category}`} style={s.button} onPress={()=>router.push({pathname:'./propostas',params:{id:item.id,from:'history'}})}><Text style={s.buttonText}>Ver detalhes e propostas ↗</Text></PressableScale>
  </View></StaggerItem>}
  ListFooterComponent={data?.hasMore?<PressableScale accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} style={s.button} onPress={()=>load(data.page+1)}><Text style={s.buttonText}>{busy?'Carregando…':'Carregar mais registros'}</Text></PressableScale>:undefined}
 /></ListEntrance></SafeAreaView>;
}
const useS = themed(colors => StyleSheet.create({safe:{flex:1,backgroundColor:colors.bg},section:{gap:14,marginBottom:18},error:{color:colors.danger,fontSize:15,lineHeight:22},amount:{fontSize:24,fontWeight:'800',color:colors.text},statusRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:10},button:{minHeight:52,padding:16,borderRadius:16,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},buttonText:{color:colors.onPrimary,fontSize:15,fontWeight:'700'}}));
