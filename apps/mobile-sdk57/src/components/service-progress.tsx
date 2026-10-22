import {useEffect,useRef,useState} from 'react';
import {Alert,Pressable,StyleSheet,Text,View} from 'react-native';
import {useSession} from './session';
import {colors,styles} from './access-screen';
import {api,ApiError} from '@/lib/api';

export type ServiceProgress={id:string;status:string;started_at?:string|null;completed_at?:string|null;can_manage?:boolean};
type Props={request:ServiceProgress;disabled?:boolean;onUpdated:(request:ServiceProgress)=>void};
export function ServiceProgressActions({request,disabled=false,onUpdated}:Props){
 const {session,setSession}=useSession();
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const pending=useRef(false),generation=useRef(0);
 useEffect(()=>{generation.current++;pending.current=false;setBusy(false);setMessage('');setError('');return()=>{generation.current++;pending.current=false;};},[request.id]);
 const target=request.status==='Aceita'?'Em andamento':request.status==='Em andamento'?'Concluída':null;
 async function update(status:'Em andamento'|'Concluída'){
  if(!session||pending.current||disabled||!request.can_manage)return;
  const run=generation.current;pending.current=true;setBusy(true);setError('');setMessage('');
  try{
   const result=await api(`/requests/${encodeURIComponent(request.id)}/status`,{method:'POST',headers:{Authorization:`Bearer ${session.token}`,'Content-Type':'application/json'},body:JSON.stringify({status})});
   if(run!==generation.current)return;
   onUpdated({...request,...result.request});setMessage(status==='Concluída'?'Atendimento concluído!':'Atendimento iniciado!');
  }catch(failure){
   if(run!==generation.current)return;
   if(failure instanceof ApiError&&failure.status===401)setSession(null);
   else setError(failure instanceof Error?failure.message:'Não foi possível confirmar a atualização. Atualize a lista para conferir.');
  }finally{if(run===generation.current){pending.current=false;setBusy(false);}}
 }
 function confirm(){
  if(!target||pending.current||disabled)return;
  const run=generation.current;
  Alert.alert(target==='Concluída'?'Concluir atendimento?':'Iniciar atendimento?',target==='Concluída'?'Confirme que o serviço foi finalizado.':'O pedido passará para Em andamento.',[
   {text:'Voltar',style:'cancel'},
   {text:target==='Concluída'?'Confirmar conclusão':'Confirmar início',onPress:()=>{if(run===generation.current)void update(target);}},
  ]);
 }
 const dateLabel=(value:string)=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Araguaina'}).format(new Date(value));
 return <View style={s.group}>
  {request.started_at?<Text style={styles.note}>Iniciado em {dateLabel(request.started_at)}</Text>:null}
  {request.completed_at?<Text style={styles.note}>Concluído em {dateLabel(request.completed_at)}</Text>:null}
  {request.can_manage&&target?<Pressable accessibilityRole="button" disabled={busy||disabled} accessibilityState={{disabled:busy||disabled,busy}} style={[s.button,(busy||disabled)&&{opacity:0.6}]} onPress={confirm}><Text style={s.buttonText}>{busy?'Atualizando…':target==='Em andamento'?'Iniciar atendimento':'Concluir atendimento'}</Text></Pressable>:null}
  {message?<Text accessibilityRole="alert" style={s.success}>{message}</Text>:null}
  {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
 </View>;
}
const s=StyleSheet.create({group:{gap:12},button:{backgroundColor:colors.black,minHeight:56,padding:18,borderRadius:16,alignItems:'center'},buttonText:{color:colors.white,fontSize:17,fontWeight:'700'},success:{backgroundColor:colors.pale,padding:12,borderRadius:12,fontSize:16},error:{color:'#A32121',fontSize:16,lineHeight:24}});
