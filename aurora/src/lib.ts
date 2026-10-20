import {createClient} from '@supabase/supabase-js';
import type {Data,Role} from './types';
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured=Boolean(url&&key);
export const db=createClient(url||'https://unconfigured.supabase.co',key||'unconfigured',{auth:{storageKey:'aurora.auth.v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
export const canWrite=(role:Role)=>['owner','admin','manager','analyst'].includes(role);
export const canManage=(role:Role)=>['owner','admin','manager'].includes(role);
export const canAdmin=(role:Role)=>['owner','admin'].includes(role);
export const money=(n:number|null|undefined)=>n==null?'Não informado':Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0,notation:n>=1e6?'compact':'standard'}).format(n);
export const number=(n:number|null|undefined)=>n==null?'—':Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(n);
export function date(v:string|null|undefined,time=false){if(!v)return '—';return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',...(time?{hour:'2-digit',minute:'2-digit'}:{}),timeZone:'America/Sao_Paulo'}).format(new Date(v.length===10?v+'T12:00:00-03:00':v));}
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function errorText(e:unknown){const m=e instanceof Error?e.message:typeof e==='object'&&e&&'message'in e?String(e.message):'Não foi possível concluir. Tente novamente.'; if(/Invalid login credentials/i.test(m))return 'E-mail ou senha incorretos.';if(/Email not confirmed/i.test(m))return 'Confirme seu e-mail antes de entrar.';if(/rate limit/i.test(m))return 'Muitas tentativas. Aguarde alguns minutos.';if(/row-level security|permission denied/i.test(m))return 'Seu perfil não tem permissão para esta operação.';return m;}
export async function loadData(w:string,role:Role):Promise<Data>{
 const names={sources:'sources',sourceRuns:'source_runs',assets:'assets',actions:'actions',docs:'documents',notes:'notes',runs:'runs',alerts:'alerts',schedules:'schedules',members:'members',audit:'audit',invites:'invites',workItems:'work_items',licenses:'licenses',financial:'financial_lines',studies:'market_studies',points:'market_points',reports:'reports',reportAccess:'report_access',moduleGrants:'module_grants'};
 const pairs=await Promise.all(Object.entries(names).map(async([key,table])=>{
  if(role==='client'&&!['reports','reportAccess','members'].includes(key))return[key,[]];
  if((key==='audit'&&!canManage(role))||(key==='invites'&&!canAdmin(role)))return[key,[]];
  const q=db.from('aurora_'+table).select('*').eq('workspace_id',w);
  const {data,error}=await (['members','moduleGrants'].includes(key)?q:q.order('created_at',{ascending:false})).limit(['audit','sourceRuns'].includes(key)?100:1000);
  if(error)throw error;return[key,data||[]];
 })); return Object.fromEntries(pairs) as Data;
}
export async function analyze(workspaceId:string,assetId:string,prompt:string){const {data:{session}}=await db.auth.getSession();if(!session)throw new Error('Sua sessão expirou. Entre novamente.');const r=await fetch('/api/agent',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({workspaceId,assetId,prompt}),signal:AbortSignal.timeout(65000)});const v=await r.json();if(!r.ok)throw new Error(v.error||'A análise não pôde ser concluída.');return v as {result:string;model:string;id:string};}
export function download(name:string,content:string,type='application/json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
