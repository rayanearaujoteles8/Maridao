import type {ReactNode} from 'react';
import {Pressable,StyleSheet,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
export const TOAST_EXIT_MS=320;
type Props={sheet?:boolean;lead:ReactNode;children:ReactNode;fill:string;border:string;shadow:string;leaving:boolean;onHold:()=>void;onResume:()=>void;onDismiss:()=>void};
// Mesma fila, acessibilidade e ações do aviso nativo, sem dependência de CanvasKit.
export function ToastDrop({lead,children,fill,border,leaving,onHold,onResume,onDismiss}:Props){
 const insets=useSafeAreaInsets();
 return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill,{top:insets.top+8,zIndex:25,alignItems:'center'}]}><Pressable onPressIn={onHold} onPressOut={onResume} onPress={onDismiss} style={{maxWidth:440,width:'92%',backgroundColor:fill,borderColor:border,borderWidth:1,borderRadius:24,padding:16,flexDirection:'row',gap:12,alignItems:'center',opacity:leaving?0:1}}>{lead}{children}</Pressable></View>;
}
