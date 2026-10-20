import type {WorkItem,WbsBaseline} from '../src/enterprise';
export function packageProgress(item:Partial<WorkItem>):number;
export function wbsMetrics(items:WorkItem[]):{included:number;excluded:number;progress:number;approved:number;deliverables:number;delivered:number;unplanned:number;unpriced:number};
export function scopeDefinition(item:WorkItem):Record<string,unknown>;
export function baselineChanges(items:WorkItem[],baseline?:WbsBaseline):{changed:string[];removed:string[]};
export function dictionaryCsv(items:WorkItem[],allItems?:WorkItem[]):string;
