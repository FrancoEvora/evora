import {AppError} from './core.js';
import {normalizeBusinesses,businessGroups} from '../../shared/market-data.mjs';

async function publicJson(url){
 const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='minhareceita.org'||u.username||u.password||u.port)throw new AppError('Provedor empresarial não autorizado.');
 const response=await fetch(u,{redirect:'error',headers:{Accept:'application/json','User-Agent':'Aurora-Territorial/1.0 (+https://aurora-territorial.vercel.app)'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new AppError(`Minha Receita retornou HTTP ${response.status}. A leitura anterior foi preservada.`,502);
 const reader=response.body.getReader(),chunks=[];let length=0;
 while(true){const{value,done}=await reader.read();if(done)break;length+=value.length;if(length>5e6){await reader.cancel();throw new AppError('A resposta empresarial excedeu o limite de tamanho.',502);}chunks.push(value);}
 try{return JSON.parse(Buffer.concat(chunks).toString())}catch{throw new AppError('Resposta empresarial inválida.',502);}
}
export function businessReference(updated,today=new Date().toISOString().slice(0,10)){
 const value=typeof updated==='string'?updated:updated?.message;
 if(typeof value!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(value)||value.slice(0,7)>today.slice(0,7))throw new AppError('O provedor não informou uma data-base verificável.',502);
 if(value.length===10&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new AppError('Data-base empresarial inválida.',502);
 return value;
}
export async function fetchBusinessSource(job){
 const municipality=String(job.config?.municipality||'');if(!/^\d{7}$/.test(municipality))throw new AppError('Cadastre o código IBGE do município do ativo.');
 const updated=await publicJson('https://minhareceita.org/updated');
 const reference=businessReference(updated);
 const previous=job.snapshot?.business,same=previous?.reference===reference&&previous.municipality===municipality&&!previous.complete;
 let records=same?previous.records:[],cursor=same?previous.cursor:null,complete=false,pages=0,rejected=same?previous.rejected:0,duplicates=same?previous.duplicates:0;
 const source_url='https://minhareceita.org/?'+new URLSearchParams({municipio:municipality,limit:'256'});
 const visited=new Set();
 while(pages<4&&records.length<10000){
  const url=new URL(source_url);if(cursor){if(typeof cursor!=='string'||cursor.length>4096||visited.has(cursor))throw new AppError('Cursor empresarial inválido ou repetido.',502);visited.add(cursor);url.searchParams.set('cursor',cursor);}
  const page=await publicJson(url);if(!Array.isArray(page.data))throw new AppError('O provedor não retornou uma página empresarial válida.',502);
  const normalized=normalizeBusinesses(page.data,municipality);rejected+=normalized.rejected;duplicates+=normalized.duplicates;
  const all=new Map(records.map(r=>[r.cnpj,r]));for(const r of normalized.records){if(all.has(r.cnpj))duplicates++;all.set(r.cnpj,r);}const limited=all.size>10000;records=[...all.values()].slice(0,10000);pages++;
  cursor=page.cursor==null||page.cursor===''?null:String(page.cursor);if(limited)break;if(!cursor){complete=true;break;}
 }
 const groups=businessGroups(records),active=records.filter(r=>r.status===2).length;
 const business={records,complete,reference,municipality,scope:'Município inteiro; endereços cadastrais sem geocodificação. Não representa empresas dentro do raio.',source_url,cursor,rejected,duplicates,pages:(same?previous.pages:0)+pages};
 return {provider:'Receita Federal · via Minha Receita (comunitário)',source_url,fetched_at:new Date().toISOString(),reference,real_public_data:true,business,
  method:'CNPJ completo identifica estabelecimentos; matriz e filiais são distintas. CNAE principal classifica a atividade. Somente situação 2 é ativa. Sem QSA, telefones ou e-mails. A instância comunitária pode limitar consultas. Cobertura municipal parcial até concluir a paginação; máximo de 10.000 estabelecimentos nesta leitura.',
  rows:[{indicator:complete?'Estabelecimentos ativos no município':'Estabelecimentos ativos observados · leitura parcial',unit:'estabelecimentos',period:reference,value:active,raw:String(active),geography:'Município IBGE '+municipality,classification:complete?'Paginação concluída; atividade cadastral não comprova operação no endereço':'Coleta parcial sem representatividade estatística; não é total municipal nem contagem no raio'},...groups.slice(0,12).map(g=>({indicator:g.activity,unit:'estabelecimentos ativos observados',period:reference,value:g.count,raw:String(g.count),geography:'Município IBGE '+municipality,classification:'CNAE principal '+g.cnae+(complete?'':' · parcial')}))]};
}
