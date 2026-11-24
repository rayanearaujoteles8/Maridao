import {useCallback,useRef,useState} from 'react';
import { PressableScale } from '@/components/pressable-scale';
import {Link,Redirect,useFocusEffect,useLocalSearchParams} from 'expo-router';
import {Alert,Keyboard,Platform,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useStyles} from '@/components/access-screen';
import { BackButton } from '@/components/back-button';
import {WorkflowHeading,StatusBadge,useFlow} from '@/components/workflow-screen';
import {DateField} from '@/components/date-field';
import { FieldError, FieldInput } from '@/components/field-motion';
import {useSession} from '@/components/session';
import {useToast} from '@/components/toast';
import {api,ApiError} from '@/lib/api';
import {todayInPalmas} from '@/lib/calendar';
import {ServiceProgressActions,type ServiceProgress} from '@/components/service-progress';
import {CancellationNote,CancelLink,canCancel,type Cancellable} from '@/components/cancellation';
import {VersionsLink,hasVersions,shortDate,dateTime,money} from '@/components/proposal-versions';
import {RemovedNote,type CustomerRemoved} from '@/components/removed-user';
import {usePullRefresh} from '@/components/pull-refresh';
import { ListEntrance, Reflow, StaggerItem } from '@/components/list-entrance';
import { Skeleton } from '@/components/skeleton';
import { themed, useTheme } from '@/theme';

