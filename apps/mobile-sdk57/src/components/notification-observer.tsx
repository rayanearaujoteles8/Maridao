import {createContext,useContext,useEffect,useState,type PropsWithChildren} from 'react';
import {AppState} from 'react-native';
import {api,ApiError} from '@/lib/api';
import {useSession} from './session';
import {useToast} from './toast';

export type Notice={id:string;request_id:string|null;title:string;created_at:string;read_at:string|null};
type Updates={token:string;notices:Notice[];unread:number};
const Context=createContext<Updates|null>(null);
// Consulta incremental em primeiro plano. Avisos antigos não reaparecem ao entrar.
// A retomada consulta imediatamente; falhas de conexão são tentadas no próximo ciclo.
export function NotificationObserver({children}:PropsWithChildren){
 const {session,setSession}=useSession();const toast=useToast();
 const [updates,setUpdates]=useState<Updates|null>(null);
 useEffect(()=>{
  if(!session||session.role==='admin'||session.mustChangePassword)return;
  let active=true,pending=false,cursor:string|undefined;
  const token=session.token;
  async function poll(){
   if(!active||pending||AppState.currentState!=='active')return;
   pending=true;
   try{
    const initial=cursor===undefined;
    const result=await api(initial?'/notifications':'/notifications?after='+cursor,{headers:{Authorization:`Bearer ${token}`}});
    if(!active)return;
    const notices=result.notifications as Notice[];
    if(initial){cursor=notices[0]?.id??'0';setUpdates({token,notices:[],unread:result.unread});}
    else{
     if(notices.length){cursor=notices[notices.length-1].id;toast.info(notices.length===1?notices[0].title:`Você recebeu ${notices.length} novas notificações.`);}
     setUpdates({token,notices,unread:result.unread});
    }
   }catch(error){if(active&&error instanceof ApiError&&error.status===401)setSession(null);}
   finally{pending=false;}
  }
  void poll();const timer=setInterval(()=>void poll(),10_000);
  const subscription=AppState.addEventListener('change',state=>{if(state==='active')void poll();});
  return()=>{active=false;clearInterval(timer);subscription.remove();};
 },[session,toast,setSession]);
 return <Context.Provider value={updates?.token===session?.token?updates:null}>{children}</Context.Provider>;
}
export const useNotificationUpdates=()=>useContext(Context);
