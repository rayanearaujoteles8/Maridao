// RNF02.4: textos do registro de cancelamentos que o administrador consulta no detalhe da conta (GET /admin/users/:id).
export type CancellationRecord={id:string;requestId:string;category:string;action:string;by:'customer'|'provider'|'administration'|'system'|null;actorName:string|null;previousStatus:string|null;reason:string|null;createdAt:string};
const roles:Record<string,string>={customer:'Cliente',provider:'Prestador',administration:'Administração'};
// Autor: papel e nome de quem cancelou. Cancelamento automático não tem pessoa; conta sem nome mostra só o papel.
export function cancellationAuthor(item:Pick<CancellationRecord,'by'|'actorName'>){
 if(item.by==='system'||!item.by)return 'Sistema (automático)';
 const role=roles[item.by]??'Autor não identificado',name=item.actorName?.trim();
 return name?`${role} · ${name}`:role;
}
const paths:Record<string,string>={request_cancelled:'Solicitação cancelada',request_replaced:'Solicitação substituída por outra',account_closed:'Cancelada pelo encerramento da conta',support_cancelled:'Cancelada pela administração após relato de problema'};
export const cancellationPath=(action:string)=>paths[action]??'Solicitação cancelada';
// Depois do aceite o motivo é obrigatório; em pedido ainda aberto ele pode ficar vazio.
export const cancellationReason=(reason:string|null|undefined)=>reason?.trim()||'Não informado';
// Data e hora no fuso de Palmas, independente do fuso do aparelho.
export const cancellationWhen=(iso:string)=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Araguaina'}).format(new Date(iso)).replace(', ',' às ');
