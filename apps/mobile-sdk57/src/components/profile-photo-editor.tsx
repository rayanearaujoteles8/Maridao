import {useRef,useState} from 'react';
import * as ImagePicker from 'expo-image-picker';
import {Text,View} from 'react-native';
import {Button,usePrivateResource,useUi} from './private-screen';
import {ProfileAvatar} from './profile-avatar';
import {useToast} from './toast';
export function ProfilePhotoEditor({name}:{name:string}){
 const r=usePrivateResource<{photo:string|null}>('/account/photo'),ui=useUi(),toast=useToast();
 const [draft,setDraft]=useState<string|null|undefined>(),[picking,setPicking]=useState(false),[error,setError]=useState('');const pending=useRef(false);
 async function choose(){
  if(pending.current)return;pending.current=true;setPicking(true);setError('');
  try{const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:0.8,base64:true});
   if(result.canceled)return;const asset=result.assets[0];
   if(!asset.base64||asset.base64.length>6990508){setError('Escolha uma foto JPG, PNG ou WebP de até 5 MB.');return;}
   // Base64 returned by ImagePicker is JPEG on native; web retains the selected MIME type.
   const mime=asset.mimeType==='image/png'?'image/png':asset.mimeType==='image/webp'?'image/webp':'image/jpeg';
   setDraft(`data:${mime};base64,${asset.base64}`);
  }catch{setError('Não foi possível abrir suas fotos. Tente novamente.');}finally{pending.current=false;setPicking(false);}
 }
 async function save(){const result=await r.perform('/account/photo',{image:draft},'POST');if(result){r.setData({photo:result.photo});setDraft(undefined);toast.success(result.message);}}
 const busy=r.busy||picking;const photo=draft===undefined?r.data?.photo??null:draft;
 return <View style={{gap:14}}><View style={{alignItems:'center',gap:10}}><ProfileAvatar name={name} photo={photo} size={88}/><Text style={ui.label}>Sua foto de perfil</Text><Text style={{...ui.label,fontSize:13,fontWeight:'400',textAlign:'center'}}>Escolha uma foto em que seu rosto apareça bem.</Text></View><Button secondary label={picking?'Abrindo fotos…':photo?'Trocar foto':'Adicionar foto'} disabled={busy||!r.data} onPress={()=>void choose()}/>{photo?<Button secondary label="Remover foto" disabled={busy} onPress={()=>setDraft(null)}/>:null}{draft!==undefined?<><Button label={r.busy?'Salvando…':'Salvar foto'} disabled={busy} onPress={()=>void save()}/><Button secondary label="Cancelar alteração da foto" disabled={busy} onPress={()=>{setDraft(undefined);setError('');}}/></>:null}{error||r.error?<Text accessibilityRole="alert" style={ui.error}>{error||r.error}</Text>:null}<Text style={{...ui.label,fontSize:12,fontWeight:'400'}}>JPG, PNG ou WebP · até 5 MB</Text></View>;
}
