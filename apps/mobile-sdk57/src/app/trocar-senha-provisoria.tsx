import {useState} from 'react';
import {Text,View} from 'react-native';
import {useSession} from '@/components/session';
import {PrivateScreen,usePrivateResource,useLogout,Feedback,Button,useUi} from '@/components/private-screen';
import {PasswordField} from '@/components/admin-ui';
import {useStyles} from '@/components/access-screen';
import {validPassword} from '@/lib/validation';

// UC10.4 fluxo 2: troca obrigatória da senha provisória. Sem voltar: o SessionGate (_layout) só libera o app depois da troca.
export default function ProvisionalPassword(){
 const styles=useStyles();const ui=useUi();
 const {session,setSession}=useSession();
 const resource=usePrivateResource<never>(null),exit=useLogout();
 const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
 const [errors,setErrors]=useState<{password?:string;confirmation?:string}>({});
 const busy=resource.busy||exit.busy;
 async function submit(){
  const next:typeof errors={};
  if(!validPassword(password))next.password='Use uma senha de 8 a 128 caracteres.';
  if(confirmation!==password)next.confirmation='As senhas não são iguais.';
  setErrors(next);if(Object.keys(next).length||!session)return;
  const result=await resource.perform('/auth/provisional-password',{newPassword:password},'POST');
  if(!result)return;
  setPassword('');setConfirmation('');
  // A sessão atual continua valendo; o SessionGate leva para a área do papel (admin → /admin; demais → /minha-conta).
  setSession({...session,role:result.user?.role??session.role,mustChangePassword:false});
 }
 return <PrivateScreen title="Crie sua nova senha" back={false}>
  <Text style={styles.description}>Sua conta foi criada com uma senha provisória. Para continuar usando o Maridão, defina uma senha só sua.</Text>
  <View style={styles.card}><Text style={styles.cardTitle}>Sua nova senha precisa</Text><Text style={styles.field}>• Ter de 8 a 128 caracteres (pode ser uma frase longa)</Text><Text style={styles.field}>• Ser diferente da senha provisória</Text></View>
  <PasswordField label="Nova senha" autoComplete="new-password" value={password} editable={!busy} error={errors.password} onChangeText={text=>{setPassword(text);setErrors({});}}/>
  <PasswordField label="Confirmar nova senha" autoComplete="new-password" value={confirmation} editable={!busy} error={errors.confirmation} onChangeText={text=>{setConfirmation(text);setErrors({});}} onSubmitEditing={()=>void submit()} returnKeyType="done"/>
  <Feedback busy={busy} error={resource.error||exit.error} message=""/>
  <View style={ui.group}><Button label="Definir nova senha" disabled={busy} onPress={()=>void submit()}/><Button secondary label="Sair" disabled={busy} onPress={()=>void exit.logout()}/></View>
 </PrivateScreen>;
}
