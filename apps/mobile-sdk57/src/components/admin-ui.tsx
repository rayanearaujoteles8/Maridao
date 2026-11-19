import {useState,type PropsWithChildren,type ReactNode} from 'react';
import {Pressable,StyleSheet,Text,View,type TextInputProps} from 'react-native';
import Animated,{interpolateColor,useAnimatedStyle} from 'react-native-reanimated';
import {FieldError,FieldInput,useToggleProgress} from './field-motion';
import {useStyles} from './access-screen';
import {PressableScale} from './pressable-scale';
import {useStatusPulse} from './list-entrance';
import {PrivateScreen,useUi} from './private-screen';
import {SelectionField,CatalogNotice} from './selection-field';
import type {useCatalog} from '@/hooks/use-catalog';
import { themed, useTheme } from '@/theme';

// Peças compartilhadas pelas telas da área administrativa (src/app/admin).
export function AdminScreen({title,children,backHref='/admin',backLabel='Área administrativa',onRefresh}:PropsWithChildren<{title:string;backHref?:'/admin'|'/admin/usuarios'|'/admin/cadastros-em-analise';backLabel?:string;onRefresh?:()=>unknown}>){
 return <PrivateScreen title={title} backHref={backHref} backLabel={backLabel} onRefresh={onRefresh}>{children}</PrivateScreen>;
}

const tones:Record<string,'green'|'dark'|'pale'|'muted'|'danger'>={Ativa:'green',Aprovado:'dark','Em análise':'pale',Inativa:'muted','Excluída':'danger',Rejeitado:'danger'};
export function StatusPill({status}:{status:string}){
 const a=useA();
 const tone=tones[status]??'muted';
 // Pulso curto quando o status muda com a pílula na tela (ex.: cadastro aprovado ou rejeitado); na montagem, não.
 const pulse=useStatusPulse(status);
 return <Animated.Text accessibilityLabel={`Status: ${status}`} style={[a.pill,a[tone],pulse]}>{status}</Animated.Text>;
}
export function Pills({children}:PropsWithChildren){const a=useA();return <View style={a.pills}>{children}</View>;}
export function Eyebrow({children}:PropsWithChildren){const a=useA();return <Text style={a.eyebrow}>{children}</Text>;}
export function Section({title,children}:PropsWithChildren<{title:string}>){const ui=useUi();const a=useA();return <View style={ui.group}><Text accessibilityRole="header" style={a.section}>{title}</Text>{children}</View>;}
export function InfoRow({label,value}:{label:string;value:string}){const a=useA();return <View style={a.row}><Text style={a.eyebrow}>{label.toLocaleUpperCase('pt-BR')}</Text><Text style={a.value}>{value}</Text></View>;}

