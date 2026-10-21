import {latLngToCell,cellToBoundary,polygonToCells,gridDisk} from 'h3-js';
import clipping from 'polygon-clipping';

export const heatColors=['#215b8f','#269ac0','#5bc4ad','#efcb6b','#ef785c'];
export const heatRadii=[1,2,3,5,7];
const rad=Math.PI/180,R=6371.0088;
export function circleGeometry(latitude,longitude,radius=3){
 const lat=latitude*rad,lon=longitude*rad,d=radius/R,ring=[];
 for(let i=0;i<=72;i++){const b=i*2*Math.PI/72,p=Math.asin(Math.sin(lat)*Math.cos(d)+Math.cos(lat)*Math.sin(d)*Math.cos(b)),l=lon+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat),Math.cos(d)-Math.sin(lat)*Math.sin(p));ring.push([l/rad,p/rad])}
 ring[ring.length-1]=ring[0];return {type:'Polygon',coordinates:[ring]};
}
export function geometryArea(g){
 function area(ring){let sum=0;for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];sum+=(b[0]-a[0])*rad*(2+Math.sin(a[1]*rad)+Math.sin(b[1]*rad))}return Math.abs(sum*R*R/2)}
 const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;
 return polygons.reduce((sum,p)=>sum+Math.max(0,area(p[0])-p.slice(1).reduce((x,r)=>x+area(r),0)),0);
}
export function boundsOf(g){const b=[Infinity,Infinity,-Infinity,-Infinity];function walk(a){if(typeof a[0]==='number'){b[0]=Math.min(b[0],a[0]);b[1]=Math.min(b[1],a[1]);b[2]=Math.max(b[2],a[0]);b[3]=Math.max(b[3],a[1]);}else a.forEach(walk)}walk(g.coordinates);return b}
function overlaps(a,b){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1]}
export function clipGeometry(a,b){const coords=clipping.intersection(a.coordinates,b.coordinates);return coords.length?{type:'MultiPolygon',coordinates:coords}:null}
export function distanceKm(a,b){const dlat=(a[1]-b[1])*rad,dlon=(a[0]-b[0])*rad,h=Math.sin(dlat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlon/2)**2;return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)))}
function grid(circle,resolution){
 const cells=new Set(polygonToCells(circle.coordinates,resolution,true));
 if(!cells.size){const b=boundsOf(circle);cells.add(latLngToCell((b[1]+b[3])/2,(b[0]+b[2])/2,resolution))}
 for(const id of [...cells])for(const n of gridDisk(id,1))cells.add(n);
 if(cells.size>2600)throw new Error('Este recorte excede 2.600 hexágonos. Reduza o raio ou use a resolução regional.');
 const result=[];
 for(const id of [...cells].sort()){const ring=cellToBoundary(id,true);ring.push(ring[0]);const geometry=clipGeometry({type:'Polygon',coordinates:[ring]},circle);if(geometry&&geometryArea(geometry)>1e-9)result.push({id,geometry,bounds:boundsOf(geometry),area:geometryArea(geometry)})}
 return result;
}
export function buildHeatmap(spatial,{metric='population',mode='sectors',resolution=9,latitude,longitude,radius=3,category='all'}={}){
 if(!spatial||!Array.isArray(spatial.features)||!heatRadii.includes(radius)||![8,9].includes(resolution)||!Number.isFinite(latitude)||!Number.isFinite(longitude))throw new Error('Selecione um ativo localizado e um recorte válido.');
 if(spatial.scope?.radius_km<radius)throw new Error(`Esta leitura cobre até ${spatial.scope.radius_km} km. Atualize a fonte para consultar o raio de ${radius} km.`);
 if(metric==='income'&&mode!=='sectors')throw new Error('Rendimento disponível nos setores originais. Médias setoriais não são redistribuídas para hexágonos.');
 const circle=circleGeometry(latitude,longitude,radius),circleBounds=boundsOf(circle),isPoints=metric==='points',features=[];let issues=0,covered=0;
 if(isPoints){
  const points=spatial.features.filter(f=>f.geometry?.type==='Point'&&(category==='all'||f.properties.category===category)&&distanceKm(f.geometry.coordinates,[longitude,latitude])<=radius);
  const groups=new Map();for(const p of points){const[x,y]=p.geometry.coordinates,id=latLngToCell(y,x,resolution);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(p)}
  for(const c of grid(circle,resolution)){const pts=groups.get(c.id)||[];features.push({type:'Feature',id:c.id,geometry:c.geometry,properties:{value:pts.length,unit:'elementos mapeados',count:pts.length,coverage:null,modeled:false,names:pts.slice(0,6).map(p=>p.properties.name),category,source_count:pts.length}})}
  return {type:'FeatureCollection',features,summary:{coverage:null,issues,source_features:points.length,cells:features.length},methodology:'Contagem de elementos geolocalizados por hexágono H3. Zero significa nenhum elemento retornado nesta base; não comprova ausência de atividade. Não mede fluxo de pessoas ou veículos.'};
 }
 const polygons=[];
 for(const f of spatial.features){
  if(!['Polygon','MultiPolygon'].includes(f.geometry?.type)||!overlaps(boundsOf(f.geometry),circleBounds))continue;
  try{
   const geometry=clipGeometry(f.geometry,circle);if(!geometry)continue;
   const p=f.properties||{},raw=p[metric],value=typeof raw==='number'&&Number.isFinite(raw)&&raw>=0&&p.area_km2>0?(metric==='income'?raw:raw/p.area_km2):null,area=geometryArea(geometry);
   if(value!==null)covered+=area;
   polygons.push({geometry,bounds:boundsOf(geometry),value,properties:p});
   if(mode==='sectors')features.push({type:'Feature',id:f.id,geometry,properties:{...p,value,unit:metric==='income'?'R$ de 2022/mês · responsável com rendimento':metric==='population'?'pessoas/km²':metric==='occupied'?'domicílios ocupados/km²':'domicílios/km²',modeled:false,coverage:value===null?0:1,source_count:1}});
  }catch{issues++}
 }
 if(mode==='hexagons')for(const c of grid(circle,resolution)){
  let count=0,validArea=0,n=0;
  for(const s of polygons){if(s.value===null||!overlaps(s.bounds,c.bounds))continue;try{const geometry=clipGeometry(s.geometry,c.geometry);if(!geometry)continue;const area=geometryArea(geometry);validArea+=area;count+=s.value*area;n++;}catch{issues++}}
  const coverage=Math.min(1,validArea/c.area),complete=coverage>=.95;
  features.push({type:'Feature',id:c.id,geometry:c.geometry,properties:{value:complete?count/c.area:null,count:complete?count:null,coverage,modeled:true,source_count:n,unit:metric==='population'?'pessoas/km²':metric==='occupied'?'domicílios ocupados/km²':'domicílios/km²'}});
 }
 return {type:'FeatureCollection',features,summary:{coverage:Math.min(1,covered/geometryArea(circle)),issues,source_features:polygons.length,cells:features.length},methodology:metric==='income'?'V06004: rendimento nominal médio mensal das pessoas responsáveis com rendimentos por domicílios particulares permanentes ocupados. Valor original do setor, em reais de 2022. Não é renda familiar, renda atual, renda de cada imóvel ou capacidade de compra.':mode==='sectors'?'Densidade calculada como total original dividido pela área oficial do setor. O desenho é recortado à área de estudo; os totais consultáveis continuam sendo do setor inteiro.':'Estimativa por repartição proporcional à área: densidade original de cada setor × área de interseção com o hexágono. Pressupõe distribuição uniforme dentro do setor; não é medição por quarteirão. Células com menos de 95% de cobertura válida ficam sem valor.'};
}
export function legendBreaks(features,metric,scale='fixed'){
 if(scale==='fixed')return metric==='income'?[1000,2000,3500,6000]:metric==='population'?[100,1000,3000,7000]:['households','occupied'].includes(metric)?[50,400,1200,2800]:[1,3,8,20];
 const values=features.map(f=>f.properties.value).filter(v=>v!=null&&Number.isFinite(v)).sort((a,b)=>a-b);
 return [1,2,3,4].map(i=>values.length?values[Math.min(values.length-1,Math.floor(values.length*i/5))]:0);
}
export function heatColor(value,breaks){if(value==null||!Number.isFinite(value))return '#73848d';return heatColors[breaks.filter(n=>value>=n).length]}
