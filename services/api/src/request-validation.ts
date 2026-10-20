export class RequestInputError extends Error {
 fields: Record<string,string>;
 constructor(fields:Record<string,string>){super('Revise os campos informados.');this.fields=fields;}
}
export function localToday(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Araguaina',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=(name:string)=>parts.find(part=>part.type===name)?.value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
export function validateRequest(input:unknown,today=localToday()){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new RequestInputError({category:'Envie um formulário válido.'});
 const data=input as Record<string,unknown>;
 const keys=['category','description','neighborhood','preferredDate','preferredPeriod'];
 if(Object.keys(data).some(key=>!keys.includes(key)))throw new RequestInputError({category:'O formulário contém campos não permitidos.'});
 const errors:Record<string,string>={};
 const text=(key:string,max:number,required=true)=>{
  if(!required && (data[key]===undefined||data[key]===null))return '';
  const value=typeof data[key]==='string'?(data[key] as string).trim():'';
  if(typeof data[key]!=='string'||(required&&!value)||value.length>max)errors[key]=`Informe ${required?'este campo com ':''}até ${max} caracteres.`;
  return value;
 };
 const category=text('category',100),description=text('description',3000),neighborhood=text('neighborhood',100);
 const date=text('preferredDate',10,false),period=text('preferredPeriod',100,false);
 if(date){
  const match=date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed=new Date(date+'T12:00:00.000Z');
  if(!match||Number(match[1])<1900||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)errors.preferredDate='Informe uma data válida.';
  else if(date<today)errors.preferredDate='Escolha hoje ou uma data futura.';
 }
 if(Object.keys(errors).length)throw new RequestInputError(errors);
 return {category,description,neighborhood,preferredDate:date||null,preferredPeriod:period||null};
}
