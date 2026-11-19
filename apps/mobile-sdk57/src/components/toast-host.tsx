import { useContext, useEffect, useState } from 'react';
import { useIsFocused, useRoute } from 'expo-router';
import { HostContext, ToastSlot } from './toast';

// Folhas: as telas de ação que sobem de baixo (apresentadas como folha em src/app/_layout.tsx, que usa esta lista).
export const SHEET_ROUTES = ['nova-solicitacao', 'cancelar-solicitacao', 'avaliar', 'confirmar-conclusao', 'contestar-conclusao', 'trocar-senha-provisoria'] as const;
// A tela em que este componente está é uma folha?
export function useIsSheet() { return (SHEET_ROUTES as readonly string[]).includes(useRoute().name); }

// Ponto de aviso dentro de uma folha. A folha é uma apresentação nativa e cobre o aviso em gota montado na raiz; por isso
// a tela apresentada como folha inclui <ToastHost /> (filho direto do contêiner de tela inteira, depois do conteúdo) e o
// aviso passa a ser desenhado nela enquanto está em foco. Fora de folha, não faz nada. PrivateScreen já inclui.
export function ToastHost() {
  const host = useContext(HostContext);
  const focused = useIsFocused();
  const sheet = useIsSheet();
  const [key] = useState(() => Symbol('folha'));
  const claim = host?.claim;
  const active = focused && sheet;
  useEffect(() => active && claim ? claim(key) : undefined, [active, claim, key]);
  if (!host || !host.item || host.owner !== key) return null;
  return <ToastSlot key={host.item.id} item={host.item} onGone={host.remove} sheet />;
}
