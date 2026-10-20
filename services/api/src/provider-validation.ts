import { validCpf } from './customer-validation.ts';
export class ProviderInputError extends Error {
 fields: Record<string,string>;
 constructor(fields: Record<string,string>) { super('Revise os campos informados.'); this.fields=fields; }
}
export function validCnpj(document: string) {
 if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(document) || /^(\d)\1{13}$/.test(document)) return false;
 const calculate = (base: string) => {
  let weight=2, sum=0;
  for (let i=base.length-1;i>=0;i--) { sum+=(base.charCodeAt(i)-48)*weight; weight=weight===9?2:weight+1; }
  const rest=sum%11; return rest<2?'0':String(11-rest);
 };
 const first=calculate(document.slice(0,12));
 return document.slice(-2)===first+calculate(document.slice(0,12)+first);
}
export function validateProvider(input: unknown) {
 if (!input || typeof input!=='object' || Array.isArray(input)) throw new ProviderInputError({name:'Envie um formulário válido.'});
 const source=input as Record<string,unknown>;
 const keys=['name','email','phone','password','documentType','document','categories','specialties','neighborhoods','availability'];
 if (Object.keys(source).some(key=>!keys.includes(key))) throw new ProviderInputError({name:'O formulário contém campos não permitidos.'});
 const errors: Record<string,string>={};
 const text=(key: string,max: number) => {
  const value=typeof source[key]==='string' ? (source[key] as string).trim():'';
  if (!value || value.length>max) errors[key]=`Preencha este campo com até ${max} caracteres.`;
  return value;
 };
 const name=text('name',150), email=text('email',254).toLowerCase();
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email='Informe um e-mail válido.';
 const rawPhone=text('phone',30), phone=rawPhone.replace(/\D/g,'');
 if (!/^[\d\s().-]+$/.test(rawPhone) || !/^\d{10,11}$/.test(phone)) errors.phone='Informe telefone com DDD.';
 const password=typeof source.password==='string'?source.password:'';
 if (!password.trim() || [...password].length<8 || [...password].length>128) errors.password='Use uma senha de 8 a 128 caracteres.';
 const documentType=text('documentType',4);
 const rawDocument=text('document',25).toUpperCase();
 const document=rawDocument.replace(/[.\s/\-]/g,'');
 if (!['CPF','CNPJ'].includes(documentType)) errors.documentType='Selecione CPF ou CNPJ.';
 if (documentType==='CPF' ? !validCpf(document) : documentType==='CNPJ' ? !validCnpj(document) : true) errors.document='Confira os dados do documento.';
 const list=(key:string,limit:number)=>{
  const value=source[key];
  if (!Array.isArray(value) || value.length<1 || value.length>limit || value.some(item=>typeof item!=='string'||!item.trim()||item.trim().length>100)) { errors[key]='Informe pelo menos um item, com até 100 caracteres por item.'; return [] as string[]; }
  return [...new Set((value as string[]).map(item=>item.trim()))];
 };
 const categories=list('categories',20),specialties=list('specialties',20),neighborhoods=list('neighborhoods',50),availability=text('availability',500);
 if (Object.keys(errors).length) throw new ProviderInputError(errors);
 return {name,email,phone,password,documentType,document,categories,specialties,neighborhoods,availability};
}
