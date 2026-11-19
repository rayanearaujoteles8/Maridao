import {useCallback,useRef,useState} from 'react';
import { PressableScale } from '@/components/pressable-scale';
import {Link,Redirect,useFocusEffect,useScrollToTop} from 'expo-router';
import {FlatList,Keyboard,Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useCatalog} from '@/hooks/use-catalog';
import {SelectionField,CatalogNotice} from '@/components/selection-field';
import {useStyles} from '@/components/access-screen';
import {WorkflowHeading,useFlow} from '@/components/workflow-screen';
import {TAB_EDGES} from '@/components/tab-bar';
import {useSession} from '@/components/session';
import {api,ApiError} from '@/lib/api';
import {usePullRefresh} from '@/components/pull-refresh';
import { ListEntrance, StaggerItem } from '@/components/list-entrance';
import { Skeleton } from '@/components/skeleton';
import { themed } from '@/theme';

type Provider={id:string;name:string;categories:string[];specialties:string[];neighborhoods:string[];coverageLabels?:string[];availability:string;city:string;state:string};
type Filters={category:string;neighborhood:string};
export default function SearchScreen(){
 const s=useS();const styles=useStyles();const flow=useFlow();
 const catalog=useCatalog();
 const {session,setSession}=useSession();
 const [category,setCategory]=useState(''),[neighborhood,setNeighborhood]=useState('');
 const [providers,setProviders]=useState<Provider[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const [page,setPage]=useState(1),[more,setMore]=useState(false),[expanded,setExpanded]=useState<string|null>(null);
 const filters=useRef<Filters>({category:'',neighborhood:''});
 const pending=useRef(false),generation=useRef(0),list=useRef<FlatList<Provider>>(null);
 // Aba: fica montada. shownFor = sessão cujos dados estão na tela; pages = quantas páginas já foram carregadas.
 const shownFor=useRef<string|null>(null),pages=useRef(1);
 useScrollToTop(list);
 // keep: recarga do gesto de puxar; não liga o `busy` e a lista atual fica na tela até a resposta chegar.
 const search=useCallback(async(nextPage=1,nextFilters?:Filters,keep=false)=>{
  if(pending.current||!session)return;
  const run=generation.current;
  pending.current=true;if(!keep){setBusy(true);Keyboard.dismiss();}setError('');
  if(nextPage===1){if(nextFilters)filters.current=nextFilters;if(!keep){setProviders([]);setMore(false);setExpanded(null);}}
  try{
   const query=new URLSearchParams({...filters.current,page:String(nextPage)});
   const result=await api('/providers?'+query.toString(),{headers:{Authorization:`Bearer ${session.token}`}});
   if(run!==generation.current)return;
   setProviders(old=>nextPage===1?result.providers:[...old,...(result.providers as Provider[]).filter(item=>!old.some(previous=>previous.id===item.id))]);
   setPage(result.page);setMore(result.hasMore);pages.current=result.page;shownFor.current=session.token;
  }catch(failure){
   if(run!==generation.current)return;
   if(failure instanceof ApiError&&failure.status===401)setSession(null);
   else setError(failure instanceof Error?failure.message:'Não foi possível carregar os profissionais.');
  }finally{if(run===generation.current){pending.current=false;setBusy(false);}}
 },[session,setSession]);
 // Volta do foco (troca de aba ou retorno de um perfil): recarrega em silêncio as páginas já abertas, com os mesmos
 // filtros, sem apagar a lista nem perder a rolagem. Só a primeira carga (ou a de outra conta) começa do zero.
 const resync=useCallback(async()=>{
  if(pending.current||!session)return;
  const run=generation.current;pending.current=true;
  try{
   let all:Provider[]=[],last:{page:number;hasMore:boolean}|null=null;
   for(let next=1;next<=pages.current;next++){
    const query=new URLSearchParams({...filters.current,page:String(next)});
    const result=await api('/providers?'+query.toString(),{headers:{Authorization:`Bearer ${session.token}`}});
    if(run!==generation.current)return;
    const seen=all;all=[...seen,...(result.providers as Provider[]).filter(item=>!seen.some(previous=>previous.id===item.id))];last=result;
    if(!result.hasMore)break;
   }
   if(last){setProviders(all);setPage(last.page);setMore(last.hasMore);pages.current=last.page;setError('');}
  }catch(failure){
   if(run!==generation.current)return;
   if(failure instanceof ApiError&&failure.status===401)setSession(null);
   else setError(failure instanceof Error?failure.message:'Não foi possível carregar os profissionais.');
  }finally{if(run===generation.current){pending.current=false;setBusy(false);}}
 },[session,setSession]);
 useFocusEffect(useCallback(()=>{
  generation.current++;pending.current=false;
  if(session&&shownFor.current===session.token)void resync();
  else void search(1);
  return()=>{generation.current++;pending.current=false;};
 },[search,resync,session]));
 const pull=usePullRefresh(useCallback(()=>search(1,undefined,true),[search]));
 if(!session)return <Redirect href="/entrar"/>;
 return <SafeAreaView edges={TAB_EDGES} style={styles.safe}>
  <ListEntrance ready={!busy}><FlatList {...pull.props} ref={list} data={providers} keyExtractor={item=>item.id} contentContainerStyle={flow.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
   ListHeaderComponent={<View style={s.section}>
    <WorkflowHeading eyebrow="QUEM SABE FAZER ESTÁ POR AQUI" title="Profissionais" description="Conheça quem oferece serviços em Palmas e encontre ajuda para o que você precisa."/>
    <View style={flow.info}>
     <Text accessibilityRole="header" style={flow.sectionTitle}>Encontre sua mãozinha</Text>
     {!catalog.data?<CatalogNotice error={catalog.error} retry={catalog.retry}/>:null}
     <View style={s.group}><Text style={s.label}>Categoria de serviço</Text><SelectionField label="Categoria de serviço" options={catalog.data?.services??[]} values={category?[category]:[]} onChange={selected=>setCategory(selected[0]??'')} placeholder="Todas as categorias" disabled={busy||!catalog.data}/></View>
     <View style={s.group}><Text style={s.label}>Bairro ou quadra do atendimento</Text><SelectionField label="Bairro ou quadra do atendimento" options={catalog.data?.neighborhoods??[]} values={neighborhood?[neighborhood]:[]} onChange={selected=>setNeighborhood(selected[0]??'')} placeholder="Toda Palmas" disabled={busy||!catalog.data}/></View>
     <PressableScale accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} style={s.button} onPress={()=>search(1,{category,neighborhood})}><Text style={s.buttonText}>{busy?'Carregando…':'Buscar profissionais ↗'}</Text></PressableScale>
     {category||neighborhood?<Pressable accessibilityRole="button" disabled={busy} style={s.toggle} onPress={()=>{setCategory('');setNeighborhood('');void search(1,{category:'',neighborhood:''});}}><Text style={s.label}>Limpar filtros</Text></Pressable>:null}
    </View>
    <Text accessibilityRole="header" style={flow.sectionTitle}>Profissionais cadastrados</Text>
    {error?<View style={flow.empty}><Text accessibilityRole="alert" style={s.error}>{error}</Text><Pressable accessibilityRole="button" disabled={busy} style={s.toggle} onPress={()=>search(1)}><Text style={s.label}>Tentar novamente</Text></Pressable></View>:null}
   </View>}
   ListEmptyComponent={busy?<Skeleton shape="cards"/>:!error?<View style={flow.empty}><Text style={flow.cardTitle}>Nenhum profissional encontrado.</Text><Text style={flow.description}>Tente outra categoria ou localidade. Novos cadastros aparecerão por aqui.</Text></View>:undefined}
   renderItem={({item:provider,index})=><StaggerItem index={index}><View style={flow.card}>
    <View style={s.identity}><View style={s.avatar} accessible={false}><Text style={s.initial}>{provider.name.trim().slice(0,1).toLocaleUpperCase('pt-BR')}</Text></View><View style={s.nameBlock}><Text accessibilityRole="header" style={flow.cardTitle}>{provider.name}</Text><Text style={flow.field}>{provider.city} – {provider.state}</Text></View></View>
    <View style={s.tags}>{provider.categories.map(category=><Text key={category} style={s.tag}>{category}</Text>)}</View>
    <Text style={flow.description}>{provider.specialties.slice(0,3).join(' · ')}{provider.specialties.length>3?'…':''}</Text>
    <Text style={s.label}>Onde atende</Text><Text numberOfLines={expanded===provider.id?undefined:2} style={flow.field}>{(provider.coverageLabels??provider.neighborhoods).join(', ')}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={(expanded===provider.id?'Fechar informações de ':'Ver informações de ')+provider.name} accessibilityState={{expanded:expanded===provider.id}} style={s.toggle} onPress={()=>setExpanded(old=>old===provider.id?null:provider.id)}><Text style={s.profileLink}>{expanded===provider.id?'Menos informações −':'Ver informações profissionais ↗'}</Text></Pressable>
    <Link href={{pathname:'/perfil-prestador',params:{id:provider.id}}} style={styles.back}>Perfil e avaliações ↗</Link>{expanded===provider.id?<View style={flow.info}><Text style={s.label}>Especialidades</Text><Text style={flow.field}>{provider.specialties.join(', ')||'Não informadas'}</Text><Text style={s.label}>Disponibilidade informada</Text><Text style={flow.field}>{provider.availability}</Text></View>:null}
   </View></StaggerItem>}
   ListFooterComponent={more?<PressableScale accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} style={s.button} onPress={()=>search(page+1)}><Text style={s.buttonText}>{busy?'Carregando…':'Ver mais profissionais'}</Text></PressableScale>:undefined}
  /></ListEntrance>
 </SafeAreaView>;
}
const useS = themed(colors => StyleSheet.create({section:{gap:18},group:{gap:8},label:{fontSize:14,fontWeight:'600',color:colors.text},button:{backgroundColor:colors.primary,minHeight:52,padding:16,borderRadius:16,alignItems:'center'},buttonText:{color:colors.onPrimary,fontSize:16,fontWeight:'700'},toggle:{minHeight:46,justifyContent:'center'},profileLink:{fontSize:14,fontWeight:'700',color:colors.link},error:{color:colors.danger,fontSize:14,lineHeight:21},disabled:{opacity:0.6},identity:{flexDirection:'row',alignItems:'center',gap:12},nameBlock:{flex:1,gap:4},avatar:{width:48,height:48,borderRadius:24,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center'},initial:{fontSize:22,fontWeight:'800',color:colors.onAccent},tags:{flexDirection:'row',flexWrap:'wrap',gap:7},tag:{backgroundColor:colors.accentSoft,paddingHorizontal:10,paddingVertical:7,borderRadius:12,color:colors.onAccentSoft,fontSize:12,fontWeight:'600',flexShrink:1}}));
