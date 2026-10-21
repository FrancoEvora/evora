import type {SpatialSnapshot} from './heatmap.mjs';
export type Business={cnpj:string;name:string;cnae:string|null;activity:string;status:number|null;opened_on:string|null;municipality:string;city:string;state:string;neighborhood:string;address:string};
export type BusinessSnapshot={records:Business[];complete:boolean;reference:string;scope:string;municipality:string;rejected:number;duplicates:number;pages:number;cursor?:string|null;source_url:string};
export type TerritorySummary={population:number|null;occupied:number|null;vacant:number|null;occasional:number|null;income_sector_median:number|null;vacancy_share:number|null;coverage:Record<string,number>;sectors:number;issues:number;modeled:boolean;methodology:string};
export function normalizeBusinesses(records:Record<string,unknown>[],municipality:string):{records:Business[];rejected:number;duplicates:number};
export function businessGroups(records:Business[]):{cnae:string;activity:string;count:number}[];
export function summarizeTerritory(spatial:SpatialSnapshot,config:{latitude:number;longitude:number;radius?:number}):TerritorySummary|null;
