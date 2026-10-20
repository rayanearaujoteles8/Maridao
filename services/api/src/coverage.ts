import { neighborhoods, isNeighborhood } from './catalog.ts';

// Product service areas, not administrative boundaries. Membership is explicit in /catalog.
export const coverageRegions = [
 { value: 'REGIAO:CENTRO', label: 'Centro / Plano Diretor', description: 'Quadras com identificação NE, NO, SE e SO do catálogo. Confira a relação abaixo.', neighborhoods: neighborhoods.filter(item => /^A[A-Z]*(NE|NO|SE|SO)(?:\s|$)/.test(item.value)).map(item => item.value) },
 { value: 'REGIAO:TAQUARALTO', label: 'Taquaralto', description: 'Etapas de Taquaralto, Santa Fé, Vale do Sol e Industrial de Taquaralto do catálogo. Aurenys são uma opção separada.', neighborhoods: neighborhoods.filter(item => /^TAQ\. /.test(item.value) || /\(TAQ\./.test(item.value) || item.value === 'INDUSTRIAL DE TAQUARALTO').map(item => item.value) },
 { value: 'REGIAO:AURENYS', label: 'Jardins Aureny I, II, III e IV', description: 'Os quatro Jardins Aureny.', neighborhoods: neighborhoods.filter(item => /^JARDIM AURENY (I|II|III|IV)$/.test(item.value)).map(item => item.value) },
];
export const cityCoverage = { value: 'CIDADE:PALMAS', label: 'Toda Palmas', description: 'Todas as localidades de Palmas presentes no catálogo, incluindo os distritos.', neighborhoods: neighborhoods.map(item => item.value) };
export const coverageOptions = [cityCoverage, ...coverageRegions];
export const isCoverage = (value: string) => isNeighborhood(value) || coverageOptions.some(item => item.value === value);
export const coverageLabel = (value: string) => coverageOptions.find(item => item.value === value)?.label ?? value;
export function matchingCoverage(neighborhood: string) {
 if (!isNeighborhood(neighborhood)) return [];
 return coverageOptions.filter(item => item.neighborhoods.includes(neighborhood)).map(item => item.value);
}
