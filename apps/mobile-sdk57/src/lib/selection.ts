export type SearchOption = {value:string;label:string;aliases?:string[]};
export const normalizeOption = (text:string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function filterOptions<T extends SearchOption>(options:T[],search:string):T[]{
 const terms=normalizeOption(search).split(' ').filter(Boolean);
 return options.filter(item=>{const text=normalizeOption([item.label,item.value,...(item.aliases??[])].join(' '));return terms.every(term=>text.includes(term));});
}
