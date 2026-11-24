import {cursor} from './team-workflows.ts';
import {WorkflowError} from './workflow-error.ts';

export function notificationQuery(accountId:string,query:Record<string,unknown>){
 if(Object.keys(query).some(key=>key!=='before'&&key!=='after'))throw new WorkflowError(400,'Filtro de notificações inválido.');
 const before=cursor(query.before),after=query.after==='0'?'0':cursor(query.after);
 if(before&&after)throw new WorkflowError(400,'Use apenas um cursor de notificações.');
 return {
  text:after
   ?'SELECT id,request_id,title,created_at,read_at FROM maridao.notifications WHERE account_id=$1 AND id>$2::bigint ORDER BY id ASC LIMIT 101'
   :'SELECT id,request_id,title,created_at,read_at FROM maridao.notifications WHERE account_id=$1 AND ($2::bigint IS NULL OR id<$2::bigint) ORDER BY id DESC LIMIT 31',
  values:[accountId,after??before],limit:after?100:30,
 };
}
