const WFS_BASES=[
  'https://geoserver.meioambiente.mg.gov.br/geoserver/IDE/ows',
  'https://geoserver.meioambiente.mg.gov.br/IDE/ows',
  'https://geoserver.meioambiente.mg.gov.br/geoserver/ows',
  'https://geoserver.meioambiente.mg.gov.br/ows'
];
const BBOX='-48.85,-19.35,-47.85,-18.45,EPSG:4326';
const KNOWN=['IDE:ide_210602_mg_imoveis_recomp_uso_restrito_declarado_car_pol'];
async function getFeature(base,typeName){
  const q=new URLSearchParams({service:'WFS',version:'1.0.0',request:'GetFeature',typeName,outputFormat:'application/json',srsName:'EPSG:4326',bbox:BBOX,maxFeatures:'5000'});
  const r=await fetch(`${base}?${q}`,{headers:{'user-agent':'MALHA/8.1'}});
  if(!r.ok) throw new Error(`${r.status}`);
  const txt=await r.text();
  const j=JSON.parse(txt);
  if(j && j.type==='FeatureCollection') return j;
  throw new Error('resposta não-GeoJSON');
}
async function discover(base){
  const q=new URLSearchParams({service:'WFS',request:'GetCapabilities',version:'1.1.0'});
  const r=await fetch(`${base}?${q}`,{headers:{'user-agent':'MALHA/8.1'}});
  if(!r.ok) return [];
  const x=await r.text();
  const names=[...x.matchAll(/<Name>([^<]+)<\/Name>/g)].map(m=>m[1]);
  return names.filter(n=>/(car|sicar|imove.*rural|area_imovel)/i.test(n)).slice(0,30);
}
export default async function handler(req,res){
  const errors=[];
  for(const base of WFS_BASES){
    for(const name of KNOWN){
      try{
        const j=await getFeature(base,name);
        if(j.features?.length){j.source='IEF/IDE-Sisema · dados declarados no CAR';j.layer=name;j.coverage='camada CAR pública estadual; não representa necessariamente a totalidade dos CAR do município';res.setHeader('Cache-Control','s-maxage=86400, stale-while-revalidate=604800');return res.status(200).json(j)}
      }catch(e){errors.push(`${base} ${name}: ${e.message}`)}
    }
    try{
      const names=await discover(base);
      for(const name of names){
        try{const j=await getFeature(base,name);if(j.features?.length){j.source='IEF/IDE-Sisema · camada pública relacionada ao CAR';j.layer=name;j.coverage='camada pública descoberta dinamicamente';res.setHeader('Cache-Control','s-maxage=86400, stale-while-revalidate=604800');return res.status(200).json(j)}}catch(e){errors.push(`${name}: ${e.message}`)}
      }
    }catch(e){errors.push(`discover ${base}: ${e.message}`)}
  }
  res.status(502).json({type:'FeatureCollection',features:[],error:'CAR público não respondeu',detail:errors.slice(-8)});
}
