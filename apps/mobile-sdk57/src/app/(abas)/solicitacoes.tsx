import { useCallback, useRef, useState } from 'react';
import { PressableScale } from '@/components/pressable-scale';
import { Redirect, useFocusEffect, useScrollToTop, router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStyles } from '@/components/access-screen';
import { TAB_EDGES } from '@/components/tab-bar';
import { WorkflowHeading, StatusBadge, useFlow } from '@/components/workflow-screen';
import { useSession } from '@/components/session';
import { api, ApiError } from '@/lib/api';
import {ServiceProgressActions,type ServiceProgress} from '@/components/service-progress';
import {CancellationNote,CancelLink,canCancel,type Cancellable} from '@/components/cancellation';
import {AttentionSeal} from '@/components/completion';
import {RemovedNote,type CustomerRemoved} from '@/components/removed-user';
import {usePullRefresh} from '@/components/pull-refresh';
import { ListEntrance, StaggerItem } from '@/components/list-entrance';
import { Skeleton } from '@/components/skeleton';
import { themed } from '@/theme';

type RequestItem=ServiceProgress & Cancellable & CustomerRemoved & {id:string;category:string;description:string;neighborhood:string;neighborhood_label?:string;city:string;state:string;preferred_date:string|null;preferred_period:string|null;status:string;created_at:string};
const formatDay=(iso:string)=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',timeZone:'America/Araguaina'}).format(new Date(iso));
type Result={requests:RequestItem[];page:number;hasMore:boolean;role:'customer'|'provider';approvalStatus?:string};
// UC05.1: prestador sem cadastro aprovado não recebe solicitações abertas; a lista vazia diz por quê.
const emptyNote=(role:Result['role']|null,approval:string|null)=>role!=='provider'?{title:'Seu próximo serviço começa aqui.',text:'Você ainda não publicou nenhuma solicitação.'}
 :approval==='Em análise'?{title:'Seu cadastro está em análise.',text:'As solicitações abertas aparecem aqui depois que um administrador aprovar o seu cadastro. Você será avisado em Notificações.'}
 :approval==='Rejeitado'?{title:'Seu cadastro foi rejeitado.',text:'Por isso as solicitações abertas não aparecem para você. O motivo informado pela administração está na tela Início.'}
 :{title:'As oportunidades aparecem por aqui.',text:'Ainda não há pedidos compatíveis ou propostas enviadas. Consulte novamente em outro momento.'};
