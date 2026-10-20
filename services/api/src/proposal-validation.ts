import {localToday} from './request-validation.ts';
export class ProposalInputError extends Error {
 fields:Record<string,string>;
 constructor(fields:Record<string,string>){super('Confira os campos da proposta.');this.fields=fields;}
}
export const validRequestId=(id:unknown):id is string=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
export function validateProposal(input:unknown,today=localToday()){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new ProposalInputError({description:'Preencha a proposta.'});
 const data=input as Record<string,unknown>,errors:Record<string,string>={};
 if(Object.keys(data).some(key=>!['amount','description','estimatedDuration','validUntil'].includes(key)))throw new ProposalInputError({description:'O formulário contém campos não permitidos.'});
 const text=(key:string,max:number)=>{const value=typeof data[key]==='string'?(data[key] as string).trim():'';if(!value||value.length>max)errors[key]=`Preencha este campo com até ${max} caracteres.`;return value;};
 const amount=text('amount',9).replace(',','.');
 if(!/^\d{1,6}(?:\.\d{1,2})?$/.test(amount))errors.amount='Informe um valor em reais, sem separador de milhar. Ex.: 150,00.';
 const [whole,fraction='']=amount.split('.');
 const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents<1||cents>99999999)errors.amount='Informe um valor entre R$ 0,01 e R$ 999.999,99.';
 const description=text('description',3000),estimatedDuration=text('estimatedDuration',200),validUntil=text('validUntil',10);
 const date=new Date(validUntil+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==validUntil||validUntil<today)errors.validUntil='Escolha hoje ou uma data futura.';
 if(Object.keys(errors).length)throw new ProposalInputError(errors);
 return {amount:(cents/100).toFixed(2),description,estimatedDuration,validUntil};
}
