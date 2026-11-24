import {ProfileAvatar} from '@/components/profile-avatar';
import {ProfilePhotoEditor} from '@/components/profile-photo-editor';
import {useRef,useState,type ComponentRef,type ReactNode} from 'react';
import {router} from 'expo-router';
import { Appear } from '@/components/skeleton';
import {Alert,Keyboard,Pressable,StyleSheet,Text,TextInput,View,type ScrollView} from 'react-native';
import {useSession} from '@/components/session';
import {PrivateScreen,usePrivateResource,Feedback,Button,useUi} from '@/components/private-screen';
import {SelectionField,CatalogNotice} from '@/components/selection-field';
import {useCatalog} from '@/hooks/use-catalog';
import {DangerButton,Field,PasswordField} from '@/components/admin-ui';
import {useToast} from '@/components/toast';
import {api,ApiError} from '@/lib/api';
import { themed, useTheme } from '@/theme';
type Profile={name:string;phone:string;neighborhood?:string;categories?:string[];specialties?:string[];neighborhoods?:string[];availability?:string;email:string;email_verified_at:string|null;role:'customer'|'provider'};
// `closure` (GET /account): diz, antes de pedir a senha, se a conta já pode ser encerrada. Cliente: exclusão ("delete");
// prestador: só inativação ("deactivate"). É informativo: a regra é conferida de novo em POST /account/close.
type Closure={action:'delete'|'deactivate';allowed:boolean;activeRequests:number;openRequests:number;code?:string;reason?:string};
type SettingsData={profile:Profile;mailMode:string;closure?:Closure};
// Ao abrir a confirmação de excluir/inativar (fim da tela), a rolagem desce até o campo de senha, que nasce abaixo da dobra.
export default function Settings(){const resource=usePrivateResource<SettingsData>('/account');const scroll=useRef<ComponentRef<typeof ScrollView>>(null);const reveal=()=>setTimeout(()=>scroll.current?.scrollToEnd({animated:true}),80);return <PrivateScreen title="Configurações" onRefresh={resource.refresh} scrollRef={scroll}><Feedback {...resource} skeleton="form"/>{resource.data?<Appear style={{gap:24}}><ProfileForm key={JSON.stringify(resource.data.profile)} profile={resource.data.profile} mailMode={resource.data.mailMode} resource={resource}/><SettingsSection mark="!" title="Encerrar minha conta" description="Veja as condições antes de continuar" danger><CloseAccount role={resource.data.profile.role} closure={resource.data.closure} disabled={resource.busy} reload={resource.reload} onOpen={reveal}/></SettingsSection></Appear>:null}</PrivateScreen>;}
function ProfileForm({profile,mailMode,resource}:{profile:Profile;mailMode:string;resource:ReturnType<typeof usePrivateResource<SettingsData>>}){
 const c=useC();const {colors}=useTheme();const ui=useUi();
 const catalog=useCatalog(),{setSession}=useSession();
 const [form,setForm]=useState({name:profile.name,phone:profile.phone,neighborhood:profile.neighborhood??'',categories:profile.categories??[],specialties:profile.specialties??[],neighborhoods:profile.neighborhoods??[],availability:profile.availability??''});
 const [currentPassword,setCurrentPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[token,setToken]=useState('');
 const provider=profile.role==='provider',busy=resource.busy;
 const specialties=(catalog.data?.services.filter(s=>form.categories.includes(s.value)).flatMap(s=>s.specialties)??[]).filter((v,i,a)=>a.indexOf(v)===i).map(value=>({value,label:value}));
 async function save(){const body=provider?{name:form.name,phone:form.phone,categories:form.categories,specialties:form.specialties,neighborhoods:form.neighborhoods,availability:form.availability,currentPassword}:{name:form.name,phone:form.phone,neighborhood:form.neighborhood,currentPassword};const result=await resource.perform('/account',body,'PATCH');if(result){setCurrentPassword('');resource.setMessage(result.message);}}
 async function changePassword(){const result=await resource.perform('/account/password',{currentPassword,newPassword},'POST');if(result){Alert.alert('Senha alterada','Entre novamente com sua nova senha.');setSession(null);}}
 return <View style={{gap:14}}>
  <View style={c.identity}><ProfileAvatar name={profile.name} size={54}/><View style={{flex:1,gap:4}}><Text style={c.identityName}>{profile.name}</Text><Text style={c.body}>{provider?'Conta de prestador':'Conta de cliente'} · Palmas, TO</Text></View></View>
  <Text style={c.eyebrow}>SUA CONTA</Text>
  <SettingsSection mark="◎" title="Foto de perfil" description="Adicione ou troque sua foto"><ProfilePhotoEditor name={profile.name}/></SettingsSection>
  <SettingsSection mark="01" title="Meus dados" description="Perfil, telefone e local de atendimento">

  {(['name','phone'] as const).map(key=><View key={key} style={ui.group}><Text style={ui.label}>{key==='name'?'Nome':'Telefone com DDD'}</Text><TextInput accessibilityLabel={key==='name'?'Nome':'Telefone com DDD'} editable={!busy} value={form[key]} maxLength={key==='name'?150:30} keyboardType={key==='phone'?'phone-pad':'default'} onChangeText={v=>setForm(old=>({...old,[key]:v}))} style={ui.input}/></View>)}
  {!catalog.data?<CatalogNotice error={catalog.error} retry={catalog.retry}/>:provider?<>
   <Text style={ui.label}>Categorias de serviço</Text><SelectionField label="Categorias de serviço" options={catalog.data.services} multiple values={form.categories} disabled={busy} onChange={categories=>setForm(old=>({...old,categories,specialties:old.specialties.filter(value=>catalog.data!.services.filter(s=>categories.includes(s.value)).some(s=>s.specialties.includes(value)))}))}/>
   <Text style={ui.label}>Especialidades</Text><SelectionField label="Especialidades" options={specialties} multiple values={form.specialties} disabled={busy} onChange={specialties=>setForm(old=>({...old,specialties}))}/>
   <Text style={ui.label}>Locais de atendimento</Text><SelectionField label="Locais de atendimento" options={[...catalog.data.coverageRegions,...catalog.data.neighborhoods]} multiple max={50} values={form.neighborhoods} disabled={busy} onChange={values=>setForm(old=>({...old,neighborhoods:values.includes('CIDADE:PALMAS')?['CIDADE:PALMAS']:values}))}/>
   <Text style={ui.label}>Disponibilidade</Text><TextInput accessibilityLabel="Disponibilidade" style={ui.input} value={form.availability} onChangeText={availability=>setForm(old=>({...old,availability}))} multiline maxLength={500} editable={!busy}/>
  </>:<><Text style={ui.label}>Bairro ou quadra</Text><SelectionField label="Bairro ou quadra" options={catalog.data.neighborhoods} values={form.neighborhood?[form.neighborhood]:[]} disabled={busy} onChange={v=>setForm(old=>({...old,neighborhood:v[0]??''}))}/></>}
  <Text style={ui.label}>Senha atual para confirmar alterações</Text><TextInput accessibilityLabel="Senha atual" secureTextEntry autoCapitalize="none" style={ui.input} maxLength={128} value={currentPassword} onChangeText={setCurrentPassword} editable={!busy}/>
  <Button label="Salvar perfil" disabled={busy||!catalog.data} onPress={()=>void save()}/>
  </SettingsSection>
  <SettingsSection mark="02" title="Senha e segurança" description="Atualize sua senha de acesso"><Text style={c.body}>Para sua segurança, você precisará entrar novamente após a troca.</Text><Text style={ui.label}>Senha atual</Text><TextInput accessibilityLabel="Senha atual para trocar a senha" secureTextEntry autoCapitalize="none" style={ui.input} maxLength={128} value={currentPassword} onChangeText={setCurrentPassword} editable={!busy}/><Text style={ui.label}>Nova senha</Text><TextInput placeholderTextColor={colors.placeholder} accessibilityLabel="Nova senha" secureTextEntry autoCapitalize="none" placeholder="Nova senha, de 8 a 128 caracteres" style={ui.input} maxLength={128} value={newPassword} onChangeText={setNewPassword} editable={!busy}/><Button label="Alterar senha e sair" disabled={busy} onPress={()=>void changePassword()}/></SettingsSection>
  <SettingsSection mark={profile.email_verified_at?'✓':'03'} title="Meu e-mail" description={profile.email_verified_at?'E-mail confirmado':'Confirme seu endereço de e-mail'}><Text style={c.email}>{profile.email}</Text><Text style={c.body}>{profile.email_verified_at?'Seu endereço de e-mail já está confirmado.':mailMode==='local'?'Modo de teste: as instruções são gravadas na caixa de saída local do computador.':mailMode==='smtp'?'Enviaremos um código para seu e-mail. Confira também a pasta de spam.':'O envio de e-mail precisa ser configurado.'}</Text>{!profile.email_verified_at?<><Button secondary label="Solicitar código de confirmação" disabled={busy||mailMode==='unconfigured'} onPress={()=>void resource.perform('/account/verify-email',{},'POST').then(r=>{if(r)resource.setMessage(r.message);})}/><TextInput accessibilityLabel="Código recebido por e-mail" autoCapitalize="none" style={ui.input} maxLength={64} value={token} onChangeText={setToken} editable={!busy}/><Button label="Confirmar e-mail" disabled={busy} onPress={()=>void resource.perform('/account/confirm-email',{token},'POST').then(r=>{if(r)void resource.reload();})}/></>:null}</SettingsSection>
 </View>;
}


function SettingsSection({mark,title,description,danger=false,children}:{mark:string;title:string;description:string;danger?:boolean;children:ReactNode}){
 const [open,setOpen]=useState(false);const c=useC();
 return <View style={[c.section,danger&&c.dangerSection]}><Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{expanded:open}} onPress={()=>setOpen(value=>!value)} style={({pressed})=>[c.sectionHeader,pressed&&{opacity:0.7}]}><View style={[c.mark,danger&&c.dangerMark]}><Text style={[c.markText,danger&&c.dangerText]}>{mark}</Text></View><View style={{flex:1,gap:4}}><Text style={[c.sectionTitle,danger&&c.dangerText]}>{title}</Text><Text style={c.description}>{description}</Text></View><Text accessible={false} style={c.chevron}>{open?'−':'+'}</Text></Pressable>{open?<View style={c.sectionBody}>{children}</View>:null}</View>;
}

