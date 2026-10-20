import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, styles } from '@/components/access-screen';
import { api, ApiError } from '@/lib/api';

const empty={name:'',email:'',phone:'',password:'',document:'',categories:'',specialties:'',neighborhoods:'',availability:''};
const labels: Record<keyof typeof empty,string>={name:'Nome completo',email:'E-mail',phone:'Telefone com DDD',password:'Senha',document:'Documento',categories:'Categorias de serviço',specialties:'Especialidades',neighborhoods:'Bairros de atendimento em Palmas',availability:'Disponibilidade'};
const hints: Partial<Record<keyof typeof empty,string>>={categories:'Ex.: manutenção, montagem de móveis',specialties:'Ex.: montagem de armários, instalação de prateleiras',neighborhoods:'Separe os bairros por vírgula',availability:'Ex.: segunda a sexta, das 8h às 18h',password:'De 8 a 128 caracteres'};
export default function ProviderRegistration(){
 const [values,setValues]=useState(empty);
 const [documentType,setDocumentType]=useState<'CPF'|'CNPJ'>('CPF');
 const [errors,setErrors]=useState<Record<string,string>>({});
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [showPassword,setShowPassword]=useState(false);
 const pending=useRef(false);
 async function submit(){
  if(pending.current)return;
  const next:Record<string,string>={};
  for(const key of Object.keys(empty) as (keyof typeof empty)[])if(!values[key].trim())next[key]='Preencha este campo.';
  if([...values.password].length<8||[...values.password].length>128)next.password='Use uma senha de 8 a 128 caracteres.';
  setErrors(next);setMessage('');
  if(Object.keys(next).length){setMessage('Revise os campos indicados.');return;}
  pending.current=true;setBusy(true);
  try{
   const split=(value:string)=>value.split(',').map(item=>item.trim()).filter(Boolean);
   await api('/providers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,documentType,categories:split(values.categories),specialties:split(values.specialties),neighborhoods:split(values.neighborhoods)})});
   setValues(empty);setShowPassword(false);setMessage('Cadastro criado com sucesso! Toque em Já tenho conta para entrar.');
  }catch(error){
   if(error instanceof ApiError && error.fields)setErrors(error.fields);
   setMessage(error instanceof Error?error.message:'Não foi possível concluir o cadastro.');
  }finally{pending.current=false;setBusy(false);}
 }
 return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={{flex:1}} enabled={Platform.OS!=='ios'} behavior="height"><ScrollView style={{flex:1}} contentContainerStyle={[styles.page,{paddingBottom:64}]} automaticallyAdjustKeyboardInsets={Platform.OS==='ios'} contentInsetAdjustmentBehavior="never" keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} directionalLockEnabled showsVerticalScrollIndicator>
  <Link href="/" style={styles.back}>← Voltar ao início</Link>
  <Text accessibilityRole="header" style={styles.title}>Cadastro de prestador</Text>
  <Text style={styles.description}>Ofereça seus serviços em Palmas – TO.</Text>
  <View style={styles.card}><Text style={styles.cardTitle}>CPF ou CNPJ</Text><Text style={styles.note}>Escolha o documento usado neste cadastro.</Text><View style={s.choices}>{(['CPF','CNPJ'] as const).map(type=><Pressable key={type} accessibilityRole="radio" accessibilityState={{checked:documentType===type,disabled:busy}} disabled={busy} style={[s.choice,documentType===type&&s.selected]} onPress={()=>{setDocumentType(type);setValues(old=>({...old,document:''}));setErrors({});}}><Text style={s.label}>{type}</Text></Pressable>)}</View></View>
  <Text style={styles.note}>Todos os campos são obrigatórios. Nas listas, separe os itens por vírgula. A disponibilidade é informativa e não reserva horários.</Text>
  {message?<Text accessibilityRole="alert" style={s.message}>{message}</Text>:null}
  {(Object.keys(empty) as (keyof typeof empty)[]).map(key=><View key={key} style={s.group}><Text style={s.label}>{key==='document'?documentType:key==='name'?(documentType==='CNPJ'?'Razão social':'Nome completo'):labels[key]}</Text><TextInput accessibilityLabel={key==='document'?documentType:key==='name'?(documentType==='CNPJ'?'Razão social':'Nome completo'):labels[key]} editable={!busy} style={[s.input,errors[key]?s.invalid:undefined]} value={values[key]} placeholder={hints[key]} placeholderTextColor="#64705C" autoCorrect={false} autoCapitalize={key==='email'||key==='password'?'none':key==='document'?'characters':'sentences'} keyboardType={key==='email'?'email-address':key==='phone'?'phone-pad':key==='document'&&documentType==='CPF'?'number-pad':'default'} secureTextEntry={key==='password'&&!showPassword} maxLength={key==='password'?128:key==='document'?25:key==='name'?150:key==='email'?254:key==='availability'?500:key==='phone'?30:5000} scrollEnabled={false} multiline={['availability','categories','specialties','neighborhoods'].includes(key)} onChangeText={text=>{setValues(old=>({...old,[key]:text}));setErrors(old=>({...old,[key]:''}));setMessage('');}}/>{errors[key]?<Text style={s.error}>{errors[key]}</Text>:null}{key==='password'?<Pressable accessibilityRole="button" style={s.toggle} onPress={()=>setShowPassword(old=>!old)}><Text>{showPassword?'Ocultar senha':'Mostrar senha'}</Text></Pressable>:null}</View>)}
  <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} style={({pressed})=>[s.button,(pressed||busy)&&{opacity:0.7}]} onPress={submit}><Text style={s.buttonText}>{busy?'Criando cadastro…':'Criar conta de prestador'}</Text></Pressable>
  <Link href="/entrar" style={styles.back}>Já tenho conta</Link>
 </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const s=StyleSheet.create({group:{gap:8},label:{fontSize:16,fontWeight:'600',color:colors.black},input:{minHeight:54,borderWidth:1,borderColor:'#64705C',borderRadius:14,padding:16,fontSize:17,color:colors.black},invalid:{borderColor:'#A32121',borderWidth:2},error:{color:'#A32121'},choices:{flexDirection:'row',gap:12},choice:{borderWidth:1,borderColor:colors.black,padding:16,borderRadius:14,minWidth:90,alignItems:'center'},selected:{backgroundColor:colors.green},button:{backgroundColor:colors.black,padding:18,minHeight:56,borderRadius:16,alignItems:'center'},buttonText:{color:colors.white,fontSize:17,fontWeight:'700'},message:{backgroundColor:colors.pale,padding:16,borderRadius:14,fontSize:16,lineHeight:24},toggle:{minHeight:44,justifyContent:'center'}});