export function Field({label,error,hint,style,...props}:TextInputProps&{label:string;error?:string;hint?:string}){
 const styles=useStyles();const ui=useUi();const a=useA();const {colors}=useTheme();
 return <View style={a.field}><Text style={ui.label}>{label}</Text><FieldInput invalid={!!error} accessibilityLabel={label} accessibilityHint={error} autoCorrect={false} placeholderTextColor={colors.placeholder} {...props} style={[ui.input,props.multiline&&a.multiline,error?a.invalid:undefined,style]}/>{hint?<Text style={styles.note}>{hint}</Text>:null}<FieldError style={a.error}>{error}</FieldError></View>;
}
export function PasswordField({label,error,hint,...props}:TextInputProps&{label:string;error?:string;hint?:string}){
 const styles=useStyles();const ui=useUi();const a=useA();const {colors}=useTheme();
 const [visible,setVisible]=useState(false);
 return <View style={a.field}><Text style={ui.label}>{label}</Text><FieldInput invalid={!!error} accessibilityLabel={label} accessibilityHint={error} autoCorrect={false} autoCapitalize="none" autoComplete="off" maxLength={128} placeholderTextColor={colors.placeholder} {...props} secureTextEntry={!visible} style={[ui.input,error?a.invalid:undefined]}/>{hint?<Text style={styles.note}>{hint}</Text>:null}<FieldError style={a.error}>{error}</FieldError><Pressable accessibilityRole="button" accessibilityLabel={`${visible?'Ocultar':'Mostrar'} ${label.toLocaleLowerCase('pt-BR')}`} onPress={()=>setVisible(old=>!old)} style={a.toggle}><Text style={a.toggleText}>{visible?'Ocultar senha':'Mostrar senha'}</Text></Pressable></View>;
}
export function Chips<T extends string>({label,options,value,onChange,disabled=false}:{label:string;options:readonly {value:T;label:string}[];value:T;onChange:(value:T)=>void;disabled?:boolean}){
 const a=useA();
 return <View style={a.field}><Text style={a.eyebrow}>{label.toLocaleUpperCase('pt-BR')}</Text><View accessibilityRole="radiogroup" accessibilityLabel={label} style={a.chips}>{options.map(option=><Chip key={option.value} group={label} label={option.label} checked={option.value===value} disabled={disabled} onPress={()=>onChange(option.value)}/>)}</View></View>;
}
// Opção de um grupo: ao ser escolhida, o fundo preenche e a cor do texto acompanha (140 ms); ao deixar de ser, esvazia
// (110 ms). O preenchimento é uma camada por cima da borda, animada só na opacidade. "Reduzir movimento": troca seca.
function Chip({group,label,checked,disabled,onPress}:{group:string;label:string;checked:boolean;disabled:boolean;onPress:()=>void}){
 const a=useA();const {colors}=useTheme();
 const rest=colors.text,on=colors.onPrimaryAccent;
 const progress=useToggleProgress(checked);
 const fill=useAnimatedStyle(()=>({opacity:progress.get()}));
 const ink=useAnimatedStyle(()=>({color:interpolateColor(progress.get(),[0,1],[rest,on])}));
 return <Pressable accessibilityRole="radio" accessibilityLabel={`${group}: ${label}`} accessibilityState={{checked,disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[a.chip,pressed&&a.pressed]}><Animated.View pointerEvents="none" style={[a.chipFill,fill]}/><Animated.Text style={[a.chipText,ink]}>{checked?'✓ ':''}{label}</Animated.Text></Pressable>;
}
export function PrimaryButton({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean}){
 const a=useA();
 return <PressableScale accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{disabled}} onPress={onPress} style={a.primary}><Text style={a.primaryText}>{label}</Text><Text accessible={false} style={a.primaryArrow}>↗</Text></PressableScale>;
}
export function DangerButton({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean}){
 const a=useA();
 return <PressableScale accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{disabled}} onPress={onPress} style={a.dangerButton}><Text style={a.dangerText}>{label}</Text></PressableScale>;
}

export type ProviderWork={categories:string[];specialties:string[];neighborhoods:string[];availability:string};
// Categorias, especialidades, locais e disponibilidade: os mesmos seletores do cadastro e das configurações do prestador.
export function ProviderFields({catalog,value,onChange,errors,disabled}:{catalog:ReturnType<typeof useCatalog>;value:ProviderWork;onChange:(next:ProviderWork)=>void;errors:Record<string,string>;disabled:boolean}){
 const ui=useUi();const a=useA();
 if(!catalog.data)return <CatalogNotice error={catalog.error} retry={catalog.retry}/>;
 const services=catalog.data.services;
 const allowed=(categories:string[])=>[...new Set(services.filter(item=>categories.includes(item.value)).flatMap(item=>item.specialties))];
 const pick=(label:string,key:'categories'|'specialties'|'neighborhoods',field:ReactNode)=><View style={a.field}><Text style={ui.label}>{label}</Text>{field}<FieldError style={a.error}>{errors[key]}</FieldError></View>;
 return <>
  {pick('Categorias de serviço','categories',<SelectionField label="Categorias de serviço" options={services} multiple values={value.categories} disabled={disabled} error={errors.categories} onChange={categories=>onChange({...value,categories,specialties:value.specialties.filter(item=>allowed(categories).includes(item))})}/>)}
  {pick('Especialidades','specialties',<SelectionField label="Especialidades" options={allowed(value.categories).map(item=>({value:item,label:item}))} multiple values={value.specialties} disabled={disabled||!value.categories.length} error={errors.specialties} placeholder={value.categories.length?'Selecionar especialidades':'Escolha uma categoria primeiro'} onChange={specialties=>onChange({...value,specialties})}/>)}
  {pick('Locais de atendimento','neighborhoods',<SelectionField label="Locais de atendimento" options={[...catalog.data.coverageRegions,...catalog.data.neighborhoods]} multiple max={50} values={value.neighborhoods} disabled={disabled} error={errors.neighborhoods} onChange={selected=>onChange({...value,neighborhoods:selected.includes('CIDADE:PALMAS')?['CIDADE:PALMAS']:selected})}/>)}
  <Field label="Disponibilidade" value={value.availability} onChangeText={availability=>onChange({...value,availability})} placeholder="Ex.: segunda a sexta, das 8h às 18h" multiline scrollEnabled={false} maxLength={500} editable={!disabled} error={errors.availability}/>
 </>;
}

