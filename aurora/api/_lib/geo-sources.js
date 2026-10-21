import {readFile} from 'node:fs/promises';
import {AppError} from './core.js';
import manifest from '../../shared/census/manifest.json' with {type:'json'};

const cache = new Map();
const hosts = new Set(['geoservicos.ibge.gov.br', 'maps.mail.ru']);
export function studyBounds(config) {
 const lat=Number(config.latitude),lon=Number(config.longitude);
 if(config.latitude==null||config.longitude==null||!Number.isFinite(lat)||!Number.isFinite(lon)||lat< -34||lat>6||lon< -74||lon> -28)throw new AppError('Informe coordenadas válidas no Brasil.');
 // Conservative envelope enclosing every supported study circle (up to 7 km).
 const radius=7,dy=radius/110.5,dx=dy/Math.cos(lat*Math.PI/180);
 return {latitude:lat,longitude:lon,radius_km:radius,bbox:[lon-dx,lat-dy,lon+dx,lat+dy].map(x=>Number(x.toFixed(7)))};
}
async function readJson(url,options={},timeout=35000) {
 const u=new URL(url);if(u.protocol!=='https:'||!hosts.has(u.hostname)||u.username||u.password||u.port)throw new AppError('Fonte geográfica não autorizada.');
 const r=await fetch(u,{...options,redirect:'error',signal:AbortSignal.timeout(timeout),headers:{Accept:'application/json','User-Agent':'Aurora-Territorial/1.0 (+https://aurora-territorial.vercel.app)',...options.headers}});
 if(!r.ok)throw new AppError(`A fonte geográfica retornou HTTP ${r.status}. A leitura anterior foi preservada.`,502);
 const reader=r.body.getReader(),chunks=[];let size=0;
 while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>6e6){await reader.cancel();throw new AppError('Recorte muito detalhado para esta consulta. A leitura anterior foi preservada.',502)}chunks.push(x.value)}
 try{return JSON.parse(Buffer.concat(chunks).toString())}catch{throw new AppError('Resposta geográfica inválida.',502)}
}
async function statsFor(code) {
 if(!manifest.states.includes(code))return {};
 if(!cache.has(code))cache.set(code,readFile(new URL(`../../shared/census/${code}.json`,import.meta.url),'utf8').then(JSON.parse));
 return cache.get(code);
}
// Display-only simplification. Source areas and original statistics remain unchanged.
function simplifyRing(points,tolerance=0.000025) {
 if(points.length<=6)return points.map(p=>p.slice(0,2).map(n=>Number(n.toFixed(5))));
 const first=points[0],open=points.slice(0,-1),keep=new Set([0,open.length-1]),stack=[[0,open.length-1]],sq=tolerance*tolerance;
 while(stack.length){const[a,b]=stack.pop();let best=sq,index=-1;const A=open[a],B=open[b],dx=B[0]-A[0],dy=B[1]-A[1],length=dx*dx+dy*dy;
  for(let i=a+1;i<b;i++){const p=open[i],t=length?Math.max(0,Math.min(1,((p[0]-A[0])*dx+(p[1]-A[1])*dy)/length)):0,d=(p[0]-A[0]-t*dx)**2+(p[1]-A[1]-t*dy)**2;if(d>best){best=d;index=i}}
  if(index>=0){keep.add(index);stack.push([a,index],[index,b])}
 }
 const out=[...keep].sort((a,b)=>a-b).map(i=>open[i].slice(0,2).map(n=>Number(n.toFixed(5))));
 if(out.length<3)return points.map(p=>p.slice(0,2).map(n=>Number(n.toFixed(5))));
 out.push(first.slice(0,2).map(n=>Number(n.toFixed(5))));return out;
}
export function censusUrl(config,startIndex=0) {
 const {bbox}=studyBounds(config);
 return 'https://geoservicos.ibge.gov.br/geoserver/ows?'+new URLSearchParams({service:'WFS',version:'2.0.0',request:'GetFeature',typeNames:'CGMAT:qg_2022_600_setcensitario__v02',outputFormat:'application/json',srsName:'EPSG:4326',count:'1200',startIndex:String(startIndex),sortBy:'cd_setor',cql_filter:`BBOX(geom,${bbox.join(',')},'EPSG:4326')`,format_options:'precision:5'});
}
export async function normalizeCensus(raw,config) {
 if(raw.type!=='FeatureCollection'||!Array.isArray(raw.features))throw new AppError('O IBGE não retornou uma malha válida.',502);
 const features=[],seen=new Set();let truncated=Boolean(raw.truncated)||Number(raw.numberMatched)>raw.features.length,unmatched=0;
 for(const f of raw.features){
  const p=f.properties||{},id=String(p.cd_setor||'');if(!/^\d{15}$/.test(id)||!['Polygon','MultiPolygon'].includes(f.geometry?.type))continue;
  if(seen.has(id))continue;seen.add(id);
  const stats=await statsFor(id.slice(0,2)),values=stats[id.slice(0,7)]?.[id.slice(7)],area=Number(p.area_km2);
  if(!values)unmatched++;
  const geometry={type:f.geometry.type,coordinates:f.geometry.type==='Polygon'?f.geometry.coordinates.map(r=>simplifyRing(r)):f.geometry.coordinates.map(poly=>poly.map(r=>simplifyRing(r)))};
  features.push({type:'Feature',id,geometry,properties:{sector:id,city:String(p.nm_mun||''),situation:String(p.situacao||''),area_km2:Number.isFinite(area)&&area>0?area:null,population:values?.[0]??null,households:values?.[1]??null,occupied:values?.[2]??null,vacant:values?.[3]??null,occasional:values?.[4]??null,income:values?.[5]??null,responsible:values?.[6]??null}});
 }
 // The geographic history budget is 6 MB, including PostgreSQL JSON formatting.
 let bytes=features.reduce((sum,f)=>sum+Buffer.byteLength(JSON.stringify(f)),0);while(bytes>3800000&&features.length){bytes-=Buffer.byteLength(JSON.stringify(features.pop()));truncated=true;}
 return {type:'FeatureCollection',features,scope:studyBounds(config),reference:'2022',stats_release:manifest.release,stats_url:manifest.source_url,stats_sha256:manifest.sha256,income_url:manifest.income_url,income_release:manifest.income_release,income_sha256:manifest.income_sha256,truncated,unmatched,pages:raw.pages||1,geometry_simplified:true,
  methodology:'Estatísticas originais do Censo 2022 associadas à malha definitiva por CD_SETOR. Recorte por envoltória de ±7 km. Totais são do setor inteiro; não são população no raio. Geometrias simplificadas apenas para exibição. Domicílios incluem vagos e de uso ocasional.'};
}
export function osmQuery(config) {
 const {bbox:[w,s,e,n]}=studyBounds(config),box=`(${s},${w},${n},${e})`;
 return `[out:json][timeout:25][maxsize:67108864];(nwr["shop"]${box};nwr["amenity"~"^(school|college|university|kindergarten|hospital|clinic|doctors|pharmacy|bus_station|fuel|restaurant|cafe|bank|marketplace)$"]${box};nwr["public_transport"~"^(station|platform)$"]${box};nwr["railway"="station"]${box};);out center 1601;`;
}
export function normalizeOsm(raw,config) {
 if(!Array.isArray(raw.elements)||raw.remark)throw new AppError('O OpenStreetMap não concluiu o recorte. A leitura anterior foi preservada.',502);
 const seen=new Set(),features=[];
 for(const x of raw.elements.slice(0,1600)){
  const t=x.tags||{},lat=x.lat??x.center?.lat,lon=x.lon??x.center?.lon,id=x.type+'/'+x.id;
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||seen.has(id))continue;seen.add(id);
  const category=/^(school|college|university|kindergarten)$/.test(t.amenity)?'education':/^(hospital|clinic|doctors|pharmacy)$/.test(t.amenity)?'health':t.public_transport||t.railway||t.amenity==='bus_station'?'mobility':'retail';
  features.push({type:'Feature',id,geometry:{type:'Point',coordinates:[lon,lat]},properties:{name:String(t.name||t.brand||t.shop||t.amenity||t.public_transport||'Ponto mapeado').slice(0,200),category,osm_id:id,source_url:'https://www.openstreetmap.org/'+id}});
 }
 return {type:'FeatureCollection',features,scope:studyBounds(config),reference:new Date().toISOString().slice(0,10),truncated:raw.elements.length>1600,
  methodology:'Elementos colaborativos do OpenStreetMap: comércio, alimentação, educação, saúde e transporte. Cobertura incompleta e variável; elementos não equivalem a empresas únicas, pedestres ou veículos. Nós e áreas podem representar o mesmo local. © OpenStreetMap contributors, ODbL.'};
}
export async function fetchGeoSource(job) {
 const config=job.config||{},census=job.source_key==='ibge_sectors',url=census?censusUrl(config):'https://maps.mail.ru/osm/tools/overpass/api/interpreter?'+new URLSearchParams({data:osmQuery(config)});
 let raw;
 if(census){
  const all=[],seen=new Set(),started=Date.now();let matched=0,pages=0,complete=false;
  while(pages<6&&Date.now()-started<55000){
   const page=await readJson(censusUrl(config,all.length),{},20000);if(page.type!=='FeatureCollection'||!Array.isArray(page.features))throw new AppError('Página censitária inválida.',502);
   for(const f of page.features){const id=f.properties?.cd_setor;if(!id||seen.has(id))throw new AppError('O IBGE retornou páginas repetidas ou sem código do setor.',502);seen.add(id);all.push(f);}pages++;matched=Number(page.numberMatched)||0;
   if(page.features.length<1200||(matched>0&&all.length>=matched)){complete=true;break;}
  }
  raw={type:'FeatureCollection',features:all,numberMatched:matched,pages,truncated:!complete};
 }else raw=await readJson(url);
 const spatial=census?await normalizeCensus(raw,config):normalizeOsm(raw,config);
 return {provider:census?'IBGE · Censo 2022 por setor':'OpenStreetMap · Overpass (VK Maps)',source_url:url,fetched_at:new Date().toISOString(),method:spatial.methodology,real_public_data:true,spatial,
  rows:[{indicator:census?'Setores censitários retornados':'Elementos de interesse mapeados',unit:census?'setores':'elementos OSM',period:spatial.reference,value:spatial.features.length,raw:String(spatial.features.length),geography:'Envoltória de ±7 km do ponto do ativo',classification:spatial.truncated?'Recorte parcial: limite de consulta atingido':census?'Total de setores intersectados; não é população no raio':'Amostra colaborativa; não é censo comercial'}]};
}