const MAX_REASON=500;
// UC01.3 — encerrar a própria conta (POST /account/close). Cliente: EXCLUSÃO (dados pessoais eliminados, sem volta).
// Prestador: INATIVAÇÃO (dados mantidos) — os textos dele nunca falam em excluir.
// Dois passos: 1) a pessoa lê o que acontece e diz que quer continuar; 2) confirma com a senha atual (motivo opcional).
// Com atendimento em curso (`closure.allowed` falso ou recusa ACCOUNT_HAS_ACTIVE_REQUESTS) a tela explica o porquê e o
// caminho, sem campo de senha nem botão de encerrar. Desistir não chama a API.
function CloseAccount({role,closure,disabled,reload,onOpen}:{role:Profile['role'];closure?:Closure;disabled:boolean;reload:()=>Promise<void>;onOpen:()=>void}){
 const c=useC();const ui=useUi();const toast=useToast();
 const {session,setSession}=useSession();
 const [open,setOpen]=useState(false),[password,setPassword]=useState(''),[reason,setReason]=useState('');
 const [errors,setErrors]=useState<{password?:string;reason?:string}>({}),[error,setError]=useState(''),[refused,setRefused]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef(false);
 const remove=closure?closure.action==='delete':role==='customer';
 // Bloqueio: o que a API informou em `closure` ou a recusa que ela acabou de devolver (vale até a pessoa sair da tela).
 const blocked=!!refused||closure?.allowed===false;
 const active=closure?.activeRequests??0,opened=closure?.openRequests??0;
 const off=busy||disabled;
 function keep(){setOpen(false);setPassword('');setReason('');setErrors({});setError('');}
 async function send(){
  if(!session||pending.current)return;
  if(!password){setErrors({password:'Informe sua senha atual.'});return;}
  pending.current=true;setBusy(true);setErrors({});setError('');Keyboard.dismiss();
  const text=reason.trim();
  try{
   const result=await api('/account/close',{method:'POST',headers:{Authorization:`Bearer ${session.token}`,'Content-Type':'application/json'},body:JSON.stringify(text?{currentPassword:password,reason:text}:{currentPassword:password})});
   // A conta foi encerrada e o token deixou de valer: aviso com a mensagem da API, tela inicial pública e sessão local apagada.
   toast.success(typeof result?.message==='string'?result.message:result?.action==='deleted'?'Conta excluída. Seus dados pessoais foram eliminados.':'Conta inativada. O histórico dos serviços foi preservado.');
   router.dismissTo('/');
   setSession(null);
  }catch(failure){
   pending.current=false;setBusy(false);
   if(!(failure instanceof ApiError)){setError(failure instanceof Error?failure.message:'Não foi possível concluir. Tente novamente.');return;}
   if(failure.status===401){setSession(null);return;}
   if(failure.code==='ACCOUNT_HAS_ACTIVE_REQUESTS'){keep();setRefused(failure.message);void reload();}
   else if(failure.code==='WRONG_PASSWORD')setErrors({password:failure.message});
   else if(failure.fields?.reason)setErrors({reason:failure.fields.reason});
   else setError(failure.message);
  }
 }
 const title=remove?'Excluir conta':'Inativar conta';
 if(blocked){
  const counted=active>0?(remove?(active===1?'Você tem 1 solicitação com status Aceita, Em andamento ou Aguardando confirmação.':`Você tem ${active} solicitações com status Aceita, Em andamento ou Aguardando confirmação.`):(active===1?'Você tem 1 atendimento com status Aceita, Em andamento ou Aguardando confirmação.':`Você tem ${active} atendimentos com status Aceita, Em andamento ou Aguardando confirmação.`)):'';
  return <View style={ui.group}>
   <Text accessibilityRole="header" style={c.title}>{title}</Text>
   <View accessible accessibilityRole="alert" style={c.blocked}>
    <Text style={c.blockedTitle}>{remove?'Ainda não dá para excluir sua conta':'Ainda não dá para inativar sua conta'}</Text>
    <Text style={c.body}>{refused||closure?.reason||(remove?'Você tem solicitação aceita ou em andamento. A exclusão só será possível depois que essas solicitações forem concluídas ou canceladas.':'Você tem atendimento aceito ou em andamento. A inativação só será possível depois que esses atendimentos forem concluídos ou cancelados.')}</Text>
    {counted?<Text style={c.body}>{counted}</Text>:null}
    <Text style={c.body}>{remove?'O que fazer: conclua ou cancele essas solicitações em Meus pedidos e volte aqui.':'O que fazer: conclua ou cancele esses atendimentos em Meus pedidos e volte aqui.'}</Text>
   </View>
   <Button secondary label="Ver meus pedidos" disabled={off} onPress={()=>router.dismissTo('/solicitacoes')}/>
  </View>;
 }
 const lines=remove?[
  'Sua conta é encerrada e você sai do aplicativo.',
  'Seus dados pessoais são eliminados: nome, e-mail, telefone, CPF e endereço.',
  'O histórico de pedidos, mensagens e avaliações continua, com o autor “Usuário removido”.',
  ...(opened===1?['Sua solicitação aberta será cancelada.']:opened>1?[`Suas ${opened} solicitações abertas serão canceladas.`]:[]),
  'Não dá para desfazer nem recuperar a conta.',
 ]:[
  'Seu perfil sai das buscas e você deixa de receber pedidos.',
  'Você sai do aplicativo e não consegue mais entrar com esta conta.',
  'Suas propostas pendentes são retiradas.',
  'Seus dados e o histórico dos serviços são mantidos.',
  'Nesta versão não há reativação pelo aplicativo.',
 ];
 return <View style={ui.group}>
  <Text accessibilityRole="header" style={c.title}>{title}</Text>
  <View style={c.warning}>
   <Text style={c.warningTitle}>{remove?'A exclusão não pode ser desfeita':'O que acontece ao inativar'}</Text>
   {lines.map(line=><View key={line} style={c.line}><Text accessible={false} style={c.bullet}>•</Text><Text style={c.lineText}>{line}</Text></View>)}
  </View>
  {!open?<Button secondary label={remove?'Quero excluir minha conta':'Quero inativar minha conta'} disabled={off} onPress={()=>{setOpen(true);onOpen();}}/>:<>
   <Text style={c.body}>{remove?'Para confirmar a exclusão, informe sua senha atual.':'Para confirmar a inativação, informe sua senha atual.'}</Text>
   <PasswordField label="Senha atual" value={password} onChangeText={value=>{setPassword(value);setErrors(old=>({...old,password:undefined}));setError('');}} editable={!off} error={errors.password}/>
   <Field label="Motivo (opcional)" value={reason} onChangeText={value=>{setReason(value);setErrors(old=>({...old,reason:undefined}));setError('');}} placeholder={remove?'Se quiser, conte por que está excluindo a conta':'Se quiser, conte por que está inativando a conta'} multiline scrollEnabled={false} maxLength={MAX_REASON} editable={!off} error={errors.reason} hint={`${reason.length}/${MAX_REASON} · Fica no registro da conta.`}/>
   {error?<Text accessibilityRole="alert" style={ui.error}>{error}</Text>:null}
   <DangerButton label={busy?(remove?'Excluindo…':'Inativando…'):remove?'Excluir minha conta':'Inativar minha conta'} disabled={off} onPress={()=>void send()}/>
   <Button secondary label="Manter minha conta" disabled={off} onPress={keep}/>
  </>}
 </View>;
}
const useC=themed(colors=>StyleSheet.create({
 identity:{flexDirection:'row',alignItems:'center',gap:14,padding:20,borderRadius:24,backgroundColor:colors.accentSoft,marginBottom:12},
 avatar:{width:54,height:54,borderRadius:18,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},
 initial:{fontSize:25,fontWeight:'700',color:colors.onPrimary},
 identityName:{fontSize:21,fontWeight:'700',color:colors.text,letterSpacing:-0.5},
 eyebrow:{fontSize:11,fontWeight:'700',letterSpacing:2,color:colors.textSoft,marginLeft:4,marginBottom:2},
 section:{borderWidth:1,borderColor:colors.border,borderRadius:22,backgroundColor:colors.surface,overflow:'hidden'},
 sectionHeader:{flexDirection:'row',alignItems:'center',gap:13,padding:18,minHeight:96},
 mark:{width:40,height:40,borderRadius:13,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'},
 markText:{fontSize:14,fontWeight:'700',color:colors.text},
 sectionTitle:{fontSize:17,fontWeight:'700',color:colors.text,letterSpacing:-0.3},
 description:{fontSize:13,lineHeight:19,color:colors.textSoft},
 chevron:{fontSize:24,color:colors.textSoft,fontWeight:'400'},
 sectionBody:{padding:18,paddingTop:4,gap:14},
 dangerSection:{marginTop:8},dangerMark:{backgroundColor:colors.dangerSoft},dangerText:{color:colors.danger},
 email:{fontSize:15,lineHeight:22,fontWeight:'600',color:colors.text},

 title:{fontSize:22,lineHeight:28,fontWeight:'700',letterSpacing:-0.4,color:colors.text,marginTop:8},
 body:{fontSize:15,lineHeight:23,color:colors.textSoft},
 warning:{backgroundColor:colors.dangerSoft,borderRadius:20,padding:18,gap:8},
 warningTitle:{fontSize:17,lineHeight:23,fontWeight:'700',color:colors.danger,marginBottom:2},
 line:{flexDirection:'row',gap:8},
 bullet:{fontSize:15,lineHeight:23,color:colors.text},
 lineText:{flex:1,fontSize:15,lineHeight:23,color:colors.text},
 blocked:{backgroundColor:colors.surface,borderRadius:20,padding:18,gap:6},
 blockedTitle:{fontSize:17,lineHeight:23,fontWeight:'700',color:colors.text},
}));
