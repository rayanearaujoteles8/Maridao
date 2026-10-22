// SQL expressions below receive only developer-owned column/parameter expressions.
// Keep stored values intact while supporting the pre-catalogue registrations.
export const categorySql=(expression:string)=>`CASE lower(btrim(${expression})) WHEN 'montagem de móveis' THEN 'montagem e desmontagem de móveis' ELSE lower(btrim(${expression})) END`;
export const coverageSql=(expression:string)=>`CASE lower(btrim(${expression})) WHEN 'taquaralto' THEN 'REGIAO:TAQUARALTO' ELSE btrim(${expression}) END`;
