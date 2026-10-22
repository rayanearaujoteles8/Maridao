import { useCallback, useRef, useState } from 'react';
import { Redirect, useFocusEffect, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, styles } from '@/components/access-screen';
import { useSession } from '@/components/session';
import { api, ApiError } from '@/lib/api';
import {CustomerDashboard,type CustomerRequest} from '@/components/customer-dashboard';

type Profile = { name: string; neighborhood: string; city: string; state: string; role: 'customer' | 'provider' };
export default function AccountScreen() {
  const { session, setSession } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [reload, setReload] = useState(0);
  const [requests,setRequests]=useState<CustomerRequest[]>([]);
  const [requestsLoading,setRequestsLoading]=useState(true);
  const [requestsError,setRequestsError]=useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    setProfile(null); setError('');
    setRequests([]);setRequestsLoading(true);setRequestsError('');
    if (session) api('/auth/me', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(async result => {
        if(!active)return;
        setProfile(result.user);
        if(result.user.role==='customer'){
          try{
            const feed=await api('/requests?page=1',{headers:{Authorization:`Bearer ${session.token}`}});
            if(active)setRequests(feed.requests.slice(0,2));
          }catch(failure){
            if(!active)return;
            if(failure instanceof ApiError&&failure.status===401)setSession(null);
            else setRequestsError('Não foi possível carregar seus últimos pedidos.');
          }
        }
        if(active)setRequestsLoading(false);
      })
      .catch(failure => {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === 401) setSession(null);
        else setError(failure instanceof Error ? failure.message : 'Não foi possível carregar sua conta.');
      });
    return () => { active = false; };
  }, [session, setSession, reload]));
  if (!session) return <Redirect href="/entrar" />;
  async function logout() {
    if (pending.current || !session) return;
    pending.current = true; setBusy(true); setError('');
    try { await api('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${session.token}` } }); setSession(null); }
    catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) setSession(null);
      else setError('Não foi possível encerrar a sessão no servidor. Confira a conexão e tente sair novamente.');
    } finally { pending.current = false; setBusy(false); }
  }
  if(profile?.role==='customer')return <CustomerDashboard profile={profile} requests={requests} requestsLoading={requestsLoading} requestsError={requestsError} accountError={error} signingOut={busy} onRetry={()=>setReload(value=>value+1)} onLogout={logout}/>;
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
    <Text accessibilityRole="header" style={styles.title}>Minha conta</Text>
    {profile ? <><Text style={styles.cardTitle}>Olá, {profile.name}!</Text><Text style={styles.description}>{profile.neighborhood} · {profile.city} – {profile.state}</Text><Text style={styles.note}>{profile.role === 'provider' ? 'Você está conectado como prestador. Consulte os pedidos disponíveis para seus serviços e locais de atendimento.' : 'Você está conectado como cliente. Use a busca para encontrar profissionais. Você também pode publicar uma nova solicitação de serviço.'}</Text></> : !error ? <Text style={styles.description}>Conferindo sua sessão…</Text> : null}
    {profile ? <Pressable accessibilityRole="button" style={s.button} onPress={() => router.push('./solicitacoes')}><Text style={s.buttonText}>{profile.role === 'provider' ? 'Solicitações e propostas' : 'Minhas solicitações'}</Text></Pressable> : null}
    {error ? <><Text accessibilityRole="alert" style={s.error}>{error}</Text><Pressable accessibilityRole="button" style={s.retry} onPress={() => setReload(value => value + 1)}><Text>Tentar carregar novamente</Text></Pressable></> : null}
    <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy, busy }} onPress={logout} style={({ pressed }) => [s.button, (pressed || busy) && { opacity: 0.7 }]}><Text style={s.buttonText}>{busy ? 'Saindo…' : 'Sair da conta'}</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ button: { backgroundColor: colors.black, minHeight: 56, padding: 18, borderRadius: 16, alignItems: 'center' }, buttonText: { color: colors.white, fontSize: 17, fontWeight: '700' }, error: { color: '#A32121', fontSize: 16, lineHeight: 24 }, retry: { minHeight: 44, justifyContent: 'center' } });
