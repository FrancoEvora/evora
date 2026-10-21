export const environmentalKeys:string[];
export const environmentalColors:Record<string,string>;
export type EnvironmentalLayer={id:string;title:string;source_url:string;available:boolean;truncated:boolean;returned:number;issues:number;error?:string;reference?:string};
export type EnvironmentSnapshot={applicable:boolean;state:string;complete:boolean;scope:{latitude:number;longitude:number;radius_km:number};layers:EnvironmentalLayer[];notice:string};
export function intersects(a:GeoJSON.Geometry|null,b:GeoJSON.Geometry|null):boolean;
export function environmentalSelection(snapshot:{spatial?:{features:GeoJSON.Feature[]}}|undefined,latitude:number,longitude:number,radius:number):{features:GeoJSON.Feature[];issues:number};
export function environmentalDate(value:unknown):string;
