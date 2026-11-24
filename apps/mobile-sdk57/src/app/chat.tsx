import {useEffect,useRef,useState,type ComponentRef} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {Text,TextInput,View,type ScrollView} from 'react-native';
import Animated,{Easing,useReducedMotion,withTiming} from 'react-native-reanimated';
import * as Crypto from 'expo-crypto';
import {PrivateScreen,usePrivateResource,Feedback,Button,useUi} from '@/components/private-screen';
import {useStyles} from '@/components/access-screen';
import {useSession} from '@/components/session';
import {REMOVED_NAME,type Counterpart} from '@/components/removed-user';
import {api} from '@/lib/api';
import { useTheme } from '@/theme';
import {usePolling} from '@/hooks/use-polling';
import {mergeChat,type ChatData,type ChatMessage as Message} from '@/lib/live-updates';
type Data=ChatData<Counterpart|undefined>;
// Nome de quem escreveu as mensagens que não são minhas: "Usuário removido" quando o cliente excluiu a conta; o nome do
// prestador quando quem lê é o cliente; sem nome (a API não entrega o do cliente ao prestador), o rótulo de sempre.
const otherName=(counterpart?:Counterpart)=>counterpart?.removed?counterpart.name||REMOVED_NAME:counterpart?.name||'Outra parte do atendimento';

// Movimento da conversa: só a mensagem que CHEGA com a conversa já na tela (a que acabei de enviar, ou as que vieram ao
// puxar para atualizar) entra com opacidade + 8 pt de subida (220 ms), e a tela rola até o fim, onde ela está.
// A primeira carga e as "mensagens anteriores" aparecem paradas e não mexem na rolagem.
// "Reduzir movimento": a mensagem aparece direto e a rolagem vai ao fim sem animação.
const NONE:ReadonlySet<string>=new Set();
// Chegaram depois da última mensagem que já estava na tela. Sem lista anterior (primeira carga), ou se a última
// conhecida não está na lista nova, nada conta como chegada.
function arrivals(before:Message[]|null,now:Message[]|null):ReadonlySet<string>{
 if(!before||!now)return NONE;
 const last=before[before.length-1];
 const from=last?now.findIndex(m=>m.id===last.id):-1;
 if(last&&from<0)return NONE;
 const ids=now.slice(from+1).map(m=>m.id);
 return ids.length?new Set(ids):NONE;
}
const out=Easing.out(Easing.cubic);
function messageIn(){
 'worklet';
 return {initialValues:{opacity:0,transform:[{translateY:8}]},animations:{opacity:withTiming(1,{duration:220,easing:out}),transform:[{translateY:withTiming(0,{duration:220,easing:out})}]}};
}
// A entrada vale só na montagem do cartão: mensagem que já está na tela não se move de novo.
function Bubble({m,fresh,other}:{m:Message;fresh:boolean;other:string}){
 const styles=useStyles();const {colors}=useTheme();const ui=useUi();const reduced=useReducedMotion();
 return <Animated.View entering={fresh&&!reduced?messageIn:undefined} style={[ui.card,{backgroundColor:m.mine?colors.accentWash:colors.surfaceRaised}]}><Text style={ui.label}>{m.mine?'Você':other}</Text><Text selectable style={styles.note}>{m.message}</Text><Text style={styles.note}>{new Date(m.created_at).toLocaleString('pt-BR')}</Text></Animated.View>;
}
export default function Chat(){const styles=useStyles();const {colors}=useTheme();const ui=useUi();const reduced=useReducedMotion();const {id,status}=useLocalSearchParams<{id:string;status?:string}>(),path=`/requests/${encodeURIComponent(id??'')}/messages`,r=usePrivateResource<Data>(path),{session}=useSession();const [message,setMessage]=useState(''),[draftId,setDraftId]=useState<string|null>(null);
 const scroll=useRef<ComponentRef<typeof ScrollView>>(null);
 // RNF01.1: mensagem da outra parte chega em até 10 s com a conversa aberta. A consulta não liga o "Aguarde…", não trava o
 // campo e só acrescenta o que é novo, então o texto que está sendo digitado fica como está.
 usePolling(()=>r.poll(mergeChat));
 const messages=r.data?.messages??null;
 // Estado derivado na renderização: os cartões da mesma atualização já nascem sabendo se são chegada.
 const [known,setKnown]=useState<Message[]|null>(null),[fresh,setFresh]=useState(NONE);
 if(messages!==known){setKnown(messages);setFresh(arrivals(known,messages));}
 useEffect(()=>{
  if(!fresh.size)return;
  const frame=requestAnimationFrame(()=>scroll.current?.scrollToEnd({animated:!reduced}));
  return()=>cancelAnimationFrame(frame);
 },[fresh,reduced]);
 async function send(){const clientId=draftId??Crypto.randomUUID();setDraftId(clientId);const result=await r.perform(path,{clientId,message},'POST');if(result){setMessage('');setDraftId(null);await r.reload();}else void recheck();}
 // Envio recusado (a API responde 409 "Esta conversa está encerrada para novas mensagens." quando o atendimento foi
 // concluído ou cancelado, inclusive pela exclusão da conta do cliente): confere a conversa de novo e, se ela fechou, troca
 // o campo pelo aviso de leitura. O erro da API continua na tela; outras falhas (rede, limite) não mexem em nada.
 async function recheck(){if(!session)return;try{const now:Data=await api(path,{headers:{Authorization:`Bearer ${session.token}`}});if(!now.canSend||now.counterpart?.removed)r.setData(now);}catch{}}
 const removed=r.data?.counterpart?.removed===true,other=otherName(r.data?.counterpart);
 async function older(){const before=r.data?.messages[0]?.id;if(!before)return;const result=await r.perform(path+'?before='+before);if(result)r.setData(old=>old?{...result,messages:[...result.messages,...old.messages]}:result);}
 return <PrivateScreen title="Conversa do atendimento" backHref={{pathname:'/propostas',params:{id}}} backLabel="Voltar ao atendimento" onRefresh={r.refresh} scrollRef={scroll}><Feedback {...r}/>{r.data?.hasMore?<Button secondary label="Carregar mensagens anteriores" disabled={r.busy} onPress={()=>void older()}/>:null}{r.data?.messages.length===0?<Text style={styles.note}>Combine os detalhes por aqui. Não compartilhe senhas nem documentos.</Text>:null}{r.data?.messages.map(m=><Bubble key={m.id} m={m} fresh={fresh.has(m.id)} other={other}/>)}{r.data?.canSend&&!removed?<View style={ui.group}><TextInput placeholderTextColor={colors.placeholder} accessibilityLabel="Mensagem para o atendimento" value={message} onChangeText={value=>{setMessage(value);setDraftId(null);}} editable={!r.busy} style={ui.input} multiline maxLength={2000} placeholder="Escreva sua mensagem"/><Button label="Enviar mensagem" disabled={r.busy||!message.trim()} onPress={()=>void send()}/></View>:r.data?<Text accessibilityRole="text" style={styles.note}>{removed?'O cliente excluiu a conta. A conversa fica só para leitura.':status==='Cancelada'?'Atendimento cancelado: a conversa fica só para leitura.':status==='Concluída'?'Atendimento concluído: a conversa fica só para leitura.':'Atendimento encerrado: a conversa fica só para leitura.'}</Text>:null}</PrivateScreen>;
}
