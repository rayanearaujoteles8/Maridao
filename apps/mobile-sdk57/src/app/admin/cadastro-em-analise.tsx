import {useEffect,useState} from 'react';
import {router,useLocalSearchParams} from 'expo-router';
import {Alert,StyleSheet,Text,View} from 'react-native';
import {usePrivateResource,Feedback,Button,useUi} from '@/components/private-screen';
import {AdminScreen,DangerButton,Field,InfoRow,Pills,PrimaryButton,Section,StatusPill,formatDate,formatPhone,useA} from '@/components/admin-ui';
import {useStyles} from '@/components/access-screen';
import { themed } from '@/theme';

type Provider={id:string;name:string;email:string;phone:string;cpf:string;categories:string[];specialties:string[];neighborhoods:string[];coverageLabels:string[];availability:string;city:string;state:string;approvalStatus:string;createdAt:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toList=()=>{if(router.canGoBack())router.back();else router.replace('/admin/cadastros-em-analise');};
// UC14.3: detalhe do cadastro em análise — único lugar com o CPF completo — com Aprovar e Rejeitar (motivo obrigatório).
export default function PendingProvider(){
 const s=useS();const styles=useStyles();const ui=useUi();const a=useA();
 const {id}=useLocalSearchParams<{id?:string}>();
 const valid=typeof id==='string'&&uuid.test(id);
 const r=usePrivateResource<{provider:Provider}>(valid?'/admin/providers/pending/'+id:null);
 const [reason,setReason]=useState(''),[reasonError,setReasonError]=useState('');
 const provider=r.data?.provider,decided=r.code==='NOT_PENDING',busy=r.busy;
 // 409 NOT_PENDING (ao abrir ou ao decidir): mostra o status atual informado pela API e volta à lista.
 useEffect(()=>{if(decided)Alert.alert('Cadastro já decidido',r.error,[{text:'Voltar à lista',onPress:toList}]);},[decided,r.error]);
 async function decide(kind:'approve'|'reject'){
  const result=await r.perform('/admin/providers/'+id+'/'+kind,{reason:reason.trim()},'POST');
  if(result)Alert.alert(kind==='approve'?'Cadastro aprovado':'Cadastro rejeitado',result.message,[{text:'Voltar à lista',onPress:toList}]);
 }
 function approve(){
  if(!reason.trim()){setReasonError('Informe o motivo da decisão, com até 500 caracteres.');return;}
  setReasonError('');
  Alert.alert('Aprovar este cadastro?',`${provider?.name} passará a aparecer nas buscas e poderá enviar propostas. A decisão não pode ser desfeita.`,[{text:'Voltar',style:'cancel'},{text:'Aprovar',onPress:()=>void decide('approve')}]);
 }
 function reject(){
  if(!reason.trim()){setReasonError('Informe o motivo, com até 500 caracteres.');return;}
  setReasonError('');
  Alert.alert('Rejeitar este cadastro?',`${provider?.name} será avisado e verá o motivo informado. A decisão não pode ser desfeita.`,[{text:'Voltar',style:'cancel'},{text:'Rejeitar',style:'destructive',onPress:()=>void decide('reject')}]);
 }
 return <AdminScreen title="Conferir cadastro" backHref="/admin/cadastros-em-analise" backLabel="Cadastros em análise" onRefresh={valid?r.refresh:undefined}>
  {!valid?<Text accessibilityRole="alert" style={ui.error}>Cadastro inválido. Volte à lista e tente novamente.</Text>:null}
  <Feedback {...r} skeleton="detail"/>
  {decided||(r.error&&!provider)?<Button secondary label="Voltar à lista" onPress={toList}/>:null}
  {provider&&!decided?<View style={ui.group}>
   <View style={ui.card}>
    <Text style={a.eyebrow}>PRESTADOR</Text>
    <Text style={styles.cardTitle}>{provider.name}</Text>
    <Pills><StatusPill status={provider.approvalStatus}/></Pills>
    <View accessible accessibilityLabel={`CPF completo: ${provider.cpf}`} style={s.cpf}><Text style={s.cpfTag}>CPF COMPLETO · PARA CONFERÊNCIA</Text><Text style={s.cpfValue}>{provider.cpf}</Text><Text style={s.cpfNote}>Aparece só aqui, enquanto o cadastro está em análise.</Text></View>
    <InfoRow label="E-mail" value={provider.email}/>
    <InfoRow label="Telefone" value={formatPhone(provider.phone)}/>
    <InfoRow label="Categorias" value={provider.categories.join(', ')||'—'}/>
    <InfoRow label="Especialidades" value={provider.specialties.join(', ')||'—'}/>
    <InfoRow label="Locais de atendimento" value={`${provider.coverageLabels.join(', ')||'—'} · ${provider.city} – ${provider.state}`}/>
    <InfoRow label="Disponibilidade" value={provider.availability||'—'}/>
    <InfoRow label="Cadastro enviado em" value={formatDate(provider.createdAt)}/>
   </View>
   <Section title="Motivo da decisão">
    <Field label="Motivo da aprovação ou rejeição (obrigatório)" value={reason} onChangeText={text=>{setReason(text);setReasonError('');}} placeholder="Descreva o resultado da conferência" multiline scrollEnabled={false} maxLength={500} editable={!busy} error={reasonError||r.fields.reason}/>
    <Text style={styles.note}>O motivo fica registrado junto com o responsável e a data da decisão. Na rejeição, ele também é mostrado ao prestador.</Text>
   </Section>
   <Section title="Aprovar">
    <Text style={styles.note}>O perfil passa a aparecer nas buscas e o prestador pode enviar propostas. Ele é avisado por notificação.</Text>
    <PrimaryButton label="Aprovar cadastro" disabled={busy} onPress={approve}/>
   </Section>
   <Section title="Rejeitar">
    <DangerButton label="Rejeitar cadastro" disabled={busy} onPress={reject}/>
    <Feedback busy={false} error={r.error} message=""/>
   </Section>
  </View>:null}
 </AdminScreen>;
}
const useS = themed(colors => StyleSheet.create({
 cpf:{backgroundColor:colors.ink,borderRadius:18,padding:16,gap:6,borderWidth:1,borderColor:colors.inkBorder},
 cpfTag:{fontSize:10,fontWeight:'700',letterSpacing:1.2,color:colors.onInkAccent},
 cpfValue:{fontSize:26,lineHeight:32,fontWeight:'800',letterSpacing:0.5,color:colors.onInk},
 cpfNote:{fontSize:12,lineHeight:18,color:colors.onInkSoft},
}));
