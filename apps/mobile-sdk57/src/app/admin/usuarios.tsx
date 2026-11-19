import {useState} from 'react';
import { PressableScale } from '@/components/pressable-scale';
import {router} from 'expo-router';
import {StyleSheet,Text,View} from 'react-native';
import {usePrivateResource,Feedback,Button,useUi} from '@/components/private-screen';
import {AdminScreen,Chips,Field,Pills,StatusPill,Eyebrow,typeLabel} from '@/components/admin-ui';
import {useStyles} from '@/components/access-screen';
import {ListEntrance,StaggerItem} from '@/components/list-entrance';
import { themed } from '@/theme';

type User={id:string;type:'customer'|'provider';name:string;email:string|null;cpf:string|null;accountStatus:string;approvalStatus?:string;createdAt:string};
type Data={users:User[];page:number;hasMore:boolean};
const types=[{value:'',label:'Todos'},{value:'customer',label:'Clientes'},{value:'provider',label:'Prestadores'}] as const;
const statuses=[{value:'',label:'Todos'},{value:'ativa',label:'Ativa'},{value:'inativa',label:'Inativa'},{value:'excluida',label:'Excluída'},{value:'em_analise',label:'Em análise'},{value:'aprovado',label:'Aprovado'},{value:'rejeitado',label:'Rejeitado'}] as const;
// UC14.1: consulta de clientes e prestadores (GET /admin/users) com busca, filtros e paginação.
export default function AdminUsers(){
 const s=useS();const styles=useStyles();const ui=useUi();
 const [text,setText]=useState(''),[q,setQ]=useState('');
 const [type,setType]=useState<typeof types[number]['value']>(''),[status,setStatus]=useState<typeof statuses[number]['value']>('');
 const query=[q?'q='+encodeURIComponent(q):'',type?'type='+type:'',status?'status='+status:''].filter(Boolean).join('&');
 const r=usePrivateResource<Data>('/admin/users'+(query?'?'+query:''));
 const filtered=!!query;
 async function more(){if(!r.data)return;const result=await r.perform('/admin/users?'+(query?query+'&':'')+'page='+(r.data.page+1));if(result)r.setData(old=>old?{...result,users:[...old.users,...result.users]}:result);}
 return <AdminScreen title="Usuários" onRefresh={r.refresh}><ListEntrance ready={!!r.data}>
  <View style={ui.group}>
   <Field label="Buscar por nome, e-mail ou CPF" value={text} onChangeText={setText} placeholder="Nome, e-mail ou CPF completo" maxLength={100} autoCapitalize="none" returnKeyType="search" onSubmitEditing={()=>setQ(text.trim())} hint="A busca por CPF precisa do número completo."/>
   <Button label="Buscar" disabled={r.busy} onPress={()=>setQ(text.trim())}/>
  </View>
  <Chips label="Tipo" options={types} value={type} onChange={setType}/>
  <Chips label="Status" options={statuses} value={status} onChange={setStatus}/>
  {status==='em_analise'||status==='aprovado'||status==='rejeitado'?<Text style={styles.note}>Em análise, Aprovado e Rejeitado são status do cadastro de prestadores.</Text>:null}
  <Feedback {...r} skeleton="cards"/>
  {r.data?.users.length?<Text style={styles.note}>{r.data.users.length?`${r.data.users.length}${r.data.hasMore?'+':''} ${r.data.users.length===1&&!r.data.hasMore?'usuário':'usuários'} em ordem alfabética`:''}</Text>:null}
  {r.data&&!r.data.users.length?<View style={s.empty}><Text style={ui.label}>{filtered?'Nenhum usuário encontrado para o filtro.':'Nenhum usuário cadastrado ainda.'}</Text>{filtered?<><Text style={styles.note}>Confira a busca ou limpe os filtros para ver todos.</Text><Button secondary label="Limpar filtros" onPress={()=>{setText('');setQ('');setType('');setStatus('');}}/></>:null}</View>:null}
  {r.data?.users.map((user,index)=><StaggerItem key={user.id} index={index}><PressableScale accessibilityRole="button" accessibilityLabel={`${user.name}. ${typeLabel(user.type)}. Conta ${user.accountStatus}${user.approvalStatus?'. Cadastro '+user.approvalStatus:''}. Gerenciar.`} onPress={()=>router.push({pathname:'/admin/usuario',params:{id:user.id}})} scaleTo={0.98} style={ui.card}>
   <View style={s.top}><View style={s.name}><Eyebrow>{typeLabel(user.type).toLocaleUpperCase('pt-BR')}</Eyebrow><Text style={s.title}>{user.name}</Text></View><Text accessible={false} style={s.arrow}>↗</Text></View>
   <Pills><StatusPill status={user.accountStatus}/>{user.approvalStatus?<StatusPill status={user.approvalStatus}/>:null}</Pills>
   {user.email?<Text style={styles.note}>{user.email}</Text>:null}
   {user.cpf?<Text style={styles.note}>CPF {user.cpf}</Text>:null}
  </PressableScale></StaggerItem>)}
  {r.data?.hasMore?<Button secondary label="Carregar mais usuários" disabled={r.busy} onPress={()=>void more()}/>:null}
 </ListEntrance></AdminScreen>;
}
const useS = themed(colors => StyleSheet.create({
 top:{flexDirection:'row',alignItems:'flex-start',gap:12},name:{flex:1,gap:4},
 title:{fontSize:19,lineHeight:25,fontWeight:'700',letterSpacing:-0.3,color:colors.text},
 arrow:{fontSize:20,color:colors.textMuted},
 empty:{backgroundColor:colors.surface,borderRadius:24,padding:22,gap:10},
}));
