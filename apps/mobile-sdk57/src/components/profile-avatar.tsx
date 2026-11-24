import {useCallback,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {Image,Text,View} from 'react-native';
import {useSession} from './session';
import {api} from '@/lib/api';
import {useTheme} from '@/theme';
export function ProfileAvatar({name,id,size=48,photo}:{name:string;id?:string;size?:number;photo?:string|null}){
 const {session}=useSession();const {colors}=useTheme();const [loaded,setLoaded]=useState<string|null>(null);
 useFocusEffect(useCallback(()=>{let active=true;setLoaded(null);if(session&&photo===undefined)void api(id?`/providers/${encodeURIComponent(id)}/photo`:'/account/photo',{headers:{Authorization:`Bearer ${session.token}`}}).then(r=>{if(active)setLoaded(r.photo??null);}).catch(()=>{});return()=>{active=false;};},[session,id,photo]));
 const uri=photo===undefined?loaded:photo;
 return <View style={{width:size,height:size,borderRadius:size/2,overflow:'hidden',backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'}}>{uri?<Image source={{uri}} accessibilityLabel={`Foto de ${name}`} onError={()=>setLoaded(null)} style={{width:size,height:size}}/>:<Text accessible={false} style={{fontSize:size*0.42,fontWeight:'700',color:colors.text}}>{name.trim().charAt(0).toLocaleUpperCase('pt-BR')}</Text>}</View>;
}