export const typeLabel=(type:string)=>type==='provider'?'Prestador':'Cliente';
export const formatDate=(iso:string|null|undefined)=>iso?new Date(iso).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
export function formatPhone(value:string|null|undefined){
 const d=(value??'').replace(/\D/g,'');
 return d.length===11?`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`:d.length===10?`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`:value||'—';
}

export const useA = themed(colors => StyleSheet.create({
 pills:{flexDirection:'row',flexWrap:'wrap',gap:8},
 pill:{alignSelf:'flex-start',borderRadius:12,paddingHorizontal:12,paddingVertical:7,fontSize:12,fontWeight:'700',overflow:'hidden'},
 green:{backgroundColor:colors.accent,color:colors.onAccent},
 dark:{backgroundColor:colors.ink,color:colors.onInkAccent},
 pale:{backgroundColor:colors.accentSoft,color:colors.onAccentSoft},
 muted:{backgroundColor:colors.neutral,color:colors.onNeutral},
 danger:{backgroundColor:colors.dangerSoft,color:colors.danger},
 eyebrow:{fontSize:10,fontWeight:'700',letterSpacing:1.2,color:colors.textMuted},
 section:{fontSize:22,lineHeight:28,fontWeight:'700',letterSpacing:-0.4,color:colors.text,marginTop:8},
 row:{gap:3},
 value:{fontSize:16,lineHeight:23,color:colors.text},
 field:{gap:8},
 multiline:{minHeight:96,textAlignVertical:'top'},
 invalid:{borderColor:colors.danger,borderWidth:2},
 error:{color:colors.danger,fontSize:14,lineHeight:20},
 toggle:{minHeight:44,justifyContent:'center',alignSelf:'flex-start',paddingHorizontal:4},
 toggleText:{fontSize:15,color:colors.text,textDecorationLine:'underline'},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
 chip:{minHeight:44,paddingHorizontal:14,justifyContent:'center',borderRadius:14,borderWidth:1,borderColor:colors.borderStrong,backgroundColor:colors.bg},
 chipFill:{position:'absolute',top:-1,right:-1,bottom:-1,left:-1,borderRadius:14,backgroundColor:colors.primary},
 chipText:{fontSize:14,fontWeight:'600',color:colors.text},
 primary:{minHeight:54,backgroundColor:colors.accent,borderRadius:18,paddingHorizontal:18,paddingVertical:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
 primaryText:{fontSize:16,fontWeight:'700',color:colors.onAccent,flexShrink:1},
 primaryArrow:{fontSize:22,color:colors.onAccent},
 dangerButton:{backgroundColor:colors.dangerSoft,minHeight:54,borderRadius:16,padding:16,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.danger},
 dangerText:{fontSize:16,fontWeight:'700',color:colors.danger},
 pressed:{opacity:0.7},
}));
