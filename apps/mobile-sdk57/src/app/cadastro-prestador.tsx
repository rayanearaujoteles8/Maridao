import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStyles } from '@/components/access-screen';
import { BackButton } from '@/components/back-button';
import { FieldError, FieldInput, useToggleProgress } from '@/components/field-motion';
import { SelectionField, CatalogNotice } from '@/components/selection-field';
import { useCatalog } from '@/hooks/use-catalog';
import { api, ApiError } from '@/lib/api';
import { validCpf } from '@/lib/validation';
import { themed, useTheme } from '@/theme';

type Form={name:string;email:string;phone:string;password:string;document:string;categories:string[];specialties:string[];neighborhoods:string[];availability:string};
const empty:Form={name:'',email:'',phone:'',password:'',document:'',categories:[],specialties:[],neighborhoods:[],availability:''};
const textFields=[{key:'name',label:'Nome completo',max:150},{key:'email',label:'E-mail',max:254},{key:'phone',label:'Telefone com DDD',max:30},{key:'document',label:'CPF',max:14},{key:'password',label:'Senha',max:128}] as const;
export default function ProviderRegistration(){
 const s=useS();const styles=useStyles();const {colors}=useTheme();
 const catalog=useCatalog();
 const [values,setValues]=useState<Form>(empty);
 const [coverageMode,setCoverageMode]=useState<'regions'|'neighborhoods'>('regions');
 const [showAreas,setShowAreas]=useState(false);
 const [errors,setErrors]=useState<Record<string,string>>({});
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[showPassword,setShowPassword]=useState(false);
 const pending=useRef(false);
 const specialties=[...new Set(catalog.data?.services.filter(item=>values.categories.includes(item.value)).flatMap(item=>item.specialties)??[])].map(value=>({value,label:value}));
 function change<K extends keyof Form>(key:K,value:Form[K]){setValues(old=>({...old,[key]:value}));setErrors(old=>({...old,[key]:''}));setMessage('');}
 async function submit(){
  if(pending.current)return;
  const next:Record<string,string>={};
  for(const field of textFields)if(!values[field.key].trim())next[field.key]='Preencha este campo.';
  if(values.document.trim()&&!validCpf(values.document))next.document='Confira os números do CPF.';
  if(!values.availability.trim())next.availability='Informe sua disponibilidade.';
  for(const key of ['categories','specialties','neighborhoods'] as const)if(!values[key].length)next[key]='Selecione pelo menos uma opção.';
  if([...values.password].length<8||[...values.password].length>128)next.password='Use uma senha de 8 a 128 caracteres.';
  setErrors(next);setMessage('');
  if(Object.keys(next).length){setMessage('Confira os campos destacados.');return;}
  pending.current=true;setBusy(true);Keyboard.dismiss();
  try{const result=await api('/providers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,documentType:'CPF'})});setValues(empty);setShowPassword(false);setMessage((typeof result?.message==='string'?result.message:'Cadastro recebido. Seu perfil será liberado após a aprovação de um administrador.')+' Seu cadastro está em análise: você já pode entrar para acompanhar a situação.');}
  catch(error){if(error instanceof ApiError&&error.fields)setErrors({...error.fields,document:error.fields.document??error.fields.documentType??''});setMessage(error instanceof Error?error.message:'Não foi possível concluir o cadastro.');}
  finally{pending.current=false;setBusy(false);}
 }
 return <SafeAreaView style={styles.safe}><ScrollView style={{flex:1}} contentContainerStyle={[styles.page,{paddingBottom:64}]} automaticallyAdjustKeyboardInsets keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} keyboardShouldPersistTaps="handled" directionalLockEnabled>
  <BackButton href="/" label="Voltar ao início" />
  <Text accessibilityRole="header" style={styles.title}>Cadastro de prestador</Text><Text style={styles.description}>Ofereça seus serviços em Palmas – TO.</Text>
  <View style={styles.card}><Text style={styles.cardTitle}>Cadastro com CPF</Text><Text style={styles.note}>Depois de enviar, seu cadastro fica em análise. Seu perfil aparece nas buscas quando um administrador aprovar.</Text></View>
  {!catalog.data?<CatalogNotice error={catalog.error} retry={catalog.retry}/>:null}
  {textFields.map(field=>{
   const label=field.label;
   return <View key={field.key} style={s.group}><Text style={s.label}>{label}</Text><FieldInput invalid={!!errors[field.key]} accessibilityLabel={label} editable={!busy} style={[s.input,errors[field.key]?s.invalid:undefined]} value={values[field.key]} maxLength={field.max} autoCorrect={false} autoCapitalize={field.key==='name'?'words':'none'} keyboardType={field.key==='email'?'email-address':field.key==='phone'?'phone-pad':field.key==='document'?'number-pad':'default'} placeholder={field.key==='document'?'000.000.000-00':undefined} placeholderTextColor={colors.placeholder} secureTextEntry={field.key==='password'&&!showPassword} onChangeText={text=>change(field.key,text)}/><FieldError style={s.error}>{errors[field.key]}</FieldError>{field.key==='password'?<><Text style={styles.note}>De 8 a 128 caracteres.</Text><Pressable accessibilityRole="button" onPress={()=>setShowPassword(old=>!old)} style={s.toggle}><Text style={styles.plain}>{showPassword?'Ocultar senha':'Mostrar senha'}</Text></Pressable></>:null}</View>;
  })}
  <View style={s.group}><Text style={s.section}>Seus serviços</Text><Text style={s.label}>Categorias</Text><SelectionField label="Categorias de serviço" options={catalog.data?.services??[]} values={values.categories} multiple max={20} disabled={busy||!catalog.data} error={errors.categories} onChange={selected=>{
   const allowed=new Set(catalog.data?.services.filter(item=>selected.includes(item.value)).flatMap(item=>item.specialties));
   setValues(old=>({...old,categories:selected,specialties:old.specialties.filter(item=>allowed.has(item))}));setErrors(old=>({...old,categories:'',specialties:''}));setMessage('');
  }}/><FieldError style={s.error}>{errors.categories}</FieldError></View>
  <View style={s.group}><Text style={s.label}>Especialidades</Text><SelectionField label="Especialidades" options={specialties} values={values.specialties} multiple max={20} disabled={busy||!values.categories.length||!catalog.data} error={errors.specialties} placeholder={values.categories.length?'Selecionar especialidades':'Escolha uma categoria primeiro'} onChange={selected=>change('specialties',selected)}/><FieldError style={s.error}>{errors.specialties}</FieldError></View>
  <View style={s.group}><Text style={s.section}>Onde você atende?</Text>
   <View style={s.choices}>{([{value:'regions',label:'Por região'},{value:'neighborhoods',label:'Bairros e quadras'}] as const).map(mode=><Choice key={mode.value} label={mode.label} checked={coverageMode===mode.value} disabled={busy} onPress={()=>{if(coverageMode!==mode.value){setCoverageMode(mode.value);change('neighborhoods',[]);setShowAreas(false);}}}/>)}</View>
   <Text style={styles.note}>{coverageMode==='regions'?'Selecione uma ou mais regiões, ou Toda Palmas. Confira os locais incluídos antes de confirmar.':'Selecione os bairros e as quadras onde oferece seus serviços.'}</Text>
   <SelectionField label={coverageMode==='regions'?'Regiões de atendimento':'Bairros e quadras de atendimento'} options={coverageMode==='regions'?(catalog.data?.coverageRegions??[]):(catalog.data?.neighborhoods??[])} values={values.neighborhoods} multiple max={coverageMode==='regions'?10:50} disabled={busy||!catalog.data} error={errors.neighborhoods} onChange={selected=>{const all='CIDADE:PALMAS';change('neighborhoods',selected.includes(all)?[all]:selected);}}/>
   {coverageMode==='regions'?<><Pressable accessibilityRole="button" accessibilityState={{expanded:showAreas}} style={s.toggle} onPress={()=>setShowAreas(old=>!old)}><Text style={s.label}>{showAreas?'Ocultar locais incluídos':'Ver locais incluídos em cada região'}</Text></Pressable>{showAreas?catalog.data?.coverageRegions.map(region=><View key={region.value} style={styles.card}><Text style={s.label}>{region.label}</Text><Text style={styles.note}>{region.description}</Text>{region.value!=='CIDADE:PALMAS'?<Text style={styles.note}>{region.neighborhoods.map(value=>catalog.data?.neighborhoods.find(item=>item.value===value)?.label??value).join(', ')}</Text>:null}</View>):null}</>:null}
   <FieldError style={s.error}>{errors.neighborhoods}</FieldError>
  </View>
  <View style={s.group}><Text style={s.label}>Disponibilidade</Text><FieldInput invalid={!!errors.availability} accessibilityLabel="Disponibilidade" editable={!busy} style={[s.input,errors.availability?s.invalid:undefined]} value={values.availability} onChangeText={text=>change('availability',text)} placeholder="Ex.: segunda a sexta, das 8h às 18h" placeholderTextColor={colors.placeholder} maxLength={500} multiline scrollEnabled={false}/><Text style={styles.note}>Informe seus horários habituais. Isso não reserva atendimentos.</Text><FieldError style={s.error}>{errors.availability}</FieldError></View>
  {message?<Text accessibilityRole="alert" style={s.message}>{message}</Text>:null}
  <Pressable accessibilityRole="button" disabled={busy||!catalog.data} accessibilityState={{disabled:busy||!catalog.data,busy}} style={({pressed})=>[s.button,(pressed||busy||!catalog.data)&&{opacity:0.6}]} onPress={submit}><Text style={s.buttonText}>{busy?'Criando cadastro…':'Criar conta de prestador'}</Text></Pressable><Link href="/entrar" style={styles.back}>Já tenho conta</Link>
 </ScrollView></SafeAreaView>;
}
// "Por região" / "Bairros e quadras": a opção escolhida preenche de verde (140 ms) e a outra esvazia (110 ms); o texto
// acompanha a cor. "Reduzir movimento": troca seca.
function Choice({label,checked,disabled,onPress}:{label:string;checked:boolean;disabled:boolean;onPress:()=>void}){
 const s=useS();const {colors}=useTheme();
 const rest=colors.text,on=colors.onAccent;
 const progress=useToggleProgress(checked);
 const fill=useAnimatedStyle(()=>({opacity:progress.get()}));
 const ink=useAnimatedStyle(()=>({color:interpolateColor(progress.get(),[0,1],[rest,on])}));
 return <Pressable accessibilityRole="radio" accessibilityState={{checked,disabled}} disabled={disabled} style={s.choice} onPress={onPress}><Animated.View pointerEvents="none" style={[s.choiceFill,fill]}/><Animated.Text style={[s.label,ink]}>{label}</Animated.Text></Pressable>;
}
const useS = themed(colors => StyleSheet.create({group:{gap:10},label:{fontSize:16,fontWeight:'600',color:colors.text},section:{fontSize:22,fontWeight:'700',color:colors.text,marginTop:8,marginBottom:8},input:{minHeight:58,borderWidth:1,borderColor:colors.borderStrong,borderRadius:16,padding:16,fontSize:17,color:colors.text},invalid:{borderColor:colors.danger,borderWidth:2},error:{color:colors.danger},choices:{flexDirection:'row',gap:12},choice:{borderWidth:1,borderColor:colors.text,padding:16,borderRadius:14,minWidth:90,alignItems:'center'},choiceFill:{position:'absolute',top:0,right:0,bottom:0,left:0,borderRadius:13,backgroundColor:colors.accent},button:{backgroundColor:colors.primary,padding:18,minHeight:56,borderRadius:16,alignItems:'center'},buttonText:{color:colors.onPrimary,fontSize:17,fontWeight:'700'},message:{backgroundColor:colors.accentSoft,padding:16,borderRadius:14,fontSize:16,lineHeight:24,color:colors.onAccentSoft},toggle:{minHeight:44,justifyContent:'center'}}));
