import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
export type Option = { value: string; label: string; aliases?: string[] };
export type Catalog = { services: (Option & { specialties: string[] })[]; neighborhoods: Option[] };
let cached: Catalog | null = null;
let pending: Promise<Catalog> | null = null;
export function useCatalog() {
 const [data,setData]=useState<Catalog|null>(cached);
 const [error,setError]=useState('');
 const [version,setVersion]=useState(0);
 const retry=useCallback(()=>setVersion(value=>value+1),[]);
 useEffect(()=>{
  let active=true;setError('');
  if(cached){setData(cached);return;}
  pending ??= api('/catalog').then(result=>{cached=result;return result;}).finally(()=>{pending=null;});
  pending.then(result=>{if(active)setData(result);}).catch(()=>{if(active)setError('Não foi possível carregar as opções.');});
  return ()=>{active=false;};
 },[version]);
 return {data,error,retry};
}
