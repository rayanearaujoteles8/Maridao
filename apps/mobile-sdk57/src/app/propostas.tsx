import {useCallback,useRef,useState} from 'react';
import {Link,Redirect,useFocusEffect,useLocalSearchParams} from 'expo-router';
import {Keyboard,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors,styles} from '@/components/access-screen';
import {DateField} from '@/components/date-field';
import {useSession} from '@/components/session';
import {api,ApiError} from '@/lib/api';

type Proposal={id:string;amount:string;description:string;estimated_duration:string;valid_until:string;status:string;provider_name:string;expired:boolean};
type Result={request:{id:string;category:string;description:string;neighborhood:string;status:string};proposals:Proposal[];role:'customer'|'provider';page:number;hasMore:boolean};
const empty={amount:'',description:'',estimatedDuration:'',validUntil:''};
export default function ProposalsScreen(){
 const {id}=useLocalSearchParams<{id:string}>();
 const {session,setSession}=useSession();
 const [data,setData]=useState<Result|null>(null),[form,setForm]=useState(empty),[errors,setErrors]=useState<Record<string,string>>({});
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef(false),generation=useRef(0);
 const validId=typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id);
 const load=useCallback(async(page=1)=>{
  if(!session||!validId||pending.current)return;
  const run=generation.current;pending.current=true;setBusy(true);setError('');
  try{
   const result:Result=await api(`/requests/${encodeURIComponent(id)}/proposals?page=${page}`,{headers:{Authorization:`Bearer ${session.token}`}});
   if(run!==generation.current)return;
   setData(old=>page===1||!old?result:{...result,proposals:[...old.proposals,...result.proposals.filter(item=>!old.proposals.some(previous=>previous.id===item.id))]});
  }catch(failure){if(run!==generation.current)return;if(failure instanceof ApiError&&failure.status===401)setSession(null);else setError(failure instanceof Error?failure.message:'Não foi possível carregar as propostas.');}
  finally{if(run===generation.current){pending.current=false;setBusy(false);}}
 },[session,setSession,validId,id]);
 useFocusEffect(useCallback(()=>{
  generation.current++;pending.current=false;setData(null);setForm(empty);setErrors({});setMessage('');void load();
  return()=>{generation.current++;pending.current=false;};
 },[load]));
 function change(key:keyof typeof form,value:string){setForm(old=>({...old,[key]:value}));setErrors(old=>({...old,[key]:''}));setError('');}
 async function submit(){
  if(!session||!validId||pending.current)return;
  const next:Record<string,string>={};
  for(const key of Object.keys(form) as (keyof typeof form)[])if(!form[key].trim())next[key]='Preencha este campo.';
  setErrors(next);setError('');if(Object.keys(next).length)return;
  const run=generation.current;pending.current=true;setBusy(true);Keyboard.dismiss();
  let sent=false;
  try{await api(`/requests/${encodeURIComponent(id)}/proposals`,{method:'POST',headers:{Authorization:`Bearer ${session.token}`,'Content-Type':'application/json'},body:JSON.stringify(form)});if(run!==generation.current)return;setMessage('Proposta enviada!');setForm(empty);sent=true;}
  catch(failure){if(run!==generation.current)return;if(failure instanceof ApiError&&failure.status===401)setSession(null);else{if(failure instanceof ApiError&&failure.fields)setErrors(failure.fields);setError(failure instanceof Error?failure.message:'Não foi possível enviar a proposta.');}}
  finally{if(run===generation.current){pending.current=false;setBusy(false);}}
  if(sent)await load();
 }
 if(!session)return <Redirect href="/entrar"/>;
 return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={[styles.page,{paddingBottom:64}]} automaticallyAdjustKeyboardInsets keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} keyboardShouldPersistTaps="handled">
  <Link href="./solicitacoes" style={styles.back}>‹ Voltar às solicitações</Link>
  <Text accessibilityRole="header" style={styles.title}>{data?.role==='provider'?'Sua proposta':'Propostas recebidas'}</Text>
  {!validId?<Text style={s.error}>Solicitação inválida. Volte à lista e tente novamente.</Text>:null}
  {data?<View style={styles.card}><Text style={styles.cardTitle}>{data.request.category}</Text><Text style={styles.field}>{data.request.neighborhood}</Text><Text style={styles.description}>{data.request.description}</Text></View>:null}
  {message?<Text accessibilityRole="alert" style={s.success}>{message}</Text>:null}
  {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
  {validId?<Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} style={s.secondary} onPress={()=>load()}><Text style={s.label}>{busy?'Carregando…':'Atualizar propostas'}</Text></Pressable>:null}
  {data?.proposals.map(proposal=><View key={proposal.id} style={styles.card}>
   <Text style={styles.cardTitle}>{proposal.provider_name}</Text><Text style={s.price}>{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(proposal.amount))}</Text>
   <Text style={s.label}>{proposal.expired&&proposal.status==='Pendente'?'Validade encerrada':proposal.status}</Text>
   <Text style={styles.description}>{proposal.description}</Text><Text style={s.label}>Prazo estimado</Text><Text style={styles.field}>{proposal.estimated_duration}</Text>
   <Text style={s.label}>Válida até</Text><Text style={styles.field}>{proposal.valid_until.split('-').reverse().join('/')}</Text>
  </View>)}
  {data?.role==='customer'&&!data.proposals.length?<Text style={styles.description}>Você ainda não recebeu propostas para este pedido.</Text>:null}
  {data?.role==='provider'&&!data.proposals.length&&data.request.status==='Aberta'&&!message?<View style={s.form}>
   <Text style={styles.cardTitle}>Enviar proposta</Text>
   {([{key:'amount',label:'Valor total (R$)',placeholder:'Ex.: 150,00',max:9},{key:'description',label:'Descrição da proposta',placeholder:'Descreva o que está incluído no serviço',max:3000},{key:'estimatedDuration',label:'Prazo estimado',placeholder:'Ex.: 2 dias após combinar o início',max:200}] as const).map(field=><View key={field.key} style={s.group}><Text style={s.label}>{field.label}</Text><TextInput accessibilityLabel={field.label} editable={!busy} value={form[field.key]} onChangeText={text=>change(field.key,text)} maxLength={field.max} placeholder={field.placeholder} placeholderTextColor="#64705C" keyboardType={field.key==='amount'?'decimal-pad':'default'} multiline={field.key==='description'} scrollEnabled={false} style={[s.input,errors[field.key]&&s.invalid]}/>{errors[field.key]?<Text style={s.error}>{errors[field.key]}</Text>:null}</View>)}
   <View style={s.group}><Text style={s.label}>Validade da proposta</Text><DateField label="validade da proposta" value={form.validUntil} onChange={value=>change('validUntil',value)} disabled={busy} error={errors.validUntil}/>{errors.validUntil?<Text style={s.error}>{errors.validUntil}</Text>:null}<Text style={styles.note}>Válida até o fim do dia escolhido, no horário de Palmas.</Text></View>
   <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} style={[s.button,busy&&{opacity:0.6}]} onPress={submit}><Text style={s.buttonText}>{busy?'Enviando…':'Enviar proposta'}</Text></Pressable>
  </View>:null}
  {data?.hasMore?<Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={()=>load(data.page+1)}><Text style={s.label}>Carregar mais propostas</Text></Pressable>:null}
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({form:{gap:24},group:{gap:10},label:{fontSize:16,fontWeight:'600',color:colors.black},price:{fontSize:26,fontWeight:'700',color:colors.black},input:{minHeight:58,borderWidth:1,borderColor:'#A4AF98',borderRadius:16,padding:16,fontSize:17,color:colors.black},invalid:{borderColor:'#A32121',borderWidth:2},error:{color:'#A32121',fontSize:16,lineHeight:24},success:{backgroundColor:colors.pale,padding:16,borderRadius:14,fontSize:18,fontWeight:'600'},button:{backgroundColor:colors.black,padding:18,minHeight:56,borderRadius:16,alignItems:'center'},buttonText:{color:colors.white,fontSize:17,fontWeight:'700'},secondary:{minHeight:48,padding:12,justifyContent:'center'}});
