import {router} from 'expo-router';
import { PressableScale } from '@/components/pressable-scale';
import {StyleSheet,Text,View} from 'react-native';
import {usePrivateResource,Feedback,Button,useUi} from '@/components/private-screen';
import {AdminScreen,Pills,StatusPill,formatDate,useA} from '@/components/admin-ui';
import {useStyles} from '@/components/access-screen';
import {ListEntrance,StaggerItem} from '@/components/list-entrance';
import { themed } from '@/theme';

type Pending={id:string;name:string;email:string;cpf:string;categories:string[];coverageLabels:string[];createdAt:string};
type Data={providers:Pending[];page:number;hasMore:boolean};
// UC14.3: fila de cadastros de prestadores aguardando decisão, do mais antigo para o mais recente.
export default function PendingProviders(){
 const s=useS();const styles=useStyles();const ui=useUi();const a=useA();
 const r=usePrivateResource<Data>('/admin/providers/pending');
 async function more(){if(!r.data)return;const result=await r.perform('/admin/providers/pending?page='+(r.data.page+1));if(result)r.setData(old=>old?{...result,providers:[...old.providers,...result.providers]}:result);}
 return <AdminScreen title="Cadastros em análise" onRefresh={r.refresh}><ListEntrance ready={!!r.data}>
  <Text style={styles.description}>Confira os dados de cada prestador e aprove ou rejeite o cadastro. Os mais antigos aparecem primeiro.</Text>
  <Feedback {...r} skeleton="cards"/>
  {r.data&&!r.data.providers.length?<View style={s.empty}><Text style={ui.label}>Nenhum cadastro aguardando análise.</Text><Text style={styles.note}>Quando um prestador se cadastrar, ele aparece aqui.</Text></View>:null}
  {r.data?.providers.map((item,index)=><StaggerItem key={item.id} index={index}><PressableScale accessibilityRole="button" accessibilityLabel={`${item.name}. Cadastro em análise desde ${formatDate(item.createdAt)}. Conferir dados.`} onPress={()=>router.push({pathname:'/admin/cadastro-em-analise',params:{id:item.id}})} scaleTo={0.98} style={ui.card}>
   <View style={s.top}><Text style={s.title}>{item.name}</Text><Text accessible={false} style={s.arrow}>↗</Text></View>
   <Pills><StatusPill status="Em análise"/></Pills>
   <Text style={styles.note}>{item.email}{'\n'}CPF {item.cpf}</Text>
   <Text style={a.value}>{item.categories.join(', ')||'Sem categoria'}</Text>
   <Text style={styles.note}>{item.coverageLabels.join(', ')}</Text>
   <Text style={a.eyebrow}>ENVIADO EM {formatDate(item.createdAt)}</Text>
  </PressableScale></StaggerItem>)}
  {r.data?.hasMore?<Button secondary label="Carregar mais cadastros" disabled={r.busy} onPress={()=>void more()}/>:null}
 </ListEntrance></AdminScreen>;
}
const useS = themed(colors => StyleSheet.create({
 top:{flexDirection:'row',alignItems:'flex-start',gap:12},
 title:{flex:1,fontSize:19,lineHeight:25,fontWeight:'700',letterSpacing:-0.3,color:colors.text},
 arrow:{fontSize:20,color:colors.textMuted},
 empty:{backgroundColor:colors.surface,borderRadius:24,padding:22,gap:10},
}));
