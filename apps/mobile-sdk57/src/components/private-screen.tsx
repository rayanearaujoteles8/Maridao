import {useCallback,useEffect,useRef,useState,type ComponentRef,type PropsWithChildren,type Ref} from 'react';
import {Redirect,useFocusEffect,type Href} from 'expo-router';
import {ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSession} from './session';
import {BackButton} from './back-button';
import {useToast} from './toast';
import {ToastHost,useIsSheet} from './toast-host';
import {useStyles} from './access-screen';
import {usePullRefresh} from './pull-refresh';
import {PressableScale} from './pressable-scale';
import {Skeleton,type SkeletonShape} from './skeleton';
import {api,ApiError} from '@/lib/api';
import { themed } from '@/theme';
// path nulo: nada é carregado ao focar (telas que só enviam formulário). fields/code repetem o último erro da API.
export function usePrivateResource<T>(path:string|null){
 const {session,setSession}=useSession();
 const [data,setData]=useState<T|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [fields,setFields]=useState<Record<string,string>>({}),[code,setCode]=useState('');
 const generation=useRef(0),pending=useRef(false),refreshRun=useRef(0);
 const toast=useToast();
 // Resultado de operação bem-sucedida: aviso em gota (o Feedback não repete a mensagem na tela).
 useEffect(()=>{if(message)toast.success(message);},[message,toast]);
 const perform=useCallback(async(url:string,body?:unknown,method='GET')=>{
  if(!session||pending.current)return null;
  const run=generation.current;refreshRun.current++;pending.current=true;setBusy(true);setError('');setMessage('');setFields({});setCode('');
  try{
   const result=await api(url,{method,headers:{Authorization:`Bearer ${session.token}`,...(method==='GET'?{}:{'Content-Type':'application/json'})},...(method==='GET'?{}:{body:JSON.stringify(body??{})})});
   return run===generation.current?result:null;
  }catch(e){if(run===generation.current){if(e instanceof ApiError&&e.status===401)setSession(null);else{if(e instanceof ApiError){setFields(e.fields??{});setCode(e.code??'');}setError(e instanceof Error?e.message:'Não foi possível concluir.');}}return null;}
  finally{if(run===generation.current){pending.current=false;setBusy(false);}}
 },[session,setSession]);
 const reload=useCallback(async()=>{if(path===null)return;const result=await perform(path);if(result)setData(result);},[path,perform]);
 // Recarga do gesto de puxar: não mexe em `busy` (sem "Aguarde…", sem travar botões) nem apaga `data`; o conteúdo fica
 // na tela até a resposta chegar. Qualquer operação iniciada no meio (perform) ou troca de foco descarta esta resposta.
 const refresh=useCallback(async()=>{
  if(path===null||!session||pending.current)return;
  const run=generation.current,mine=++refreshRun.current;
  const current=()=>run===generation.current&&mine===refreshRun.current;
  try{
   const result=await api(path,{headers:{Authorization:`Bearer ${session.token}`}});
   if(current()){setError('');setData(result);}
  }catch(e){if(current()){if(e instanceof ApiError&&e.status===401)setSession(null);else{if(e instanceof ApiError)setCode(e.code??'');setError(e instanceof Error?e.message:'Não foi possível atualizar.');}}}
 },[path,session,setSession]);
 useFocusEffect(useCallback(()=>{generation.current++;pending.current=false;setData(null);void reload();return()=>{generation.current++;pending.current=false;};},[reload]));
 return {data,setData,busy,error,message,setMessage,fields,setFields,code,perform,reload,refresh};
}
export function useLogout(){
 const {session,setSession}=useSession();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef(false);
 const logout=useCallback(async()=>{
  if(pending.current||!session)return;
  pending.current=true;setBusy(true);setError('');
  try{await api('/auth/logout',{method:'POST',headers:{Authorization:`Bearer ${session.token}`}});setSession(null);}
  catch(e){if(e instanceof ApiError&&e.status===401)setSession(null);else setError('Não foi possível encerrar a sessão no servidor. Confira a conexão e tente sair novamente.');}
  finally{pending.current=false;setBusy(false);}
 },[session,setSession]);
 return {logout,busy,error};
}
// back={false} esconde o voltar; backHref/backLabel trocam o destino (padrão: Minha conta).
// onRefresh liga o "puxar para atualizar" (passe o `refresh` do usePrivateResource); sem ele a tela não tem o gesto.
// scrollRef dá à tela o contêiner rolável (a conversa rola até a mensagem nova).
// Em folha (tela de ação que sobe de baixo) o gesto de puxar é o de fechar a folha, então o "puxar para atualizar" fica
// desligado ali: os dados são carregados a cada abertura. O aviso em gota é desenhado dentro da folha (ToastHost).
export function PrivateScreen({title,children,back=true,backHref='/minha-conta',backLabel='Minha conta',onRefresh,scrollRef}:PropsWithChildren<{title:string;back?:boolean;backHref?:Href;backLabel?:string;onRefresh?:()=>unknown;scrollRef?:Ref<ComponentRef<typeof ScrollView>>}>){const styles=useStyles();const {session}=useSession();const sheet=useIsSheet();const pull=usePullRefresh(sheet?undefined:onRefresh);if(!session)return <Redirect href="/entrar"/>;return <SafeAreaView style={styles.safe}><ScrollView {...pull.props} ref={scrollRef} contentContainerStyle={styles.page} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">{back?<BackButton href={backHref} label={backLabel}/>:null}<Text accessibilityRole="header" style={styles.title}>{title}</Text>{children}</ScrollView><ToastHost/></SafeAreaView>;}
// Regra única dos avisos: o SUCESSO de uma operação (a `message`) sai no aviso em gota (toast), sem repetir na tela;
// "Aguarde…" e o erro continuam aqui, junto do que a pessoa estava fazendo (erro não some sozinho).
// `skeleton`: a tela diz o formato do que está carregando ('cards' | 'rows' | 'detail' | 'form'). Enquanto ainda não há
// dados (`data` nulo — o `{...r}` do usePrivateResource já o entrega), a carga inicial mostra blocos-fantasma nesse
// formato; com dados na tela, `busy` é uma operação e continua com "Aguarde…".
export function Feedback({busy,error,message,skeleton,data}:{busy:boolean;error:string;message:string;skeleton?:SkeletonShape;data?:unknown}){const styles=useStyles();const ui=useUi();const toast=useToast();useEffect(()=>{if(message)toast.success(message);},[message,toast]);const loading=busy&&!!skeleton&&data==null;return <View>{loading?<Skeleton shape={skeleton}/>:busy?<Text style={styles.note}>Aguarde…</Text>:null}{error?<Text accessibilityRole="alert" style={ui.error}>{error}</Text>:null}</View>;}
// Toque: PressableScale (afunda e volta); desativado fica esmaecido pelo próprio PressableScale.
export function Button({label,onPress,disabled=false,secondary=false}:{label:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}){const ui=useUi();return <PressableScale accessibilityRole="button" disabled={disabled} accessibilityState={{disabled}} onPress={onPress} style={secondary?ui.secondary:ui.button}><Text style={secondary?ui.label:ui.buttonText}>{label}</Text></PressableScale>;}
export const useUi = themed(colors => StyleSheet.create({group:{gap:12},label:{fontSize:16,fontWeight:'600',color:colors.text},input:{minHeight:54,borderWidth:1,borderColor:colors.borderStrong,borderRadius:14,padding:14,fontSize:17,color:colors.text},button:{minHeight:54,backgroundColor:colors.primary,borderRadius:16,padding:16,alignItems:'center',justifyContent:'center'},buttonText:{fontSize:16,fontWeight:'700',color:colors.onPrimary},secondary:{minHeight:48,padding:14,borderWidth:1,borderColor:colors.border,borderRadius:14,alignItems:'center',justifyContent:'center'},card:{gap:12,padding:18,borderWidth:1,borderColor:colors.border,borderRadius:20},error:{color:colors.danger,fontSize:16,lineHeight:23},success:{backgroundColor:colors.accentSoft,padding:14,borderRadius:14,fontSize:16,lineHeight:23,color:colors.onAccentSoft}}));
