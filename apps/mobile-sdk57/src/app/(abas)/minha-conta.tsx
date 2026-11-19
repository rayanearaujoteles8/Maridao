import { useCallback, useRef, useState } from 'react';
import { PressableScale } from '@/components/pressable-scale';
import { Redirect, useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStyles } from '@/components/access-screen';
import { TAB_EDGES } from '@/components/tab-bar';
import { useSession } from '@/components/session';
import { api, ApiError } from '@/lib/api';
import {CustomerDashboard,type CustomerRequest} from '@/components/customer-dashboard';
import { Skeleton } from '@/components/skeleton';
import { themed } from '@/theme';

type Profile = { name: string; neighborhood: string; city: string; state: string; role: 'customer' | 'provider' | 'admin'; mustChangePassword?: boolean; approvalStatus?: 'Em análise' | 'Aprovado' | 'Rejeitado'; approvalReason?: string };
// Últimos pedidos do painel: os que esperam a confirmação do cliente vêm primeiro, para não ficarem escondidos.
const recent=(list:CustomerRequest[])=>[...list.filter(item=>item.can_confirm_completion),...list.filter(item=>!item.can_confirm_completion)].slice(0,2);
export default function AccountScreen() {
 const s=useS();const styles=useStyles();
  const { session, setSession } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false), refreshRun = useRef(0);
  const [reload, setReload] = useState(0);
  const reloadKey=String(reload);
  const [requests,setRequests]=useState<CustomerRequest[]>([]);
  const [requestsLoading,setRequestsLoading]=useState(true);
  const [requestsError,setRequestsError]=useState('');
  // Aba já carregada para esta sessão: ao voltar o foco, os dados são atualizados em silêncio (ver o efeito mais abaixo),
  // sem apagar a tela nem perder a rolagem. Só a primeira carga (ou a de outra conta) mostra os blocos-fantasma.
  const shownFor = useRef<string | null>(null), shownKey = useRef('');
  useFocusEffect(useCallback(() => {
    let active = true; refreshRun.current++;
    if (session && shownFor.current === session.token && shownKey.current === reloadKey) return () => { refreshRun.current++; };
    shownKey.current = reloadKey;
    setProfile(null); setError('');
    setRequests([]);setRequestsLoading(true);setRequestsError('');
    if (session) api('/auth/me?refresh='+reloadKey, { headers: { Authorization: `Bearer ${session.token}` } })
      .then(async result => {
        if(!active)return;
        setProfile(result.user);shownFor.current=session.token;
        // Papel e senha provisória vão para a sessão; o SessionGate (_layout) leva o admin para /admin e a troca obrigatória para a tela dela.
        const role=result.user.role,must=result.user.mustChangePassword===true;
        if(session.role!==role||(session.mustChangePassword===true)!==must)setSession({...session,role,mustChangePassword:must});
        if(!must&&(role==='customer'||role==='provider')){
          try{
            const feed=await api('/requests?page=1',{headers:{Authorization:`Bearer ${session.token}`}});
            if(active)setRequests(recent(feed.requests));
          }catch(failure){
            if(!active)return;
            if(failure instanceof ApiError&&failure.status===401)setSession(null);
            else setRequestsError('Não foi possível carregar as solicitações.');
          }
        }
        if(active)setRequestsLoading(false);
      })
      .catch(failure => {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === 401) setSession(null);
        else setError(failure instanceof Error ? failure.message : 'Não foi possível carregar sua conta.');
      });
    return () => { active = false; refreshRun.current++; };
  }, [session, setSession, reloadKey]));
  // Puxar para atualizar: refaz as mesmas duas cargas sem apagar o que está na tela; troca de foco descarta a resposta.
  const refresh = useCallback(async () => {
    if (!session) return;
    const run = ++refreshRun.current, headers = { Authorization: `Bearer ${session.token}` };
    try {
      const result = await api('/auth/me?refresh=' + Date.now(), { headers });
      if (run !== refreshRun.current) return;
      setError(''); setProfile(result.user);
      const role = result.user.role, must = result.user.mustChangePassword === true;
      if (session.role !== role || (session.mustChangePassword === true) !== must) setSession({ ...session, role, mustChangePassword: must });
      if (must || (role !== 'customer' && role !== 'provider')) return;
      try {
        const feed = await api('/requests?page=1', { headers });
        if (run === refreshRun.current) { setRequests(recent(feed.requests)); setRequestsError(''); }
      } catch (failure) {
        if (run !== refreshRun.current) return;
        if (failure instanceof ApiError && failure.status === 401) setSession(null);
        else setRequestsError('Não foi possível carregar as solicitações.');
      }
    } catch (failure) {
      if (run !== refreshRun.current) return;
      if (failure instanceof ApiError && failure.status === 401) setSession(null);
      else setError(failure instanceof Error ? failure.message : 'Não foi possível carregar sua conta.');
    }
  }, [session, setSession]);
  useFocusEffect(useCallback(() => { if (session && shownFor.current === session.token) void refresh(); }, [session, refresh]));
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
  if(profile&&profile.role!=='admin'&&!profile.mustChangePassword)return <CustomerDashboard role={profile.role} profile={profile} requests={requests} requestsLoading={requestsLoading} requestsError={requestsError} accountError={error} signingOut={busy} onRetry={()=>setReload(value=>value+1)} onRefresh={refresh} onLogout={logout}/>;
  return <SafeAreaView edges={TAB_EDGES} style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
    <Text accessibilityRole="header" style={styles.title}>Minha conta</Text>
    {!error ? <Skeleton shape="detail" /> : null}
    {error ? <><Text accessibilityRole="alert" style={s.error}>{error}</Text><Pressable accessibilityRole="button" style={s.retry} onPress={() => setReload(value => value + 1)}><Text style={styles.plain}>Tentar carregar novamente</Text></Pressable></> : null}
    <PressableScale accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy, busy }} onPress={logout} style={s.button}><Text style={s.buttonText}>{busy ? 'Saindo…' : 'Sair da conta'}</Text></PressableScale>
  </ScrollView></SafeAreaView>;
}
const useS = themed(colors => StyleSheet.create({ button: { backgroundColor: colors.primary, minHeight: 56, padding: 18, borderRadius: 16, alignItems: 'center' }, buttonText: { color: colors.onPrimary, fontSize: 17, fontWeight: '700' }, error: { color: colors.danger, fontSize: 16, lineHeight: 24 }, retry: { minHeight: 44, justifyContent: 'center' } }));
