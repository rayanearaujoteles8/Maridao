import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, styles } from '@/components/access-screen';
import { SelectionField, CatalogNotice } from '@/components/selection-field';
import { useCatalog } from '@/hooks/use-catalog';
import { api, ApiError } from '@/lib/api';

type Form={name:string;email:string;phone:string;password:string;document:string;categories:string[];specialties:string[];neighborhoods:string[];availability:string};
const empty:Form={name:'',email:'',phone:'',password:'',document:'',categories:[],specialties:[],neighborhoods:[],availability:''};
const textFields=[{key:'name',label:'Nome completo',max:150},{key:'email',label:'E-mail',max:254},{key:'phone',label:'Telefone com DDD',max:30},{key:'document',label:'Documento',max:25},{key:'password',label:'Senha',max:128}] as const;
export default function ProviderRegistration(){
 const catalog=useCatalog();
 const [values,setValues]=useState<Form>(empty);
 const [coverageMode,setCoverageMode]=useState<'regions'|'neighborhoods'>('regions');
 const [showAreas,setShowAreas]=useState(false);
 const [documentType,setDocumentType]=useState<'CPF'|'CNPJ'>('CPF');
 const [errors,setErrors]=useState<Record<string,string>>({});
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[showPassword,setShowPassword]=useState(false);
 const pending=useRef(false);
 const specialties=[...new Set(catalog.data?.services.filter(item=>values.categories.includes(item.value)).flatMap(item=>item.specialties)??[])].map(value=>({value,label:value}));
 function change<K extends keyof Form>(key:K,value:Form[K]){setValues(old=>({...old,[key]:value}));setErrors(old=>({...old,[key]:''}));setMessage('');}
 async function submit(){
  if(pending.current)return;
  const next:Record<string,string>={};
  for(const field of textFields)if(!values[field.key].trim())next[field.key]='Preencha este campo.';
  if(!values.availability.trim())next.availability='Informe sua disponibilidade.';
  for(const key of ['categories','specialties','neighborhoods'] as const)if(!values[key].length)next[key]='Selecione pelo menos uma opção.';
  if([...values.password].length<8||[...values.password].length>128)next.password='Use uma senha de 8 a 128 caracteres.';
  setErrors(next);setMessage('');
  if(Object.keys(next).length){setMessage('Confira os campos destacados.');return;}
  pending.current=true;setBusy(true);Keyboard.dismiss();
  try{await api('/providers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,documentType})});setValues(empty);setShowPassword(false);setMessage('Cadastro criado com sucesso! Toque em Já tenho conta para entrar.');}
  catch(error){if(error instanceof ApiError&&error.fields)setErrors(error.fields);setMessage(error instanceof Error?error.message:'Não foi possível concluir o cadastro.');}
  finally{pending.current=false;setBusy(false);}
 }
 return <SafeAreaView style={styles.safe}><ScrollView style={{flex:1}} contentContainerStyle={[styles.page,{paddingBottom:64}]} automaticallyAdjustKeyboardInsets keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} keyboardShouldPersistTaps="handled" directionalLockEnabled>
  <Link href="/" style={styles.back}>‹ Voltar ao início</Link>
  <Text accessibilityRole="header" style={styles.title}>Cadastro de prestador</Text><Text style={styles.description}>Ofereça seus serviços em Palmas – TO.</Text>
  <View style={styles.card}><Text style={styles.cardTitle}>Qual documento vai usar?</Text><View style={s.choices}>{(['CPF','CNPJ'] as const).map(type=><Pressable key={type} accessibilityRole="radio" accessibilityState={{checked:documentType===type,disabled:busy}} disabled={busy} style={[s.choice,documentType===type&&s.selected]} onPress={()=>{setDocumentType(type);change('document','');}}><Text style={s.label}>{type}</Text></Pressable>)}</View></View>
  {!catalog.data?<CatalogNotice error={catalog.error} retry={catalog.retry}/>:null}
  {textFields.map(field=>{
   const label=field.key==='name'?(documentType==='CNPJ'?'Razão social':'Nome completo'):field.key==='document'?documentType:field.label;
   return <View key={field.key} style={s.group}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} editable={!busy} style={[s.input,errors[field.key]?s.invalid:undefined]} value={values[field.key]} maxLength={field.max} autoCorrect={false} autoCapitalize={field.key==='email'||field.key==='password'?'none':field.key==='document'?'characters':'words'} keyboardType={field.key==='email'?'email-address':field.key==='phone'?'phone-pad':field.key==='document'&&documentType==='CPF'?'number-pad':'default'} secureTextEntry={field.key==='password'&&!showPassword} onChangeText={text=>change(field.key,text)}/>{errors[field.key]?<Text style={s.error}>{errors[field.key]}</Text>:null}{field.key==='password'?<><Text style={styles.note}>De 8 a 128 caracteres.</Text><Pressable accessibilityRole="button" onPress={()=>setShowPassword(old=>!old)} style={s.toggle}><Text>{showPassword?'Ocultar senha':'Mostrar senha'}</Text></Pressable></>:null}</View>;
  })}
  <View style={s.group}><Text style={s.section}>Seus serviços</Text><Text style={s.label}>Categorias</Text><SelectionField label="Categorias de serviço" options={catalog.data?.services??[]} values={values.categories} multiple max={20} disabled={busy||!catalog.data} error={errors.categories} onChange={selected=>{
   const allowed=new Set(catalog.data?.services.filter(item=>selected.includes(item.value)).flatMap(item=>item.specialties));
   setValues(old=>({...old,categories:selected,specialties:old.specialties.filter(item=>allowed.has(item))}));setErrors(old=>({...old,categories:'',specialties:''}));setMessage('');
  }}/>{errors.categories?<Text style={s.error}>{errors.categories}</Text>:null}</View>
  <View style={s.group}><Text style={s.label}>Especialidades</Text><SelectionField label="Especialidades" options={specialties} values={values.specialties} multiple max={20} disabled={busy||!values.categories.length||!catalog.data} error={errors.specialties} placeholder={values.categories.length?'Selecionar especialidades':'Escolha uma categoria primeiro'} onChange={selected=>change('specialties',selected)}/>{errors.specialties?<Text style={s.error}>{errors.specialties}</Text>:null}</View>
  <View style={s.group}><Text style={s.section}>Onde você atende?</Text>
   <View style={s.choices}>{([{value:'regions',label:'Por região'},{value:'neighborhoods',label:'Bairros e quadras'}] as const).map(mode=><Pressable key={mode.value} accessibilityRole="radio" accessibilityState={{checked:coverageMode===mode.value,disabled:busy}} disabled={busy} style={[s.choice,coverageMode===mode.value&&s.selected]} onPress={()=>{if(coverageMode!==mode.value){setCoverageMode(mode.value);change('neighborhoods',[]);setShowAreas(false);}}}><Text style={s.label}>{mode.label}</Text></Pressable>)}</View>
   <Text style={styles.note}>{coverageMode==='regions'?'Selecione uma ou mais regiões, ou Toda Palmas. Confira os locais incluídos antes de confirmar.':'Selecione os bairros e as quadras onde oferece seus serviços.'}</Text>
   <SelectionField label={coverageMode==='regions'?'Regiões de atendimento':'Bairros e quadras de atendimento'} options={coverageMode==='regions'?(catalog.data?.coverageRegions??[]):(catalog.data?.neighborhoods??[])} values={values.neighborhoods} multiple max={coverageMode==='regions'?10:50} disabled={busy||!catalog.data} error={errors.neighborhoods} onChange={selected=>{const all='CIDADE:PALMAS';change('neighborhoods',selected.includes(all)?[all]:selected);}}/>
   {coverageMode==='regions'?<><Pressable accessibilityRole="button" accessibilityState={{expanded:showAreas}} style={s.toggle} onPress={()=>setShowAreas(old=>!old)}><Text style={s.label}>{showAreas?'Ocultar locais incluídos':'Ver locais incluídos em cada região'}</Text></Pressable>{showAreas?catalog.data?.coverageRegions.map(region=><View key={region.value} style={styles.card}><Text style={s.label}>{region.label}</Text><Text style={styles.note}>{region.description}</Text>{region.value!=='CIDADE:PALMAS'?<Text style={styles.note}>{region.neighborhoods.map(value=>catalog.data?.neighborhoods.find(item=>item.value===value)?.label??value).join(', ')}</Text>:null}</View>):null}</>:null}
   {errors.neighborhoods?<Text style={s.error}>{errors.neighborhoods}</Text>:null}
  </View>
  <View style={s.group}><Text style={s.label}>Disponibilidade</Text><TextInput accessibilityLabel="Disponibilidade" editable={!busy} style={[s.input,errors.availability?s.invalid:undefined]} value={values.availability} onChangeText={text=>change('availability',text)} placeholder="Ex.: segunda a sexta, das 8h às 18h" placeholderTextColor="#64705C" maxLength={500} multiline scrollEnabled={false}/><Text style={styles.note}>Informe seus horários habituais. Isso não reserva atendimentos.</Text>{errors.availability?<Text style={s.error}>{errors.availability}</Text>:null}</View>
  {message?<Text accessibilityRole="alert" style={s.message}>{message}</Text>:null}
  <Pressable accessibilityRole="button" disabled={busy||!catalog.data} accessibilityState={{disabled:busy||!catalog.data,busy}} style={({pressed})=>[s.button,(pressed||busy||!catalog.data)&&{opacity:0.6}]} onPress={submit}><Text style={s.buttonText}>{busy?'Criando cadastro…':'Criar conta de prestador'}</Text></Pressable><Link href="/entrar" style={styles.back}>Já tenho conta</Link>
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({group:{gap:10},label:{fontSize:16,fontWeight:'600',color:colors.black},section:{fontSize:22,fontWeight:'700',color:colors.black,marginTop:8,marginBottom:8},input:{minHeight:58,borderWidth:1,borderColor:'#A4AF98',borderRadius:16,padding:16,fontSize:17,color:colors.black},invalid:{borderColor:'#A32121',borderWidth:2},error:{color:'#A32121'},choices:{flexDirection:'row',gap:12},choice:{borderWidth:1,borderColor:colors.black,padding:16,borderRadius:14,minWidth:90,alignItems:'center'},selected:{backgroundColor:colors.green},button:{backgroundColor:colors.black,padding:18,minHeight:56,borderRadius:16,alignItems:'center'},buttonText:{color:colors.white,fontSize:17,fontWeight:'700'},message:{backgroundColor:colors.pale,padding:16,borderRadius:14,fontSize:16,lineHeight:24},toggle:{minHeight:44,justifyContent:'center'}});
