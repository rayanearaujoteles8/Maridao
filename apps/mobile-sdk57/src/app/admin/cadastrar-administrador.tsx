import {useState} from 'react';
import {Text} from 'react-native';
import {usePrivateResource,Feedback,Button} from '@/components/private-screen';
import {AdminScreen,Field,PasswordField} from '@/components/admin-ui';
import {useStyles} from '@/components/access-screen';
import {validEmail,validPassword} from '@/lib/validation';

const empty={name:'',email:'',password:''};
// UC14.4: um administrador cadastra outro, com senha provisória (POST /admin/admins).
export default function CreateAdmin(){
 const styles=useStyles();
 const r=usePrivateResource<never>(null);
 const [form,setForm]=useState(empty),[local,setLocal]=useState<Record<string,string>>({});
 const errors={...r.fields,...local},busy=r.busy;
 const change=(key:keyof typeof empty)=>(text:string)=>{setForm(old=>({...old,[key]:text}));setLocal(old=>({...old,[key]:''}));};
 async function submit(){
  const next:Record<string,string>={};
  if(!form.name.trim())next.name='Preencha este campo.';
  if(!validEmail(form.email))next.email='Informe um e-mail válido.';
  if(!validPassword(form.password))next.password='Use uma senha de 8 a 128 caracteres.';
  setLocal(next);if(Object.keys(next).length)return;
  const result=await r.perform('/admin/admins',{name:form.name,email:form.email.trim(),password:form.password},'POST');
  if(result){setForm(empty);r.setMessage(`${result.message} ${result.admin?.name??'A pessoa'} entra com a senha provisória e define uma nova no primeiro acesso.`);}
 }
 return <AdminScreen title="Cadastrar administrador">
  <Text style={styles.description}>Quem você cadastrar aqui terá acesso completo à área administrativa.</Text>
  <Field label="Nome" value={form.name} onChangeText={change('name')} maxLength={150} autoCapitalize="words" editable={!busy} error={errors.name}/>
  <Field label="E-mail" value={form.email} onChangeText={change('email')} maxLength={254} keyboardType="email-address" autoCapitalize="none" editable={!busy} error={errors.email}/>
  <PasswordField key={r.message} label="Senha provisória" value={form.password} onChangeText={change('password')} editable={!busy} error={errors.password} hint="De 8 a 128 caracteres. Informe à pessoa por um canal seguro: ela será obrigada a trocá-la no primeiro acesso."/>
  <Feedback {...r} error={r.error||(Object.values(local).some(Boolean)?'Revise os campos destacados.':'')}/>
  <Button label="Cadastrar administrador" disabled={busy} onPress={()=>void submit()}/>
 </AdminScreen>;
}
