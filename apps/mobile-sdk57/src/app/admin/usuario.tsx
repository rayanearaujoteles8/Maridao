import {useState} from 'react';
import { Appear } from '@/components/skeleton';
import {useLocalSearchParams} from 'expo-router';
import {Alert,Text,View} from 'react-native';
import {usePrivateResource,Feedback,Button,useUi} from '@/components/private-screen';
import {AdminScreen,DangerButton,Field,InfoRow,Pills,ProviderFields,Section,StatusPill,formatDate,formatPhone,typeLabel,useA} from '@/components/admin-ui';
import {SelectionField,CatalogNotice} from '@/components/selection-field';
import {FieldError} from '@/components/field-motion';
import {useCatalog} from '@/hooks/use-catalog';
import {useStyles} from '@/components/access-screen';
import {validPhone} from '@/lib/validation';
import {cancellationAuthor,cancellationPath,cancellationReason,cancellationWhen,type CancellationRecord} from '@/lib/admin-audit';

type Account={id:string;type:'customer'|'provider';name:string;email:string|null;phone:string|null;cpf:string|null;neighborhood?:string|null;city:string;state:string;accountStatus:'Ativa'|'Inativa'|'Excluída';mustChangePassword:boolean;emailVerified:boolean;createdAt:string;disabledAt:string|null;deletedAt:string|null;categories?:string[];specialties?:string[];neighborhoods?:string[];coverageLabels?:string[];availability?:string;approvalStatus?:string;approvalReason?:string|null;approvalDecidedAt?:string|null};
type Event={id:string;action:string;reason:string;createdAt:string;adminName:string|null;by?:'administration'|'customer'|'provider'};
// RNF02.4: quem fez o registro. `by` diz se foi a administração (com o nome do administrador) ou o próprio titular da conta.
const author=(event:Event)=>event.by==='customer'?'Feito pelo próprio cliente':event.by==='provider'?'Feito pelo próprio prestador':event.adminName?`Feito pela administração · ${event.adminName}`:'Feito pela administração · administrador não identificado';
type Data={user:Account;events:Event[];cancellations?:CancellationRecord[]};
const actions:Record<string,string>={account_created:'Conta cadastrada',account_edited:'Cadastro editado',account_deactivated:'Conta inativada',account_deleted:'Conta excluída',provider_approved:'Cadastro aprovado',provider_rejected:'Cadastro rejeitado'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// UC14.2: dados da conta, edição (PATCH), inativação e — só para cliente — exclusão, sempre com motivo.
export default function ManageUser(){
 const ui=useUi();
 const {id}=useLocalSearchParams<{id?:string}>();
 const valid=typeof id==='string'&&uuid.test(id);
 const r=usePrivateResource<Data>(valid?'/admin/users/'+id:null);
 return <AdminScreen title="Gerenciar usuário" backHref="/admin/usuarios" backLabel="Usuários" onRefresh={valid?r.refresh:undefined}>
  {!valid?<Text accessibilityRole="alert" style={ui.error}>Usuário inválido. Volte à lista e tente novamente.</Text>:null}
  <Feedback {...r} skeleton="detail"/>
  {r.data?<Appear style={{gap:24}}><AccountPanel key={JSON.stringify(r.data.user)} data={r.data} resource={r}/></Appear>:null}
 </AdminScreen>;
}
function AccountPanel({data,resource}:{data:Data;resource:ReturnType<typeof usePrivateResource<Data>>}){
 const styles=useStyles();const ui=useUi();const a=useA();
 const {user,events}=data,cancellations=data.cancellations??[],catalog=useCatalog();
 const provider=user.type==='provider',active=user.accountStatus==='Ativa',deleted=user.accountStatus==='Excluída',busy=resource.busy;
 const [form,setForm]=useState({name:user.name,phone:formatPhone(user.phone),neighborhood:user.neighborhood??'',categories:user.categories??[],specialties:user.specialties??[],neighborhoods:user.neighborhoods??[],availability:user.availability??''});
 const [reason,setReason]=useState(''),[local,setLocal]=useState<Record<string,string>>({});
 const errors={...resource.fields,...local};
 const place=catalog.data?.neighborhoods.find(item=>item.value===user.neighborhood)?.label??user.neighborhood;
 // Recarrega os dados e só então mostra a mensagem da API (o recarregamento limpa o aviso anterior).
 async function run(url:string,body:unknown,method:string){const result=await resource.perform(url,body,method);if(!result)return;await resource.reload();resource.setMessage(result.message);}
 function save(){
  const next:Record<string,string>={};
  if(!form.name.trim())next.name='Preencha este campo.';
  if(!validPhone(form.phone))next.phone='Informe telefone com DDD, com 10 ou 11 dígitos.';
  if(provider){for(const key of ['categories','specialties','neighborhoods'] as const)if(!form[key].length)next[key]='Selecione pelo menos uma opção.';if(!form.availability.trim())next.availability='Informe a disponibilidade.';}
  else if(!form.neighborhood)next.neighborhood='Selecione um bairro ou quadra da lista.';
  setLocal(next);if(Object.keys(next).length)return;
  void run('/admin/users/'+user.id,provider?{name:form.name,phone:form.phone,categories:form.categories,specialties:form.specialties,neighborhoods:form.neighborhoods,availability:form.availability}:{name:form.name,phone:form.phone,neighborhood:form.neighborhood},'PATCH');
 }
 function destroy(kind:'deactivate'|'delete'){
  if(!reason.trim()){setLocal({reason:'Informe o motivo, com até 500 caracteres.'});return;}
  setLocal({});
  const remove=kind==='delete';
  Alert.alert(remove?'Excluir esta conta?':'Inativar esta conta?',remove?`Os dados pessoais de ${user.name} serão eliminados e não poderão ser recuperados. Pedidos e avaliações antigos passam a mostrar "Usuário removido".`:`${user.name} não conseguirá mais entrar. ${provider?'Propostas pendentes serão retiradas':'Pedidos abertos serão cancelados'} e o histórico é preservado. Não há reativação nesta versão.`,[{text:'Voltar',style:'cancel'},{text:remove?'Excluir conta':'Inativar conta',style:'destructive',onPress:()=>void run('/admin/users/'+user.id+'/'+kind,{reason:reason.trim()},'POST')}]);
 }
 return <View style={ui.group}>
  <View style={ui.card}>
   <Text style={a.eyebrow}>{typeLabel(user.type).toLocaleUpperCase('pt-BR')}</Text>
   <Text style={styles.cardTitle}>{user.name}</Text>
   <Pills><StatusPill status={user.accountStatus}/>{user.approvalStatus?<StatusPill status={user.approvalStatus}/>:null}</Pills>
   {deleted?<Text style={styles.note}>Os dados pessoais desta conta foram eliminados.</Text>:<>
    <InfoRow label="E-mail" value={(user.email??'—')+(user.emailVerified?' · confirmado':' · não confirmado')}/>
    <InfoRow label="Telefone" value={formatPhone(user.phone)}/>
    <InfoRow label="CPF" value={user.cpf??'—'}/>
    {provider?<>
     <InfoRow label="Categorias" value={user.categories?.join(', ')||'—'}/>
     <InfoRow label="Especialidades" value={user.specialties?.join(', ')||'—'}/>
     <InfoRow label="Locais de atendimento" value={user.coverageLabels?.join(', ')||'—'}/>
     <InfoRow label="Disponibilidade" value={user.availability||'—'}/>
    </>:<InfoRow label="Bairro ou quadra" value={`${place||'—'} · ${user.city} – ${user.state}`}/>}
   </>}
   {user.approvalStatus==='Rejeitado'&&user.approvalReason?<InfoRow label="Motivo da rejeição" value={user.approvalReason}/>:null}
   <InfoRow label="Conta criada em" value={formatDate(user.createdAt)}/>
   {user.disabledAt?<InfoRow label="Inativada em" value={formatDate(user.disabledAt)}/>:null}
   {user.deletedAt?<InfoRow label="Excluída em" value={formatDate(user.deletedAt)}/>:null}
   {user.mustChangePassword&&active?<Text style={styles.note}>Senha provisória: a pessoa ainda não fez a troca do primeiro acesso.</Text>:null}
  </View>

  <Section title="Editar cadastro">
   {!active?<Text style={styles.note}>{deleted?'Esta conta foi excluída e não pode ser editada.':'Esta conta está inativa e não pode ser editada.'}</Text>:<>
    <Text style={styles.note}>E-mail, CPF e senha não podem ser alterados por aqui.</Text>
    <Field label="Nome" value={form.name} onChangeText={name=>setForm(old=>({...old,name}))} maxLength={150} autoCapitalize="words" editable={!busy} error={errors.name}/>
    <Field label="Telefone com DDD" value={form.phone} onChangeText={phone=>setForm(old=>({...old,phone}))} maxLength={16} keyboardType="phone-pad" editable={!busy} error={errors.phone}/>
    {provider?<ProviderFields catalog={catalog} value={form} onChange={next=>setForm(old=>({...old,...next}))} errors={errors} disabled={busy}/>
     :!catalog.data?<CatalogNotice error={catalog.error} retry={catalog.retry}/>
     :<View style={a.field}><Text style={ui.label}>Bairro ou quadra</Text><SelectionField label="Bairro ou quadra" options={catalog.data.neighborhoods} values={form.neighborhood?[form.neighborhood]:[]} disabled={busy} error={errors.neighborhood} onChange={v=>setForm(old=>({...old,neighborhood:v[0]??''}))}/><FieldError style={a.error}>{errors.neighborhood}</FieldError></View>}
    <Button label="Salvar alterações" disabled={busy||!catalog.data} onPress={save}/>
   </>}
  </Section>

  <Section title={provider?'Inativar conta':'Inativar ou excluir conta'}>
   {deleted?<Text style={styles.note}>Esta conta já foi excluída. Não há mais ações disponíveis.</Text>:<>
    <Text style={styles.note}>{active?(provider?'A conta de prestador não pode ser excluída, apenas inativada. Não é possível inativar com atendimento aceito ou em andamento.':'Inativar bloqueia o acesso e preserva os dados. Excluir elimina os dados pessoais. Nenhuma das duas é possível com solicitação aceita ou em andamento.'):(provider?'Esta conta já está inativa. A conta de prestador não pode ser excluída.':'Esta conta já está inativa. Ainda é possível excluí-la para eliminar os dados pessoais.')}</Text>
    {active||!provider?<Field label="Motivo (obrigatório)" value={reason} onChangeText={text=>{setReason(text);setLocal({});}} placeholder="Fica registrado no histórico da conta" multiline scrollEnabled={false} maxLength={500} editable={!busy} error={errors.reason}/>:null}
    <DangerButton label="Inativar conta" disabled={busy||!active} onPress={()=>destroy('deactivate')}/>
    {!provider?<DangerButton label="Excluir conta" disabled={busy} onPress={()=>destroy('delete')}/>:null}
    <Feedback busy={false} error={resource.error} message=""/>
   </>}
  </Section>

  <Section title="Histórico administrativo">
   {!events.length?<Text style={styles.note}>Nenhum registro administrativo nesta conta.</Text>:events.map(event=><View key={event.id} style={ui.card}><Text style={ui.label}>{actions[event.action]??event.action}</Text><Text style={styles.note}>{formatDate(event.createdAt)}</Text><Text style={styles.note}>{author(event)}</Text>{event.reason?<Text style={a.value}>Motivo: {event.reason}</Text>:null}</View>)}
  </Section>

  {/* RNF02.4: cancelamentos dos pedidos em que a conta é cliente, prestador escolhido ou autora (os 50 mais recentes). */}
  <Section title="Cancelamentos de pedidos">
   {!cancellations.length?<Text style={styles.note}>Nenhum cancelamento ligado a esta conta.</Text>:cancellations.map(item=><View key={item.id} style={ui.card}>
    <Text style={ui.label}>{item.category}</Text>
    <Text style={styles.note}>{cancellationPath(item.action)}{item.previousStatus?` · estava "${item.previousStatus}"`:''}</Text>
    <InfoRow label="Data e hora" value={cancellationWhen(item.createdAt)}/>
    <InfoRow label="Cancelado por" value={cancellationAuthor(item)}/>
    <InfoRow label="Motivo" value={cancellationReason(item.reason)}/>
   </View>)}
  </Section>
 </View>;
}