// Os botões de cada proposta seguem só os campos can_* da API (reenviar, retirar, aceitar); a tela não compara status.
type Proposal={id:string;amount:string;description:string;estimated_duration:string;valid_until:string;status:string;provider_name:string;provider_id:string;expired:boolean;version:number;created_at:string;updated_at:string|null;withdrawn_at:string|null;sent_at?:string|null;versions_count?:number;has_previous_versions?:boolean;can_resend?:boolean;can_withdraw?:boolean;can_accept?:boolean};
type Result={request:ServiceProgress & Cancellable & CustomerRemoved & {id:string;category:string;description:string;neighborhood:string;neighborhood_label?:string;created_at:string;city:string;state:string;preferred_date:string|null;preferred_period:string|null;status:string};proposals:Proposal[];role:'customer'|'provider';page:number;hasMore:boolean};
const empty={amount:'',description:'',estimatedDuration:'',validUntil:''};
// Recusa da API com código estável (409): a lista é recarregada e a mensagem fica junto do que a pessoa estava fazendo.
const refusal=(failure:unknown)=>failure instanceof ApiError&&failure.status===409&&!!failure.code?failure:null;
export default function ProposalsScreen(){
 const s=useS();const styles=useStyles();const flow=useFlow();const {colors}=useTheme();const toast=useToast();
 const {id,from}=useLocalSearchParams<{id:string;from?:string}>();
 const {session,setSession}=useSession();
 const [data,setData]=useState<Result|null>(null),[form,setForm]=useState(empty),[errors,setErrors]=useState<Record<string,string>>({});
 const [error,setError]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false);
 // Proposta com o formulário de reenvio aberto (UC05.3) e a versão que a tela está mostrando.
 const [resending,setResending]=useState<{id:string;version:number}|null>(null);
 // Recusa de uma ação sobre uma proposta: aparece no cartão dela. `changed`: o prestador reenviou enquanto o cliente olhava.
 const [cardError,setCardError]=useState<{id:string;text:string;changed:boolean}|null>(null);
 const scroll=useRef<React.ComponentRef<typeof ScrollView>>(null);
 const pending=useRef(false),generation=useRef(0);
 const validId=typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id);
 // quiet: recarga do gesto de puxar; não liga o `busy` (sem "Carregando…" nem botões travados) e a lista fica na tela.
 const load=useCallback(async(page=1,quiet=false):Promise<Result|null>=>{
  if(!session||!validId||pending.current)return null;
  const run=generation.current;pending.current=true;if(!quiet)setBusy(true);setError('');
  try{
   const result:Result=await api(`/requests/${encodeURIComponent(id)}/proposals?page=${page}`,{headers:{Authorization:`Bearer ${session.token}`}});
   if(run!==generation.current)return null;
   setData(old=>page===1||!old?result:{...result,proposals:[...old.proposals,...result.proposals.filter(item=>!old.proposals.some(previous=>previous.id===item.id))]});
   return result;
  }catch(failure){if(run!==generation.current)return null;if(failure instanceof ApiError&&failure.status===401)setSession(null);else setError(failure instanceof Error?failure.message:'Não foi possível carregar as propostas.');return null;}
  finally{if(run===generation.current){pending.current=false;setBusy(false);}}
 },[session,setSession,validId,id]);
 useFocusEffect(useCallback(()=>{
  generation.current++;pending.current=false;setData(null);setResending(null);setForm(empty);setErrors({});setSent(false);setCardError(null);void load();
  return()=>{generation.current++;pending.current=false;};
 },[load]));
 function change(key:keyof typeof form,value:string){setForm(old=>({...old,[key]:value}));setErrors(old=>({...old,[key]:''}));setError('');}
 // Reenvio: o formulário abre com os dados da versão vigente. Validade já vencida não é reaproveitada: a pessoa escolhe a nova.
 function beginResend(proposal:Proposal){
  if(pending.current)return;
  setResending({id:proposal.id,version:proposal.version});setForm({amount:proposal.amount.replace('.',','),description:proposal.description,estimatedDuration:proposal.estimated_duration,validUntil:proposal.valid_until>=todayInPalmas()?proposal.valid_until:''});setErrors({});setError('');setCardError(null);
 }
 function cancelResend(){setResending(null);setForm(empty);setErrors({});setError('');}
 // Depois de uma recusa com código: recarrega a lista e deixa a mensagem no cartão da proposta (ou no topo, se ela saiu da lista).
 async function refused(proposalId:string,text:string,changed=false){
  const run=generation.current,fresh=await load();
  if(run!==generation.current)return;
  if(fresh?.proposals.some(item=>item.id===proposalId))setCardError({id:proposalId,text,changed});else setError(text);
 }
 async function submit(){
  if(!session||!validId||pending.current)return;
  const next:Record<string,string>={};
  for(const key of Object.keys(form) as (keyof typeof form)[])if(!form[key].trim())next[key]=key==='validUntil'&&resending?'Escolha a nova validade.':'Preencha este campo.';
  if(form.validUntil&&form.validUntil<todayInPalmas())next.validUntil='Escolha hoje ou uma data futura.';
  setErrors(next);setError('');if(Object.keys(next).length)return;
  const run=generation.current,target=resending;pending.current=true;setBusy(true);setCardError(null);Keyboard.dismiss();
  let done=false,conflict='';
  try{
   const result=await api(`/requests/${encodeURIComponent(id)}/proposals${target?'/'+encodeURIComponent(target.id):''}`,{method:target?'PATCH':'POST',headers:{Authorization:`Bearer ${session.token}`,'Content-Type':'application/json'},body:JSON.stringify(target?{...form,version:target.version}:form)});
   if(run!==generation.current)return;
   toast.success(typeof result?.message==='string'?result.message:target?'Proposta reenviada!':'Proposta enviada!');
   setSent(true);setResending(null);setForm(empty);done=true;
  }catch(failure){
   if(run!==generation.current)return;
   if(failure instanceof ApiError&&failure.status===401)setSession(null);
   else if(target&&refusal(failure))conflict=refusal(failure)!.message;
   else{if(failure instanceof ApiError&&failure.fields)setErrors(failure.fields);setError(failure instanceof Error?failure.message:'Não foi possível enviar a proposta.');}
  }finally{if(run===generation.current){pending.current=false;setBusy(false);}}
  if(done)await load();
  else if(conflict&&target){
   // Tela desatualizada ou reenvio não permitido: recarrega. Se ainda dá para reenviar, o formulário continua aberto com
   // o que foi digitado e passa a valer a versão nova; se não dá, fecha e a mensagem (com o status atual) fica no cartão.
   const fresh=await load();
   if(run!==generation.current)return;
   const current=fresh?.proposals.find(item=>item.id===target.id);
   if(current?.can_resend){setResending({id:current.id,version:current.version});setError(`${conflict} A lista já foi atualizada: confira os dados e reenvie.`);}
   else{cancelResend();if(current)setCardError({id:current.id,text:conflict,changed:false});else setError(conflict);}
  }
 }
 async function accept(proposal:Proposal){
  if(!session||pending.current||data?.role!=='customer'||!proposal.can_accept)return;
  const run=generation.current;pending.current=true;setBusy(true);setError('');setCardError(null);
  let accepted=false,conflict:ApiError|null=null;
  try{
   const result=await api(`/requests/${encodeURIComponent(id)}/proposals/${encodeURIComponent(proposal.id)}/accept`,{method:'POST',headers:{Authorization:`Bearer ${session.token}`,'Content-Type':'application/json'},body:JSON.stringify({version:proposal.version})});
   if(run!==generation.current)return;
   setData(old=>old?{...old,request:{...old.request,status:'Aceita'},proposals:old.proposals.map(item=>({...item,can_accept:false,status:item.id===proposal.id?'Aceita':item.can_accept?'Não selecionada':item.status}))}:old);
   toast.success(typeof result?.message==='string'?result.message:'Proposta aceita!');accepted=true;
  }catch(failure){
   if(run!==generation.current)return;
   if(failure instanceof ApiError&&failure.status===401)setSession(null);
   else if(refusal(failure))conflict=refusal(failure);
   else setError(failure instanceof Error?failure.message:'Não foi possível confirmar o aceite. Atualize as propostas para conferir o resultado.');
  }finally{if(run===generation.current){pending.current=false;setBusy(false);}}
  if(accepted)await load();
  // Validade encerrada, proposta retirada ou reenviada enquanto o cliente olhava: mostra o motivo e a lista atual.
  else if(conflict)await refused(proposal.id,conflict.message,conflict.code==='PROPOSAL_VERSION_CHANGED');
 }
 function confirmAcceptance(proposal:Proposal){
  if(pending.current)return;
  const run=generation.current;
  Alert.alert('Aceitar esta proposta?',`${proposal.provider_name} · ${money(proposal.amount)}\nAs demais propostas pendentes deste pedido ficarão como Não selecionadas.`,[
   {text:'Voltar',style:'cancel'},
   {text:'Confirmar aceite',onPress:()=>{if(run===generation.current)void accept(proposal);}},
  ]);
 }
 async function withdraw(proposal:Proposal){
  if(!session||pending.current||data?.role!=='provider'||!proposal.can_withdraw)return;
  const run=generation.current;pending.current=true;setBusy(true);setError('');setCardError(null);
  let changed=false,conflict='';
  try{
   await api(`/requests/${encodeURIComponent(id)}/proposals/${encodeURIComponent(proposal.id)}/withdraw`,{method:'POST',headers:{Authorization:`Bearer ${session.token}`,'Content-Type':'application/json'},body:JSON.stringify({version:proposal.version})});
   if(run!==generation.current)return;
   setData(old=>old?{...old,proposals:old.proposals.map(item=>item.id===proposal.id?{...item,status:'Retirada',can_resend:false,can_withdraw:false}:item)}:old);
   cancelResend();toast.success('Proposta retirada. Ela continuará no seu histórico.');changed=true;
  }catch(failure){
   if(run!==generation.current)return;
   if(failure instanceof ApiError&&failure.status===401)setSession(null);
   else if(refusal(failure))conflict=refusal(failure)!.message;
   else setError(failure instanceof Error?failure.message:'Não foi possível retirar a proposta. Atualize para conferir o resultado.');
  }finally{if(run===generation.current){pending.current=false;setBusy(false);}}
  if(changed)await load();
  else if(conflict)await refused(proposal.id,conflict);
 }
 // Puxar para atualizar recarrega pedido e propostas; um reenvio em andamento continua aberto.
 const refresh=useCallback(()=>load(1,true),[load]);
 const pull=usePullRefresh(validId?refresh:undefined);
 function confirmWithdrawal(proposal:Proposal){
  if(pending.current)return;const run=generation.current;
  Alert.alert('Retirar esta proposta?','O cliente não poderá aceitá-la. O registro continuará no histórico e não poderá ser reenviado para este pedido.',[
   {text:'Voltar',style:'cancel'},
   {text:'Retirar proposta',style:'destructive',onPress:()=>{if(run===generation.current)void withdraw(proposal);}},
  ]);
 }
 if(!session)return <Redirect href="/entrar"/>;
 const provider=data?.role==='provider';
 const formOpen=!!data&&provider&&data.request.status==='Aberta'&&(!!resending||(!data.proposals.length&&!sent));
 const versionsFrom=from==='history'?'history' as const:undefined;
 // Aceite, retirada e andamento mudam o status com a tela aberta: as pílulas pulsam (StatusBadge) e os cartões se
 // reacomodam com transição de layout (reflow) em vez de pular.
 return <SafeAreaView style={styles.safe}><ListEntrance ready={!!data}><ScrollView {...pull.props} ref={scroll} contentContainerStyle={[flow.page,{paddingBottom:64}]} automaticallyAdjustKeyboardInsets keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} keyboardShouldPersistTaps="handled">
  <BackButton href={from==='history'?'/historico':'/solicitacoes'} label={from==='history'?'Meu histórico':'Meus pedidos'} />
  <WorkflowHeading eyebrow="CADA DETALHE FAZ DIFERENÇA" title={provider?'Sua proposta':'Propostas recebidas'} description={provider?'Confira o pedido e apresente o que você pode oferecer.':'Compare as condições e escolha quem vai ajudar você.'}/>
  {!validId?<Text style={s.error}>Solicitação inválida. Volte à lista e tente novamente.</Text>:null}
  {data?<StaggerItem index={0} reflow><View style={flow.card}><Text accessibilityRole="header" style={flow.cardTitle}>{data.request.category}</Text><Text style={flow.field}>{data.request.neighborhood_label??data.request.neighborhood}</Text><RemovedNote removed={data.request.customer_removed} name={data.request.customer_name}/><Text style={flow.description}>{data.request.description}</Text><StatusBadge status={data.request.status}/><Text style={flow.note}>Publicado em {new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Araguaina'}).format(new Date(data.request.created_at))} · {data.request.city} – {data.request.state}</Text>{data.request.status==='Cancelada'?<><CancellationNote cancellation={data.request.cancellation}/><Text style={flow.note}>Este pedido foi encerrado. As propostas ficam disponíveis para consulta.</Text></>:null}{data.request.can_chat?<Link href={{pathname:'./chat',params:{id:data.request.id,status:data.request.status}}} style={styles.back}>Conversar sobre o atendimento ↗</Link>:null}<ServiceProgressActions request={data.request} role={data.role} from={from==='history'?'history':undefined} disabled={busy} onReload={refresh} onUpdated={updated=>setData(old=>old?{...old,request:{...old.request,...updated}}:old)}/>{canCancel(data.request)?<CancelLink id={data.request.id} role={data.role} from={from==='history'?'history':undefined} disabled={busy}/>:null}</View></StaggerItem>:null}
  {error&&!formOpen?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
  {busy&&!data?<Skeleton shape="detail"/>:null}
  {data?.proposals.map((proposal,index)=>{
   // Na janela de instantes em que a validade venceu e a API ainda não gravou, a proposta "Pendente" já vale como expirada.
   const expired=proposal.status==='Expirada'||(proposal.expired&&proposal.status==='Pendente');
   const refusedHere=cardError?.id===proposal.id?cardError:null;
   return <StaggerItem key={proposal.id} index={index+1} reflow><View style={[flow.card,proposal.status==='Aceita'&&flow.acceptedCard]}>
   <Text style={flow.cardTitle}>{proposal.provider_name}</Text><Link href={{pathname:'./perfil-prestador',params:{id:proposal.provider_id}}} style={styles.back}>Ver perfil e avaliações ↗</Link><Text style={s.price}>{money(proposal.amount)}</Text>
   <View style={s.statusRow}><StatusBadge status={expired?'Expirada':proposal.status}/>{proposal.version>1?<Text style={flow.note}>Versão {proposal.version}</Text>:null}</View>
   <Text style={flow.description}>{proposal.description}</Text><Text style={s.label}>Prazo estimado</Text><Text style={flow.field}>{proposal.estimated_duration}</Text>
   <Text style={s.label}>Válida até</Text><Text style={flow.field}>{shortDate(proposal.valid_until)}</Text>
   <Text style={flow.note}>{proposal.version>1?'Versão enviada':'Enviada'} em {dateTime(proposal.sent_at??proposal.updated_at??proposal.created_at)}</Text>
   {hasVersions(proposal.has_previous_versions,proposal.versions_count)?<VersionsLink requestId={data.request.id} proposalId={proposal.id} count={proposal.versions_count} from={versionsFrom} provider={proposal.provider_name} disabled={busy}/>:null}
   {refusedHere?<View accessible accessibilityRole="alert" style={s.refused}><Text style={s.refusedText}>{refusedHere.text}</Text>{refusedHere.changed?<Text style={s.refusedText}>As condições mudaram: o prestador reenviou a proposta. O cartão já mostra a versão {proposal.version}. Confira valor, prazo e validade antes de aceitar.</Text>:null}</View>:null}
   {expired?<View style={s.expired}>
    <Text style={s.expiredText}>A validade terminou em {shortDate(proposal.valid_until)}.{provider?proposal.can_resend?' Reenvie para voltar a concorrer.':'':' Ela não pode ser aceita, a menos que o prestador a reenvie com nova validade.'}</Text>
    {proposal.can_resend&&!resending?<PressableScale accessibilityRole="button" accessibilityLabel="Reenviar proposta expirada" disabled={busy} accessibilityState={{disabled:busy}} style={s.button} onPress={()=>beginResend(proposal)}><Text style={s.buttonText}>Reenviar proposta</Text></PressableScale>:null}
   </View>:null}
   {!resending&&((proposal.can_resend&&!expired)||proposal.can_withdraw)?<View style={s.group}>
    {proposal.can_resend&&!expired?<PressableScale accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy}} style={s.button} onPress={()=>beginResend(proposal)}><Text style={s.buttonText}>Reenviar proposta</Text></PressableScale>:null}
    {proposal.can_withdraw?<PressableScale accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy}} style={s.secondary} onPress={()=>confirmWithdrawal(proposal)}><Text style={s.error}>Retirar proposta</Text></PressableScale>:null}
   </View>:null}
   {proposal.can_accept?<PressableScale accessibilityRole="button" accessibilityLabel={`Aceitar proposta de ${proposal.provider_name}`} accessibilityState={{disabled:busy,busy}} disabled={busy} style={[s.button,s.acceptButton]} onPress={()=>confirmAcceptance(proposal)}><Text style={[s.buttonText,s.acceptText]}>Aceitar proposta</Text></PressableScale>:null}
  </View></StaggerItem>;})}
  {data?.role==='customer'&&!data.proposals.length?<Text style={flow.description}>{data.request.status==='Aberta'?'Você ainda não recebeu propostas para este pedido.':'Não há propostas para mostrar neste pedido.'}</Text>:null}
  {formOpen?<Reflow><View onLayout={()=>{if(resending)scroll.current?.scrollToEnd({animated:true});}} style={[s.form,flow.card]}>
   <Text accessibilityRole="header" style={flow.cardTitle}>{resending?'Reenviar proposta':'Enviar proposta'}</Text>{resending?<Text style={flow.note}>A versão atual (versão {resending.version}) fica guardada como “Substituída” e o cliente é avisado dos novos dados.</Text>:null}
   {([{key:'amount',label:'Valor total (R$)',placeholder:'Ex.: 150,00',max:9},{key:'description',label:'Descrição da proposta',placeholder:'Descreva o que está incluído no serviço',max:3000},{key:'estimatedDuration',label:'Prazo estimado',placeholder:'Ex.: 2 dias após combinar o início',max:200}] as const).map(field=><View key={field.key} style={s.group}><Text style={s.label}>{field.label}</Text><FieldInput invalid={!!errors[field.key]} accessibilityLabel={field.label} editable={!busy} value={form[field.key]} onChangeText={text=>change(field.key,text)} maxLength={field.max} placeholder={field.placeholder} placeholderTextColor={colors.placeholder} keyboardType={field.key==='amount'?'decimal-pad':'default'} multiline={field.key==='description'} scrollEnabled={false} style={[s.input,errors[field.key]&&s.invalid]}/><FieldError style={s.error}>{errors[field.key]}</FieldError></View>)}
   <View style={s.group}><Text style={s.label}>{resending?'Nova validade da proposta':'Validade da proposta'}</Text><DateField label="validade da proposta" title="Até quando vale a proposta?" hint="Escolha o último dia em que o cliente pode aceitar: hoje ou uma data futura." value={form.validUntil} onChange={value=>change('validUntil',value)} disabled={busy} error={errors.validUntil}/><FieldError style={s.error}>{errors.validUntil}</FieldError><Text style={flow.note}>Válida até o fim do dia escolhido, no horário de Palmas.</Text></View>
   {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
   <PressableScale accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} style={s.button} onPress={submit}><Text style={s.buttonText}>{busy?'Enviando…':resending?'Reenviar proposta':'Enviar proposta'}</Text></PressableScale>
   {resending?<PressableScale accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy}} style={s.secondary} onPress={cancelResend}><Text style={s.label}>Cancelar reenvio</Text></PressableScale>:null}
  </View></Reflow>:null}
  {data?.hasMore?<PressableScale accessibilityRole="button" disabled={busy} style={s.secondary} onPress={()=>load(data.page+1)}><Text style={s.label}>Carregar mais propostas</Text></PressableScale>:null}
 </ScrollView></ListEntrance></SafeAreaView>;
}
const useS = themed(colors => StyleSheet.create({acceptButton:{backgroundColor:colors.accent,borderWidth:1,borderColor:colors.link,justifyContent:'center'},acceptText:{color:colors.onAccent},form:{gap:24},group:{gap:10},label:{fontSize:16,fontWeight:'600',color:colors.text},price:{fontSize:32,lineHeight:39,letterSpacing:-0.8,fontWeight:'800',color:colors.onAccentSoft,backgroundColor:colors.accentSoft,padding:14,borderRadius:16,alignSelf:'flex-start'},input:{minHeight:58,borderWidth:1,borderColor:colors.borderStrong,borderRadius:16,padding:16,fontSize:17,color:colors.text},invalid:{borderColor:colors.danger,borderWidth:2},error:{color:colors.danger,fontSize:16,lineHeight:24},button:{backgroundColor:colors.primary,padding:18,minHeight:56,borderRadius:16,alignItems:'center'},buttonText:{color:colors.onPrimary,fontSize:17,fontWeight:'700'},secondary:{minHeight:48,padding:14,justifyContent:'center',borderWidth:1,borderColor:colors.border,borderRadius:16,alignItems:'center'},statusRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:10},expired:{backgroundColor:colors.dangerSoft,borderRadius:16,padding:14,gap:12},expiredText:{fontSize:15,lineHeight:22,fontWeight:'600',color:colors.text},refused:{borderWidth:1,borderColor:colors.danger,borderRadius:16,padding:14,gap:8},refusedText:{fontSize:15,lineHeight:22,color:colors.danger}}));
