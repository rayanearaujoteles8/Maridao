import {useState} from 'react';
import {Text,View} from 'react-native';
import {usePrivateResource,Feedback,Button,useUi} from '@/components/private-screen';
import {AdminScreen,Field,PasswordField,useA} from '@/components/admin-ui';
import {SelectionField,CatalogNotice} from '@/components/selection-field';
import {FieldError} from '@/components/field-motion';
import {useCatalog} from '@/hooks/use-catalog';
import {useStyles} from '@/components/access-screen';
import {validCpf,validEmail,validPassword,validPhone} from '@/lib/validation';

const empty={name:'',email:'',phone:'',cpf:'',neighborhood:'',password:''};
// UC01.1 fluxo 2: mesmos campos do autocadastro de cliente, com senha provisória (POST /admin/customers).
export default function CreateCustomer(){
 const styles=useStyles();const ui=useUi();const a=useA();
 const r=usePrivateResource<never>(null),catalog=useCatalog();
 const [form,setForm]=useState(empty),[local,setLocal]=useState<Record<string,string>>({});
 const errors={...r.fields,...local},busy=r.busy;
 const change=(key:keyof typeof empty)=>(text:string)=>{setForm(old=>({...old,[key]:text}));setLocal(old=>({...old,[key]:''}));};
 async function submit(){
  const next:Record<string,string>={};
  if(!form.name.trim())next.name='Preencha este campo.';
  if(!validEmail(form.email))next.email='Informe um e-mail válido.';
  if(!validPhone(form.phone))next.phone='Informe telefone com DDD, com 10 ou 11 dígitos.';
  if(!validCpf(form.cpf))next.cpf='Confira os números do CPF.';
  if(!form.neighborhood)next.neighborhood='Selecione um bairro ou quadra da lista.';
  if(!validPassword(form.password))next.password='Use uma senha de 8 a 128 caracteres.';
  setLocal(next);if(Object.keys(next).length)return;
  const result=await r.perform('/admin/customers',{...form,email:form.email.trim()},'POST');
  if(result){setForm(empty);r.setMessage(`${result.message} ${result.customer?.name??'A pessoa'} entra com a senha provisória e define uma nova no primeiro acesso.`);}
 }
 return <AdminScreen title="Cadastrar cliente">
  <Text style={styles.description}>Todos os campos são obrigatórios. O Maridão atende somente Palmas – TO.</Text>
  <Field label="Nome completo" value={form.name} onChangeText={change('name')} maxLength={150} autoCapitalize="words" editable={!busy} error={errors.name}/>
  <Field label="E-mail" value={form.email} onChangeText={change('email')} maxLength={254} keyboardType="email-address" autoCapitalize="none" editable={!busy} error={errors.email}/>
  <Field label="Telefone com DDD" value={form.phone} onChangeText={change('phone')} maxLength={16} keyboardType="phone-pad" placeholder="(63) 99999-9999" editable={!busy} error={errors.phone}/>
  <Field label="CPF" value={form.cpf} onChangeText={change('cpf')} maxLength={14} keyboardType="number-pad" placeholder="000.000.000-00" editable={!busy} error={errors.cpf}/>
  {!catalog.data?<CatalogNotice error={catalog.error} retry={catalog.retry}/>:<View style={a.field}><Text style={ui.label}>Bairro ou quadra em Palmas</Text><SelectionField label="Bairro ou quadra em Palmas" options={catalog.data.neighborhoods} values={form.neighborhood?[form.neighborhood]:[]} disabled={busy} error={errors.neighborhood} onChange={selected=>change('neighborhood')(selected[0]??'')}/><FieldError style={a.error}>{errors.neighborhood}</FieldError></View>}
  <PasswordField key={r.message} label="Senha provisória" value={form.password} onChangeText={change('password')} editable={!busy} error={errors.password} hint="De 8 a 128 caracteres. O cliente será obrigado a trocá-la no primeiro acesso."/>
  <Feedback {...r} error={r.error||(Object.values(local).some(Boolean)?'Revise os campos destacados.':'')}/>
  <Button label="Cadastrar cliente" disabled={busy||!catalog.data} onPress={()=>void submit()}/>
 </AdminScreen>;
}
