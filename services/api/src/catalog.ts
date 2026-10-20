import { readFileSync } from 'node:fs';
export type CatalogOption = { value: string; label: string; aliases?: string[] };
export type ServiceCategory = CatalogOption & { specialties: string[] };
export const services = JSON.parse(readFileSync(new URL('../data/services.json', import.meta.url), 'utf8')) as ServiceCategory[];
export const neighborhoodSource = JSON.parse(readFileSync(new URL('../data/neighborhoods.json', import.meta.url), 'utf8')) as { source: string; collectedAt: string; description: string; items: CatalogOption[] };
export const neighborhoods = neighborhoodSource.items;
export const isNeighborhood = (value: string) => neighborhoods.some(item => item.value === value);
export const isCategory = (value: string) => services.some(item => item.value === value);
export const categorySpecialties = (categories: string[]) => new Set(services.filter(item => categories.includes(item.value)).flatMap(item => item.specialties));
