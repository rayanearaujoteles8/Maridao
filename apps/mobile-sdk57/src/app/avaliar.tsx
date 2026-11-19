import {useState} from 'react';
import {router,useLocalSearchParams,type Href} from 'expo-router';
import {Text,TextInput,View} from 'react-native';
import {PrivateScreen,usePrivateResource,Feedback,Button,useUi} from '@/components/private-screen';
import {useStyles} from '@/components/access-screen';
import {StatusBadge} from '@/components/workflow-screen';
import {StarRating} from '@/components/star-rating';
import {RemovedNote,type AuthorRemoved} from '@/components/removed-user';
import { useTheme } from '@/theme';
type Review={rating:number;comment:string}&AuthorRemoved;
type Request={status:string;category:string;can_review?:boolean};
// UC08 — a avaliação só é oferecida quando a API diz que pode (can_review: cliente do pedido, "Concluída", ainda sem avaliação).
export default function ReviewScreen(){const styles=useStyles();const {colors}=useTheme();const ui=useUi();const {id}=useLocalSearchParams<{id:string}>();const base=`/requests/${encodeURIComponent(id??'')}`,path=base+'/review',r=usePrivateResource<{review:Review|null}>(path),q=usePrivateResource<{request:Request;role:'customer'|'provider'}>(base+'/proposals');const [rating,setRating]=useState(0),[comment,setComment]=useState('');
 const back:Href={pathname:'/propostas',params:{id}};
 const request=q.data?.request;
 async function save(){const result=await r.perform(path,{rating,comment},'POST');if(result){r.setData(result);r.setMessage('Avaliação registrada. Obrigado por compartilhar sua experiência.');}}
 return <PrivateScreen title="Avaliar atendimento" backHref={back} backLabel="Voltar ao atendimento" onRefresh={()=>Promise.all([r.refresh(),q.refresh()])}>
  <Feedback busy={r.busy||(q.busy&&!q.data)} error={r.error||(q.data?'':q.error)} message={r.message} skeleton="form" data={r.data&&q.data?r.data:null}/>
  {r.data?.review?<View style={ui.card}><Text style={ui.label}>{q.data?.role==='provider'?'Nota do cliente':'Sua nota'}: {r.data.review.rating} de 5</Text><Text style={styles.note}>{r.data.review.comment||'Sem comentário.'}</Text><RemovedNote label="Avaliação de" removed={r.data.review.author_removed} name={r.data.review.author_name}/></View>
  :r.data&&request?.can_review?<View style={ui.group}><Text style={styles.note}>Avalie a qualidade do serviço realizado. O comentário será público no perfil do prestador; evite dados pessoais.</Text><Text style={ui.label}>Sua nota: {rating?`${rating} de 5`:'toque em uma estrela'}</Text><StarRating value={rating} onChange={setRating} disabled={r.busy}/><TextInput placeholderTextColor={colors.placeholder} accessibilityLabel="Comentário público sobre o atendimento" placeholder="Como foi o serviço? (opcional)" value={comment} onChangeText={setComment} multiline maxLength={1000} style={ui.input} editable={!r.busy}/><Button label="Publicar avaliação" disabled={r.busy||!rating} onPress={()=>void save()}/></View>
  :r.data&&request?<View style={ui.group}>
   <View accessible accessibilityRole="alert" style={ui.card}><Text style={ui.label}>Avaliação indisponível</Text><StatusBadge status={request.status}/><Text style={styles.note}>{q.data?.role==='provider'?'Somente o cliente da solicitação pode avaliar o atendimento.':request.status==='Cancelada'?'Esta solicitação foi cancelada e não pode ser avaliada.':request.status==='Concluída'?'Este atendimento não está disponível para avaliação.':'A avaliação fica disponível após a conclusão confirmada.'}</Text></View>
   <Button label="Voltar ao atendimento" onPress={()=>router.dismissTo(back)}/>
  </View>:null}
 </PrivateScreen>;
}
