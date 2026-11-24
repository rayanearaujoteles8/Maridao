import {useEffect,useRef,useState} from 'react';
import { PressableScale } from '@/components/pressable-scale';
import {router} from 'expo-router';
import {Alert,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {useSession} from './session';
import {useStyles} from './access-screen';
import {useToast} from './toast';
import {AUTO_CONFIRM_DAYS,AWAITING,ContestNote,confirmedBy,formatWhen,type CompletionInfo} from './completion';
import {api,ApiError} from '@/lib/api';
import { themed, useTheme } from '@/theme';

// Andamento do atendimento (UC07.1 a UC07.4). O que cada pessoa pode fazer vem pronto da API nos campos can_*:
// o prestador escolhido inicia e registra a conclusão; o cliente confirma ou contesta (nas telas próprias) e avalia.
export type ServiceProgress=CompletionInfo&{id:string;status:string;started_at?:string|null;completed_at?:string|null;can_manage?:boolean;can_chat?:boolean;support_open?:boolean;can_open_support?:boolean;can_start?:boolean;can_report_completion?:boolean;can_confirm_completion?:boolean;can_contest_completion?:boolean;can_review?:boolean;can_cancel?:boolean};
type Props={request:ServiceProgress;role?:'customer'|'provider'|null;from?:'list'|'history';disabled?:boolean;onUpdated:(request:ServiceProgress)=>void;onReload?:()=>unknown};
type Protocol={id:string;status:string;reason:string;description:string;created_at:string;resolution:string|null};
export function ServiceProgressActions(props:Props){return <ProgressActions key={props.request.id} {...props}/>;}
function ProgressActions({request,role,from,disabled=false,onUpdated,onReload}:Props){
 const s=useS();const {colors}=useTheme();const styles=useStyles();
 const {session,setSession}=useSession();
 const toast=useToast();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [report,setReport]=useState(false),[description,setDescription]=useState('');
 const [protocols,setProtocols]=useState<Protocol[]>([]);
 const pending=useRef(false),generation=useRef(0);
 useEffect(()=>()=>{generation.current++;pending.current=false;},[]);
 const customer=role==='customer';
 const awaiting=request.status===AWAITING;
 const done=request.status==='Concluída';
 const off=busy||disabled;
 async function action(path:string,body:unknown,success:(result:any)=>void,method='POST'){
  if(!session||pending.current||disabled)return;
  const run=generation.current;pending.current=true;setBusy(true);setError('');
  try{
   const result=await api(`/requests/${encodeURIComponent(request.id)}/${path}`,{method,headers:{Authorization:`Bearer ${session.token}`,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})});
   if(run===generation.current)success(result);
  }catch(failure){
   if(run!==generation.current)return;
   if(failure instanceof ApiError&&failure.status===401){setSession(null);return;}
   setError(failure instanceof Error?failure.message:'Não foi possível concluir. Atualize o pedido para conferir o resultado.');
   // Recusa por etapa ou permissão (409/403): o pedido mudou; a tela recarrega para mostrar a situação atual.
   if(failure instanceof ApiError&&(failure.status===409||failure.status===403))void onReload?.();
  }finally{if(run===generation.current){pending.current=false;setBusy(false);}}
 }
 function start(){
  if(!request.can_start)return;
  const run=generation.current;
  Alert.alert('Iniciar atendimento?','O pedido passa para "Em andamento" e o cliente é avisado.',[
   {text:'Voltar',style:'cancel'},
   {text:'Iniciar atendimento',onPress:()=>{if(run===generation.current)void action('status',{status:'Em andamento'},result=>{onUpdated({...request,...result.request,can_start:false,can_report_completion:true,can_open_support:false});toast.success('Atendimento iniciado.');void onReload?.();});}},
  ]);
 }
 function reportCompletion(){
  if(!request.can_report_completion)return;
  const run=generation.current;
  const limit=formatWhen(new Date(Date.now()+AUTO_CONFIRM_DAYS*86400000).toISOString());
  Alert.alert('Registrar a conclusão?',`O cliente será avisado e terá até ${limit} (${AUTO_CONFIRM_DAYS} dias) para confirmar ou contestar. Sem resposta, a conclusão é confirmada automaticamente.`,[
   {text:'Voltar',style:'cancel'},
   {text:'Registrar conclusão',onPress:()=>{if(run===generation.current)void action('completion',{},result=>{onUpdated({...request,...result.request,can_report_completion:false,can_cancel:false});toast.success(result.message??'Conclusão registrada. Aguardando a confirmação do cliente.');void onReload?.();});}},
  ]);
 }
 function sendReport(){
  if(!description.trim()){setError('Descreva o problema antes de registrar.');return;}
  void action('support',{reason:'nao_realizado',description:description.trim()},result=>{setDescription('');setReport(false);onUpdated({...request,support_open:true,can_open_support:false});toast.success(`Protocolo ${result.id} registrado para análise da administração.`);});
 }
 const decide=(pathname:'/confirmar-conclusao'|'/contestar-conclusao')=>router.push({pathname,params:from?{id:request.id,from}:{id:request.id}});
 return <View style={s.group}>
  {request.started_at?<Text style={styles.note}>Iniciado em {formatWhen(request.started_at)}</Text>:null}
  {awaiting&&customer&&(request.can_confirm_completion||request.can_contest_completion)?<View style={s.highlight}>
   <Text style={s.eyebrowOn}>SUA RESPOSTA</Text>
   <Text style={s.highlightText}>O prestador registrou a conclusão{request.completion_reported_at?` em ${formatWhen(request.completion_reported_at)}`:''}. Confirme ou conteste{request.completion_deadline_at?` até ${formatWhen(request.completion_deadline_at)}`:''}; depois disso a conclusão é confirmada automaticamente.</Text>
   {request.can_confirm_completion?<PressableScale accessibilityRole="button" accessibilityHint="Abre a confirmação. Nada é confirmado ainda." disabled={off} accessibilityState={{disabled:off}} style={s.button} onPress={()=>decide('/confirmar-conclusao')}><Text style={s.buttonText}>Confirmar conclusão</Text></PressableScale>:null}
   {request.can_contest_completion?<PressableScale accessibilityRole="button" accessibilityHint="Abre a contestação, com o campo de motivo. Nada é enviado ainda." disabled={off} accessibilityState={{disabled:off}} style={s.outline} onPress={()=>decide('/contestar-conclusao')}><Text style={s.outlineText}>Contestar conclusão</Text></PressableScale>:null}
  </View>:null}
  {awaiting&&request.can_manage?<View accessible style={s.info}>
   <Text style={s.eyebrow}>AGUARDANDO O CLIENTE</Text>
   <Text style={s.label}>Aguardando a confirmação do cliente{request.completion_deadline_at?` até ${formatWhen(request.completion_deadline_at)}`:''}</Text>
   <Text style={styles.note}>{request.completion_reported_at?`Você registrou a conclusão em ${formatWhen(request.completion_reported_at)}. `:''}O cliente pode confirmar ou contestar. Sem resposta até o prazo, a conclusão é confirmada automaticamente.</Text>
  </View>:null}
  {request.status==='Em andamento'&&(customer||request.can_manage)?<ContestNote contest={request.completion_contest} mine={customer}/>:null}
  {request.status==='Em andamento'&&request.completion_contest&&request.can_report_completion?<Text style={styles.note}>Resolva o que foi apontado e registre a conclusão de novo. O cliente volta a ter {AUTO_CONFIRM_DAYS} dias para responder.</Text>:null}
  {done&&request.completed_at?<Text style={styles.note}>Concluído em {formatWhen(request.completed_at)}{confirmedBy(request.completion_confirmed_by)?` · ${confirmedBy(request.completion_confirmed_by)}`:''}</Text>:null}
  {done&&request.can_review?<PressableScale accessibilityRole="button" disabled={off} accessibilityState={{disabled:off}} style={s.button} onPress={()=>router.push({pathname:'/avaliar',params:{id:request.id}})}><Text style={s.buttonText}>Avaliar atendimento</Text></PressableScale>:null}
  {done&&customer&&!request.can_review?<Pressable accessibilityRole="link" style={s.secondary} onPress={()=>router.push({pathname:'/avaliar',params:{id:request.id}})}><Text style={s.link}>Ver minha avaliação ↗</Text></Pressable>:null}
  {request.support_open?<Text style={styles.note}>Existe um protocolo de suporte em aberto. O atendimento aguarda a análise da administração.</Text>:null}
  {request.can_start?<PressableScale accessibilityRole="button" disabled={off} accessibilityState={{disabled:off,busy}} style={s.button} onPress={start}><Text style={s.buttonText}>{busy?'Aguarde…':'Iniciar atendimento'}</Text></PressableScale>:null}
  {request.can_report_completion?<PressableScale accessibilityRole="button" disabled={off} accessibilityState={{disabled:off,busy}} style={s.button} onPress={reportCompletion}><Text style={s.buttonText}>{busy?'Registrando…':'Registrar conclusão'}</Text></PressableScale>:null}
  {request.can_open_support?<Pressable accessibilityRole="button" accessibilityState={{expanded:report,disabled:off}} disabled={off} style={s.secondary} onPress={()=>{setReport(value=>!value);setError('');}}><Text style={s.link}>Relatar serviço não realizado</Text></Pressable>:null}
  {request.can_open_support&&report?<View style={s.info}>
   <Text accessibilityRole="header" style={s.label}>O serviço não foi realizado?</Text>
   <Text style={styles.note}>Use este protocolo quando o prestador não aparecer ou não iniciar o atendimento combinado. Enquanto estiver aberto, o atendimento não pode ser iniciado.</Text>
   <TextInput placeholderTextColor={colors.placeholder} accessibilityLabel="Relato privado para análise da administração" value={description} onChangeText={value=>{setDescription(value);setError('');}} editable={!busy} multiline scrollEnabled={false} maxLength={3000} style={s.input} placeholder="Descreva o que aconteceu"/>
   <Text style={styles.note}>Relato privado, vinculado ao pedido. Não é uma avaliação pública.</Text>
   <PressableScale accessibilityRole="button" disabled={off} accessibilityState={{disabled:off,busy}} style={s.button} onPress={sendReport}><Text style={s.buttonText}>{busy?'Registrando…':'Registrar protocolo'}</Text></PressableScale>
   <Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={()=>setReport(false)}><Text style={s.link}>Cancelar relato</Text></Pressable>
  </View>:null}
  {customer&&request.status!=='Aberta'?<Pressable accessibilityRole="button" disabled={off} accessibilityState={{disabled:off}} style={s.secondary} onPress={()=>action('support',undefined,result=>{setProtocols(result.protocols);if(!result.protocols.length)toast.info('Você não tem protocolos para este pedido.');},'GET')}><Text style={s.link}>Consultar meus protocolos</Text></Pressable>:null}
  {protocols.map(item=><View key={item.id} style={s.info}><Text style={s.label}>Protocolo {item.id}</Text><Text style={styles.note}>{item.status} · {formatWhen(item.created_at)}</Text><Text style={styles.note}>{item.reason==='nao_realizado'?'Serviço não realizado':'Discordância da conclusão'}</Text><Text style={styles.note}>{item.description}</Text>{item.resolution?<Text style={styles.note}>Resposta administrativa: {item.resolution}</Text>:null}</View>)}
  {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
 </View>;
}
const useS = themed(colors => StyleSheet.create({
 group:{gap:12},
 label:{fontSize:15,lineHeight:22,fontWeight:'600',color:colors.text},
 eyebrow:{fontSize:10,fontWeight:'700',letterSpacing:1.2,color:colors.textMuted},
 eyebrowOn:{fontSize:10,fontWeight:'700',letterSpacing:1.2,color:colors.onAccentSoftMuted},
 highlight:{backgroundColor:colors.accentSoft,borderRadius:18,padding:16,gap:12},
 highlightText:{fontSize:15,lineHeight:23,color:colors.onAccentSoft},
 button:{backgroundColor:colors.primary,minHeight:56,padding:18,borderRadius:16,alignItems:'center',justifyContent:'center'},
 buttonText:{color:colors.onPrimary,fontSize:17,fontWeight:'700'},
 outline:{minHeight:52,padding:14,borderRadius:16,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:colors.onAccentSoft},
 outlineText:{color:colors.onAccentSoft,fontSize:16,fontWeight:'700'},
 off:{opacity:0.5},
 error:{color:colors.danger,fontSize:16,lineHeight:24},
 input:{borderWidth:1,borderColor:colors.borderStrong,borderRadius:14,padding:14,minHeight:96,textAlignVertical:'top',color:colors.text,fontSize:17},
 secondary:{minHeight:48,paddingVertical:13,paddingHorizontal:16,justifyContent:'center',alignItems:'center',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderStrong,borderRadius:14},
 link:{fontSize:15,lineHeight:22,fontWeight:'600',color:colors.text,textAlign:'center'},
 info:{padding:16,borderRadius:16,backgroundColor:colors.surface,gap:8},
}));
