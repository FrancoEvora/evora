import {boundsOf,circleGeometry,clipGeometry,geometryArea} from './heatmap.mjs';

export function normalizeBusinesses(records,municipality){
 const byId=new Map();let rejected=0;
 for(const row of records){
  const cnpj=String(row.cnpj||'').replace(/[./-]/g,'').toUpperCase(),code=String(row.codigo_municipio_ibge||'');
  if(!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)||code!==String(municipality)){rejected++;continue;}
  const status=Number(row.situacao_cadastral),cnae=String(row.cnae_fiscal||'').padStart(7,'0');
  byId.set(cnpj,{cnpj,name:String(row.nome_fantasia||row.razao_social||'Estabelecimento').slice(0,200),
   cnae:/^\d{7}$/.test(cnae)&&cnae!=='0000000'?cnae:null,activity:String(row.cnae_fiscal_descricao||'Atividade não informada').slice(0,250),
   status:Number.isInteger(status)?status:null,opened_on:/^\d{4}-\d{2}-\d{2}$/.test(row.data_inicio_atividade||'')?row.data_inicio_atividade:null,
   municipality:code,city:String(row.municipio||'').slice(0,120),state:String(row.uf||'').slice(0,2),
   neighborhood:String(row.bairro||'').slice(0,120),address:[row.descricao_tipo_de_logradouro,row.logradouro,row.numero].filter(Boolean).join(' ').slice(0,250)});
 }
 return {records:[...byId.values()],rejected,duplicates:records.length-rejected-byId.size};
}
export function businessGroups(records){
 const groups=new Map();
 for(const record of records.filter(r=>r.status===2)){const key=record.cnae||'unknown',g=groups.get(key)||{cnae:key,activity:record.activity,count:0};g.count++;groups.set(key,g);}
 return [...groups.values()].sort((a,b)=>b.count-a.count||a.cnae.localeCompare(b.cnae));
}
export function summarizeTerritory(spatial,{latitude,longitude,radius=3}){
 if(!spatial?.features||spatial.scope?.radius_km<radius)return null;
 const circle=circleGeometry(latitude,longitude,radius),area=geometryArea(circle),box=boundsOf(circle);
 const totals={population:0,occupied:0,vacant:0,occasional:0},covered={population:0,occupied:0,vacant:0,occasional:0,income:0},incomes=[];
 let sectors=0,issues=0,incomeEligible=0,incomeValid=0;
 for(const f of spatial.features){
  if(!['Polygon','MultiPolygon'].includes(f.geometry?.type))continue;
  const b=boundsOf(f.geometry);if(b[0]>box[2]||b[2]<box[0]||b[1]>box[3]||b[3]<box[1])continue;
  try{
   const clipped=clipGeometry(f.geometry,circle);if(!clipped)continue;
   const a=geometryArea(clipped),p=f.properties||{};if(!(p.area_km2>0))continue;sectors++;
   for(const k of Object.keys(totals))if(typeof p[k]==='number'&&Number.isFinite(p[k])&&p[k]>=0){totals[k]+=p[k]*Math.min(1,a/p.area_km2);covered[k]+=a;}
   // Income does not apply to a sector with no occupied private households.
   // Missing household counts remain eligible, conservatively preserving missingness.
   if(p.occupied!==0){incomeEligible++;if(typeof p.income==='number'&&Number.isFinite(p.income)&&p.income>=0){incomes.push(p.income);incomeValid++;covered.income+=a;}}
  }catch{issues++;}
 }
 const coverage=Object.fromEntries(Object.entries(covered).map(([key,a])=>[key,Math.min(1,a/area)]));
 coverage.income_area=coverage.income;coverage.income=incomeEligible?incomeValid/incomeEligible:0;
 for(const k of Object.keys(totals))if(coverage[k]<.95)totals[k]=null;
 incomes.sort((a,b)=>a-b);const n=incomes.length;
 const income_sector_median=coverage.income>=.95&&n?(n%2?incomes[(n-1)/2]:(incomes[n/2-1]+incomes[n/2])/2):null;
 const housing=totals.occupied===null||totals.vacant===null||totals.occasional===null?null:totals.occupied+totals.vacant+totals.occasional;
 return {...totals,income_sector_median,vacancy_share:housing>0?totals.vacant/housing:null,coverage,sectors,issues,
  modeled:true,methodology:'População e domicílios: estimativa proporcional à área de interseção de cada setor, com distribuição uniforme. Valores ausentes quando a cobertura válida é menor que 95%. Rendimento: mediana não ponderada das médias dos setores residenciais que interceptam o recorte; cobertura por número de setores residenciais com valor válido, não por área. Setores com zero particulares ocupados são excluídos; contagem de ocupados ausente é tratada conservadoramente como elegível. Não é rendimento médio da população no raio.'};
}
