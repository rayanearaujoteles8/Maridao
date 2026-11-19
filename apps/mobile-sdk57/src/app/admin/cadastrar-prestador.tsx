import {useState} from 'react';
import {Text} from 'react-native';
import {usePrivateResource,Feedback,Button} from '@/components/private-screen';
import {AdminScreen,Field,PasswordField,ProviderFields,Section} from '@/components/admin-ui';
import {useCatalog} from '@/hooks/use-catalog';
import {useStyles} from '@/components/access-screen';
import {validCpf,validEmail,validPassword,validPhone} from '@/lib/validation';

const empty={name:'',email:'',phone:'',document:'',password:'',categories:[] as string[],specialties:[] as string[],neighborhoods:[] as string[],availability:''};
type TextKey='name'|'email'|'phone'|'document'|'password';
// UC02.1 fluxo 2: mesmos campos do autocadastro de prestador (só CPF), com senha provisória; já nasce aprovado (POST /admin/providers).
export default function CreateProvider(){
 const styles=useStyles();
 const r=usePrivateResource<never>(null),catalog=useCatalog();
 const [form,setForm]=useState(empty),[local,setLocal]=useState<Record<string,string>>({});
 const errors:Record<string,string>={...r.fields,...local,document:local.document||r.fields.document||r.fields.documentType||''},busy=r.busy;
 const change=(key:TextKey)=>(text:string)=>{setForm(old=>({...old,[key]:text}));setLocal(old=>({...old,[key]:''}));};
 async function submit(){
  const next:Record<string,string>={};
  if(!form.name.trim())next.name='Preencha este campo.';
  if(!validEmail(form.email))next.email='Informe um e-mail válido.';
  if(!validPhone(form.phone))next.phone='Informe telefone com DDD, com 10 ou 11 dígitos.';
  if(!validCpf(form.document))next.document='Confira os números do CPF.';
  if(!validPassword(form.password))next.password='Use uma senha de 8 a 128 caracteres.';
  for(const key of ['categories','specialties','neighborhoods'] as const)if(!form[key].length)next[key]='Selecione pelo menos uma opção.';
  if(!form.availability.trim())next.availability='Informe a disponibilidade.';
  setLocal(next);if(Object.keys(next).length)return;
  const result=await r.perform('/admin/providers',{...form,email:form.email.trim(),documentType:'CPF'},'POST');
  if(result){setForm(empty);r.setMessage(`${result.message} O perfil já está aprovado. ${result.provider?.name??'A pessoa'} entra com a senha provisória e define uma nova no primeiro acesso.`);}
 }
 return <AdminScreen title="Cadastrar prestador">
  <Text style={styles.description}>Todos os campos são obrigatórios. O cadastro feito por você já entra aprovado, sem passar pela análise.</Text>
  <Field label="Nome completo" value={form.name} onChangeText={change('name')} maxLength={150} autoCapitalize="words" editable={!busy} error={errors.name}/>
  <Field label="E-mail" value={form.email} onChangeText={change('email')} maxLength={254} keyboardType="email-address" autoCapitalize="none" editable={!busy} error={errors.email}/>
  <Field label="Telefone com DDD" value={form.phone} onChangeText={change('phone')} maxLength={16} keyboardType="phone-pad" placeholder="(63) 99999-9999" editable={!busy} error={errors.phone}/>
  <Field label="CPF" value={form.document} onChangeText={change('document')} maxLength={14} keyboardType="number-pad" placeholder="000.000.000-00" editable={!busy} error={errors.document}/>
  <PasswordField key={r.message} label="Senha provisória" value={form.password} onChangeText={change('password')} editable={!busy} error={errors.password} hint="De 8 a 128 caracteres. O prestador será obrigado a trocá-la no primeiro acesso."/>
  <Section title="Serviços e atendimento">
   <ProviderFields catalog={catalog} value={form} onChange={next=>{setForm(old=>({...old,...next}));setLocal(old=>({...old,categories:'',specialties:'',neighborhoods:'',availability:''}));}} errors={errors} disabled={busy}/>
  </Section>
  <Feedback {...r} error={r.error||(Object.values(local).some(Boolean)?'Revise os campos destacados.':'')}/>
  <Button label="Cadastrar prestador" disabled={busy||!catalog.data} onPress={()=>void submit()}/>
 </AdminScreen>;
}
