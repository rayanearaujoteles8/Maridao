import type {Pool} from 'pg';
// O banco serializa trabalhadores concorrentes e impede duplicação por delivery_id.
export async function deliverNotifications(db:Pick<Pool,'query'>){
 const result=await db.query<{delivered:number;failed:number}>('SELECT * FROM maridao.deliver_notifications(100)');
 return result.rows[0];
}