export default function RequestsScreen(){
 const s=useS();const styles=useStyles();const flow=useFlow();
 const {session,setSession}=useSession();
 const [items,setItems]=useState<RequestItem[]>([]),[role,setRole]=useState<Result['role']|null>(null),[approval,setApproval]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[page,setPage]=useState(1),[more,setMore]=useState(false);
 const [expanded,setExpanded]=useState<string|null>(null);
 const generation=useRef(0),pending=useRef(false);
 // Aba: fica montada. shownFor = sessão cujos dados estão na tela; pages = quantas páginas já foram carregadas.
 const shownFor=useRef<string|null>(null),pages=useRef(1),list=useRef<FlatList<RequestItem>>(null);
 useScrollToTop(list);
 // quiet: recarga do gesto de puxar; não liga o `busy` (sem "Carregando…" nem botões travados) e a lista fica na tela.
 const load=useCallback(async(nextPage=1,quiet=false)=>{
  if(!session||pending.current)return;
  const run=generation.current;pending.current=true;if(!quiet)setBusy(true);setError('');
  try{
   const result:Result=await api(`/requests?page=${nextPage}`,{headers:{Authorization:`Bearer ${session.token}`}});
   if(run!==generation.current)return;
   setItems(old=>nextPage===1?result.requests:[...old,...result.requests.filter(item=>!old.some(previous=>previous.id===item.id))]);
   setRole(result.role);setApproval(result.approvalStatus??null);setPage(result.page);setMore(result.hasMore);pages.current=result.page;shownFor.current=session.token;
  }catch(failure){
   if(run!==generation.current)return;
   if(failure instanceof ApiError&&failure.status===401)setSession(null);
   else setError(failure instanceof Error?failure.message:'Não foi possível carregar as solicitações.');
  }finally{if(run===generation.current){pending.current=false;setBusy(false);}}
 },[session,setSession]);
 // Volta do foco (troca de aba ou retorno de um detalhe): recarrega em silêncio as páginas já abertas, sem apagar a
 // lista nem perder a rolagem. Só a primeira carga (ou a de outra conta) começa do zero.
 const resync=useCallback(async()=>{
  if(!session||pending.current)return;
  const run=generation.current;pending.current=true;
  try{
   let all:RequestItem[]=[],last:Result|null=null;
   for(let next=1;next<=pages.current;next++){
    const result:Result=await api(`/requests?page=${next}`,{headers:{Authorization:`Bearer ${session.token}`}});
    if(run!==generation.current)return;
    const seen=all;all=[...seen,...result.requests.filter(item=>!seen.some(previous=>previous.id===item.id))];last=result;
    if(!result.hasMore)break;
   }
   if(last){setItems(all);setRole(last.role);setApproval(last.approvalStatus??null);setPage(last.page);setMore(last.hasMore);pages.current=last.page;setError('');}
  }catch(failure){
   if(run!==generation.current)return;
   if(failure instanceof ApiError&&failure.status===401)setSession(null);
   else setError(failure instanceof Error?failure.message:'Não foi possível carregar as solicitações.');
  }finally{if(run===generation.current){pending.current=false;setBusy(false);}}
 },[session,setSession]);
 useFocusEffect(useCallback(()=>{
  generation.current++;pending.current=false;
  if(session&&shownFor.current===session.token)void resync();
  else{setItems([]);setRole(null);setApproval(null);setExpanded(null);setMore(false);setPage(1);pages.current=1;void load();}
  return()=>{generation.current++;pending.current=false;};
 },[load,resync,session]));
 const pull=usePullRefresh(useCallback(()=>load(1,true),[load]));
 const empty=emptyNote(role,approval);
 if(!session)return <Redirect href="/entrar"/>;
 // Primeira carga: blocos-fantasma no lugar da lista; os cartões entram em sequência (ListEntrance) quando ela chega.
 return <SafeAreaView edges={TAB_EDGES} style={styles.safe}><ListEntrance ready={role!==null}><FlatList {...pull.props} ref={list} data={items} keyExtractor={item=>item.id} contentContainerStyle={flow.page}
  ListHeaderComponent={<View style={s.section}>
   <WorkflowHeading eyebrow={role==='provider'?'OPORTUNIDADES E PROPOSTAS':'SEUS SERVIÇOS, EM UM SÓ LUGAR'} title={role==='provider'?'Vamos ao próximo serviço?':role==='customer'?'Meus pedidos':'Solicitações'} description={role==='provider'?'Consulte pedidos da sua região e acompanhe as propostas que enviou.':'Veja suas solicitações, compare propostas e acompanhe cada atendimento.'}/>
   <View style={flow.row}><Text accessibilityRole="header" style={flow.sectionTitle}>Solicitações</Text></View>
   {role==='provider'&&items.length>0&&(approval==='Em análise'||approval==='Rejeitado')?<Text style={flow.note}>{approval==='Em análise'?'Cadastro em análise: aparecem só os pedidos em que você já tem proposta.':'Cadastro rejeitado: aparecem só os pedidos em que você já tem proposta.'}</Text>:null}
   {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
  </View>}
  ListEmptyComponent={busy||(role===null&&!error)?<Skeleton shape="cards"/>:!error?<View style={flow.empty}><Text style={flow.cardTitle}>{empty.title}</Text><Text style={flow.description}>{empty.text}</Text>{role==='customer'?<PressableScale accessibilityRole="button" style={s.button} onPress={()=>router.push('/nova-solicitacao')}><Text style={s.buttonText}>Pedir um serviço ↗</Text></PressableScale>:null}</View>:undefined}
  renderItem={({item,index})=><StaggerItem index={index}><View style={flow.card}>
   <View style={flow.row}><StatusBadge status={item.status}/><Text style={flow.note}>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Araguaina'}).format(new Date(item.created_at))}</Text></View>
   {item.can_confirm_completion?<AttentionSeal label={item.completion_deadline_at?`Confirme a conclusão até ${formatDay(item.completion_deadline_at)}`:'Confirme a conclusão'}/>:null}
   <Text accessibilityRole="header" style={flow.cardTitle}>{item.category}</Text>
   <Text style={flow.field}>{item.neighborhood_label??item.neighborhood} · {item.city} – {item.state}</Text>
   <RemovedNote removed={item.customer_removed} name={item.customer_name}/>
   <Text numberOfLines={expanded===item.id?undefined:2} style={flow.description}>{item.description}</Text>
   {item.status==='Cancelada'?<CancellationNote cancellation={item.cancellation}/>:null}
   <Pressable accessibilityRole="button" accessibilityLabel={(expanded===item.id?'Fechar detalhes de ':'Ver detalhes de ')+item.category} accessibilityState={{expanded:expanded===item.id}} style={s.details} onPress={()=>setExpanded(old=>old===item.id?null:item.id)}><Text style={s.label}>{expanded===item.id?'Menos detalhes −':'Mais detalhes +'}</Text></Pressable>
   {expanded===item.id?<View style={flow.info}><Text style={s.label}>Preferência de atendimento</Text><Text style={flow.field}>{item.preferred_date?item.preferred_date.split('-').reverse().join('/'):'Sem data definida'}{item.preferred_period?` · ${item.preferred_period}`:''}</Text><Text style={flow.note}>A data é uma preferência, sujeita à combinação com o prestador.</Text><ServiceProgressActions request={item} role={role} from="list" disabled={busy} onReload={resync} onUpdated={updated=>setItems(old=>old.map(entry=>entry.id===updated.id?{...entry,...updated}:entry))}/>{canCancel(item)?<CancelLink id={item.id} role={role} from="list" disabled={busy}/>:null}</View>:null}
   <PressableScale accessibilityRole="button" accessibilityLabel={(item.can_confirm_completion?'Responder à conclusão de ':role==='provider'&&item.status==='Aberta'?'Ver ou enviar proposta para ':'Ver propostas de ')+item.category} style={s.button} onPress={()=>router.push({pathname:'/propostas',params:{id:item.id}})}><Text style={s.buttonText}>{item.can_confirm_completion?'Responder à conclusão ↗':role==='provider'&&item.status==='Aberta'?'Ver / enviar proposta ↗':'Ver propostas ↗'}</Text></PressableScale>
  </View></StaggerItem>}
  ListFooterComponent={more?<PressableScale accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} style={s.button} onPress={()=>load(page+1)}><Text style={s.buttonText}>{busy?'Carregando…':'Carregar mais'}</Text></PressableScale>:undefined}
 /></ListEntrance></SafeAreaView>;
}

const useS = themed(colors => StyleSheet.create({section:{gap:16},button:{backgroundColor:colors.primary,minHeight:56,padding:18,borderRadius:16,alignItems:'center'},buttonText:{color:colors.onPrimary,fontSize:17,fontWeight:'700'},disabled:{opacity:0.6},error:{color:colors.danger,fontSize:16,lineHeight:24},label:{fontSize:16,fontWeight:'600',color:colors.text},details:{minHeight:44,justifyContent:'center'}}));
