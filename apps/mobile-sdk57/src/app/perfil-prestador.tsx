import {ProfileAvatar} from '@/components/profile-avatar';
import {useLocalSearchParams} from 'expo-router';
import { Appear } from '@/components/skeleton';
import {Text,View} from 'react-native';
import {PrivateScreen,usePrivateResource,Feedback,Button,useUi} from '@/components/private-screen';
import {useStyles} from '@/components/access-screen';
import {useCatalog} from '@/hooks/use-catalog';
import {RemovedNote,type AuthorRemoved} from '@/components/removed-user';
type Data={provider:{name:string;categories:string[];specialties:string[];neighborhoods:string[];availability:string;city:string;state:string;rating:string|null;review_count:number};reviews:({id:string;rating:number;comment:string;created_at:string}&AuthorRemoved)[];page:number;hasMore:boolean};
export default function ProviderProfile(){const styles=useStyles();const ui=useUi();const {id}=useLocalSearchParams<{id:string}>(),path=`/providers/${encodeURIComponent(id??'')}/profile`,r=usePrivateResource<Data>(path),catalog=useCatalog();
 async function more(){if(!r.data)return;const next=await r.perform(path+'?page='+(r.data.page+1));if(next)r.setData(old=>old?{...next,reviews:[...old.reviews,...next.reviews]}:next);}
 const options=[...(catalog.data?.coverageRegions??[]),...(catalog.data?.neighborhoods??[])];
 return <PrivateScreen title={r.data?.provider.name??'Perfil profissional'} onRefresh={r.refresh}><Feedback {...r} skeleton="detail"/>{r.data?<Appear style={{gap:24}}><View style={ui.card}><ProfileAvatar name={r.data.provider.name} id={id} size={88}/><Text style={styles.note}>{r.data.provider.city} – {r.data.provider.state}</Text><Text style={ui.label}>{r.data.provider.categories.join(' · ')}</Text><Text style={styles.note}>{r.data.provider.specialties.join(', ')}</Text><Text style={ui.label}>Onde atende</Text><Text style={styles.note}>{r.data.provider.neighborhoods.map(n=>options.find(o=>o.value===n)?.label??n).join(', ')}</Text><Text style={ui.label}>Disponibilidade</Text><Text style={styles.note}>{r.data.provider.availability}</Text><Text style={ui.label}>{r.data.provider.review_count?`${r.data.provider.rating} de 5 · ${r.data.provider.review_count} avaliações`:'Ainda não recebeu avaliações'}</Text></View>{r.data.reviews.map(review=><View key={review.id} style={ui.card}><Text style={ui.label}>{review.rating} de 5</Text><Text style={styles.note}>{review.comment||'Sem comentário.'}</Text><Text style={styles.note}>{new Date(review.created_at).toLocaleDateString('pt-BR')}</Text><RemovedNote label="Avaliação de" removed={review.author_removed} name={review.author_name}/></View>)}{r.data.hasMore?<Button label="Ver mais avaliações" disabled={r.busy} onPress={()=>void more()}/>:null}</Appear>:null}</PrivateScreen>;
}
