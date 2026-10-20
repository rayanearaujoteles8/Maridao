import {useRef,useState} from 'react';
import {Link,Redirect} from 'expo-router';
import {Keyboard,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors,styles} from '@/components/access-screen';
import {useSession} from '@/components/session';
import {api,ApiError} from '@/lib/api';
const empty={category:'',description:'',neighborhood:'',preferredDate:'',preferredPeriod:''};
const fields=[{key:'category',label:'Categoria do serviço',hint:'Ex.: montagem de móveis',max:100},{key:'description',label:'Descreva o que precisa',hint:'Conte os detalhes do serviço',max:3000},{key:'neighborhood',label:'Bairro em Palmas',hint:'Onde será o atendimento?',max:100},{key:'preferredDate',label:'Data de preferência (opcional)',hint:'DD/MM/AAAA',max:10},{key:'preferredPeriod',label:'Período de preferência (opcional)',hint:'Ex.: pela manhã ou no fim de semana',max:100}] as const;
export default function NewRequest(){
 const {session,setSession}=useSession();
 const [values,setValues]=useState(empty),[errors,setErrors]=useState<Record<string,string>>({}),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef(false);
 if(!session)return <Redirect href="/entrar"/>;
 async function submit(){
  if(!session||pending.current)return;
  const next:Record<string,string>={};
  for(const key of ['category','description','neighborhood'] as const)if(!values[key].trim())next[key]='Preencha este campo.';
  let date='';
  if(values.preferredDate.trim()){
   const match=values.preferredDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
   if(!match)next.preferredDate='Use o formato DD/MM/AAAA.';else date=`${match[3]}-${match[2]}-${match[1]}`;
  }
  setErrors(next);setMessage('');
  if(Object.keys(next).length){setMessage('Revise os campos indicados.');return;}
  pending.current=true;setBusy(true);Keyboard.dismiss();
  try{
   await api('/requests',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.token}`},body:JSON.stringify({...values,preferredDate:date})});
   setValues(empty);setMessage('Solicitação criada com sucesso! Status: Aberta. A preferência informada não representa reserva de horário.');
  }catch(error){
   if(error instanceof ApiError&&error.status===401)setSession(null);
   else{if(error instanceof ApiError&&error.fields)setErrors(error.fields);setMessage(error instanceof Error?error.message:'Não foi possível confirmar a solicitação.');}
  }finally{pending.current=false;setBusy(false);}
 }
 return <SafeAreaView style={styles.safe}><ScrollView style={{flex:1}} contentContainerStyle={[styles.page,{paddingBottom:64}]} automaticallyAdjustKeyboardInsets keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} keyboardShouldPersistTaps="handled">
  <Link href="/minha-conta" style={styles.back}>← Minha conta</Link><Text accessibilityRole="header" style={styles.title}>Nova solicitação</Text>
  <View style={styles.card}><Text style={styles.cardTitle}>Palmas – TO</Text><Text style={styles.note}>Descreva sua necessidade. Data e período são opcionais, sem agendamento automático.</Text></View>
  {message?<Text accessibilityRole="alert" style={s.message}>{message}</Text>:null}
  {fields.map(field=><View key={field.key} style={s.group}><Text style={s.label}>{field.label}</Text><TextInput accessibilityLabel={field.label} accessibilityHint={errors[field.key]} editable={!busy} style={[s.input,field.key==='description'&&s.description,errors[field.key]?s.invalid:undefined]} placeholder={field.hint} placeholderTextColor="#64705C" maxLength={field.max} value={values[field.key]} multiline={field.key==='description'} scrollEnabled={false} keyboardType={field.key==='preferredDate'?'numbers-and-punctuation':'default'} onChangeText={text=>{setValues(old=>({...old,[field.key]:text}));setErrors(old=>({...old,[field.key]:''}));setMessage('');}}/>{errors[field.key]?<Text style={s.error}>{errors[field.key]}</Text>:null}</View>)}
  <Pressable accessibilityRole="button" accessibilityState={{disabled:busy,busy}} disabled={busy} onPress={submit} style={({pressed})=>[s.button,(pressed||busy)&&{opacity:0.7}]}><Text style={s.buttonText}>{busy?'Publicando…':'Publicar solicitação'}</Text></Pressable>
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({group:{gap:8},label:{fontSize:16,fontWeight:'600',color:colors.black},input:{borderWidth:1,borderColor:'#64705C',borderRadius:14,padding:16,minHeight:54,fontSize:17,color:colors.black},description:{minHeight:130,textAlignVertical:'top'},invalid:{borderColor:'#A32121',borderWidth:2},error:{color:'#A32121'},message:{backgroundColor:colors.pale,padding:16,borderRadius:14,fontSize:16,lineHeight:24},button:{backgroundColor:colors.black,minHeight:56,padding:18,borderRadius:16,alignItems:'center'},buttonText:{color:colors.white,fontSize:17,fontWeight:'700'}});
