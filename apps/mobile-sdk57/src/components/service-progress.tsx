import {useEffect,useRef,useState} from 'react';
import {Alert,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {useSession} from './session';
import {colors,styles} from './access-screen';
import {api,ApiError} from '@/lib/api';
export type ServiceProgress={id:string;status:string;started_at?:string|null;completed_at?:string|null;can_manage?:boolean;can_confirm?:boolean;support_open?:boolean};
type Props={request:ServiceProgress;disabled?:boolean;onUpdated:(request:ServiceProgress)=>void};
type Protocol={id:string;status:string;reason:string;description:string;created_at:string;resolution:string|null};
export function ServiceProgressActions(props:Props){return <ProgressActions key={props.request.id} {...props}/>;}
function ProgressActions({request,disabled=false,onUpdated}:Props){
 const {session,setSession}=useSession();
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [code,setCode]=useState(''),[issued,setIssued]=useState<{code:string;expiresAt:string}|null>(null);
 const [report,setReport]=useState(false),[reason,setReason]=useState<'discordancia'|'nao_realizado'>('discordancia'),[description,setDescription]=useState('');
 const [protocols,setProtocols]=useState<Protocol[]>([]);
 const pending=useRef(false),generation=useRef(0);
 useEffect(()=>()=>{generation.current++;pending.current=false;},[]);
 const inProgress=request.status==='Em andamento';
 const dateLabel=(value:string)=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Araguaina'}).format(new Date(value));
 async function action(path:string,body:unknown,success:(result:any)=>void,method='POST'){
  if(!session||pending.current||disabled)return;
  const run=generation.current;pending.current=true;setBusy(true);setError('');setMessage('');
  try{
   const result=await api(`/requests/${encodeURIComponent(request.id)}/${path}`,{method,headers:{Authorization:`Bearer ${session.token}`,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})});
   if(run===generation.current)success(result);
  }catch(failure){if(run!==generation.current)return;if(failure instanceof ApiError&&failure.status===401)setSession(null);else setError(failure instanceof Error?failure.message:'Não foi possível confirmar. Atualize o pedido para conferir o resultado.');}
  finally{if(run===generation.current){pending.current=false;setBusy(false);}}
 }
 function update(){
  if(!request.can_manage)return;
  const status=request.status==='Aceita'?'Em andamento':'Concluída';
  if(status==='Concluída'&&!/^\d{6}$/.test(code)){setError('Informe os seis dígitos fornecidos pelo cliente.');return;}
  const run=generation.current;
  Alert.alert(status==='Concluída'?'Validar código e concluir?':'Iniciar atendimento?',status==='Concluída'?'A conclusão depende do código gerado pelo cliente após conferir o serviço.':'O pedido passará para Em andamento.',[
   {text:'Voltar',style:'cancel'},
   {text:'Confirmar',onPress:()=>{if(run!==generation.current)return;void action('status',status==='Concluída'?{status,code}:{status},result=>{onUpdated({...request,...result.request});setCode('');setMessage(status==='Concluída'?'Conclusão confirmada com o código do cliente.':'Atendimento iniciado!');});}},
  ]);
 }
 function generate(){
  const run=generation.current;
  Alert.alert('O serviço foi realizado?','Compartilhe o código somente se concordar com a conclusão. Ele vale por dez minutos. Gerar outro invalida o anterior.',[
   {text:'Voltar',style:'cancel'},
   {text:'Gerar código',onPress:()=>{if(run===generation.current)void action('completion-code',{},result=>{setIssued(result);setMessage('Código gerado. Mostre ao prestador apenas após conferir o serviço.');});}},
  ]);
 }
 function sendReport(){
  if(!description.trim()){setError('Descreva o problema antes de registrar.');return;}
  void action('support',{reason,description},result=>{setIssued(null);setDescription('');setReport(false);onUpdated({...request,support_open:true});setMessage(`Protocolo ${result.id} registrado para análise administrativa. A conclusão fica impedida enquanto estiver aberto. Consulte o andamento abaixo.`);});
 }
 return <View style={s.group}>
  {request.started_at?<Text style={styles.note}>Iniciado em {dateLabel(request.started_at)}</Text>:null}
  {request.completed_at?<Text style={styles.note}>Concluído em {dateLabel(request.completed_at)}</Text>:null}
  {request.support_open?<Text style={styles.note}>Existe um protocolo em aberto. A conclusão aguarda análise.</Text>:null}
  {request.can_manage&&request.status==='Aceita'?<Pressable accessibilityRole="button" disabled={busy||disabled} style={s.button} onPress={update}><Text style={s.buttonText}>Iniciar atendimento</Text></Pressable>:null}
  {request.can_manage&&inProgress&&!request.support_open?<View style={s.group}>
   <Text style={s.label}>Código de conclusão do cliente</Text>
   <Text style={styles.note}>Peça o código somente depois que o cliente conferir o serviço.</Text>
   <TextInput accessibilityLabel="Código de seis dígitos do cliente" value={code} onChangeText={value=>setCode(value.replace(/\D/g,'').slice(0,6))} maxLength={6} keyboardType="number-pad" editable={!busy&&!disabled} style={s.input}/>
   <Pressable accessibilityRole="button" disabled={busy||disabled} accessibilityState={{disabled:busy||disabled,busy}} style={s.button} onPress={update}><Text style={s.buttonText}>{busy?'Validando…':'Validar código e concluir'}</Text></Pressable>
  </View>:null}
  {request.can_confirm&&inProgress&&!request.support_open?<View style={s.group}>
   <Text style={s.label}>Confira o serviço antes de confirmar</Text>
   <Pressable accessibilityRole="button" disabled={busy||disabled} style={s.button} onPress={generate}><Text style={s.buttonText}>{issued?'Gerar outro código':'Gerar código de conclusão'}</Text></Pressable>
   {issued?<View style={s.info}><Text style={s.label}>Seu código de conclusão</Text><Text selectable style={s.code}>{issued.code}</Text><Text style={styles.note}>Válido até {dateLabel(issued.expiresAt)}. Compartilhe somente se concordar com a conclusão.</Text></View>:null}
   <Pressable accessibilityRole="button" disabled={busy||disabled} style={s.secondary} onPress={()=>{setReport(value=>!value);setError('');}}><Text style={s.label}>Relatar problema com o atendimento</Text></Pressable>
  </View>:null}
  {request.can_confirm&&report&&inProgress&&!request.support_open?<View style={s.info}>
   <Text accessibilityRole="header" style={s.label}>O que aconteceu?</Text>
   {([{value:'discordancia',label:'Discordo da conclusão'},{value:'nao_realizado',label:'O serviço não foi realizado'}] as const).map(item=><Pressable key={item.value} accessibilityRole="radio" accessibilityState={{checked:reason===item.value,disabled:busy}} disabled={busy} style={[s.choice,reason===item.value&&s.chosen]} onPress={()=>setReason(item.value)}><Text style={s.label}>{item.label}</Text></Pressable>)}
   <TextInput accessibilityLabel="Relato privado para análise administrativa" value={description} onChangeText={setDescription} editable={!busy} multiline maxLength={3000} style={s.input} placeholder="Descreva o problema"/>
   <Text style={styles.note}>Relato privado, vinculado ao pedido. Não é uma avaliação pública nem uma confirmação de conclusão.</Text>
   <Pressable accessibilityRole="button" disabled={busy||disabled} style={s.button} onPress={sendReport}><Text style={s.buttonText}>{busy?'Registrando…':'Registrar protocolo'}</Text></Pressable>
   <Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={()=>setReport(false)}><Text style={s.label}>Cancelar relato</Text></Pressable>
  </View>:null}
  {request.can_confirm&&request.started_at?<Pressable accessibilityRole="button" disabled={busy||disabled} style={s.secondary} onPress={()=>action('support',undefined,result=>{setProtocols(result.protocols);setMessage(result.protocols.length?'Protocolos atualizados.':'Você não tem protocolos para este pedido.');},'GET')}><Text style={s.label}>Consultar meus protocolos</Text></Pressable>:null}
  {protocols.map(item=><View key={item.id} style={s.info}><Text style={s.label}>Protocolo {item.id}</Text><Text style={styles.note}>{item.status} · {dateLabel(item.created_at)}</Text><Text style={styles.note}>{item.reason==='nao_realizado'?'Serviço não realizado':'Discordância da conclusão'}</Text><Text style={styles.note}>{item.description}</Text>{item.resolution?<Text style={styles.note}>Resposta administrativa: {item.resolution}</Text>:null}</View>)}
  {message?<Text accessibilityRole="alert" style={s.success}>{message}</Text>:null}
  {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
 </View>;
}
const s=StyleSheet.create({group:{gap:12},label:{fontSize:15,lineHeight:22,fontWeight:'600',color:colors.black},button:{backgroundColor:colors.black,minHeight:56,padding:18,borderRadius:16,alignItems:'center'},buttonText:{color:colors.white,fontSize:17,fontWeight:'700'},success:{backgroundColor:colors.pale,padding:12,borderRadius:12,fontSize:16},error:{color:'#A32121',fontSize:16,lineHeight:24},input:{borderWidth:1,borderColor:'#A4AF98',borderRadius:14,padding:14,minHeight:52,color:colors.black,fontSize:18},secondary:{minHeight:48,padding:12,justifyContent:'center'},info:{padding:16,borderRadius:16,backgroundColor:'#F3F6EF',gap:12},code:{fontSize:32,fontWeight:'800',letterSpacing:5,color:colors.black},choice:{padding:14,borderWidth:1,borderColor:'#A4AF98',borderRadius:12},chosen:{backgroundColor:colors.pale,borderColor:colors.black}});
