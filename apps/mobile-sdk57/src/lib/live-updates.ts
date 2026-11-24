// RNF01.1 no chat: com a conversa aberta, mensagens novas da outra parte chegam sem puxar para atualizar. A tela consulta a
// API no mesmo ritmo dos avisos (NotificationObserver, 10 s; ver src/hooks/use-polling.ts) e junta a resposta ao que já está
// na tela. Quando nada mudou, devolve o MESMO objeto: a conversa não redesenha e o texto que está sendo digitado fica.
export const POLL_MS=10000;
export type ChatMessage={id:string;mine:boolean;message:string;created_at:string};
export type ChatData<C extends {removed?:boolean}|undefined={removed?:boolean}|undefined>={messages:ChatMessage[];hasMore:boolean;canSend:boolean;counterpart?:C};
// `next` traz as 50 mensagens mais recentes. As que ainda não estão na tela entram no fim; as antigas já carregadas ficam.
// Se a conversa foi encerrada (ou o cliente excluiu a conta), o campo de envio some na mesma atualização.
export function mergeChat<T extends ChatData>(old:T,next:T):T{
 const shown=new Set(old.messages.map(item=>item.id)),added=next.messages.filter(item=>!shown.has(item.id));
 const closed=old.canSend!==next.canSend||(old.counterpart?.removed===true)!==(next.counterpart?.removed===true);
 if(!added.length&&!closed)return old;
 return {...old,canSend:next.canSend,counterpart:next.counterpart,messages:added.length?[...old.messages,...added]:old.messages};
}
