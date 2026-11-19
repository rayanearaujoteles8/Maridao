import {useCallback,useRef,useState} from 'react';
import {RefreshControl,type AccessibilityActionEvent} from 'react-native';
import {useTheme} from '@/theme';

// "Puxar para atualizar", igual em todas as telas que carregam dados.
// Uso: const pull=usePullRefresh(carregar); <ScrollView {...pull.props}> ou <FlatList {...pull.props}>.
// - O indicador usa a cor da ação principal do tema: preto no claro, verde (#A1FF1D) no escuro.
// - `refreshing` é só do gesto: a tela decide o que mostrar no primeiro carregamento ("Aguarde…").
// - Leitor de tela: o contêiner rolável ganha a ação "Atualizar" (rotor de ações do VoiceOver / menu do TalkBack),
//   que chama a mesma função do gesto. Por isso não há botão "Atualizar" solto nas telas.
// Sem `onRefresh` (tela só de formulário) nada é ligado.
const ACTIONS=[{name:'refresh',label:'Atualizar'}] as const;
export function usePullRefresh(onRefresh?:()=>unknown){
 const {colors}=useTheme();
 const [refreshing,setRefreshing]=useState(false);
 const running=useRef(false);
 const run=useCallback(async()=>{
  if(!onRefresh||running.current)return;
  running.current=true;setRefreshing(true);
  try{await onRefresh();}finally{running.current=false;setRefreshing(false);}
 },[onRefresh]);
 const onAccessibilityAction=useCallback((event:AccessibilityActionEvent)=>{if(event.nativeEvent.actionName==='refresh')void run();},[run]);
 if(!onRefresh)return {refreshing:false,props:{}};
 return {refreshing,props:{
  refreshControl:<RefreshControl refreshing={refreshing} onRefresh={()=>void run()} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surfaceRaised}/>,
  accessibilityActions:ACTIONS,
  onAccessibilityAction,
 }};
}
