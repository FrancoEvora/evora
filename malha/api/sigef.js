const SRC='https://geo.infrasa.gov.br/server/rest/services/Hosted/Sigef_Brasil/FeatureServer/0/query';
export default async function handler(req,res){
  try{
    const qs=new URLSearchParams({where:'municipio_=3170206',outFields:'parcela_co,codigo_imo,status,situacao_i,nome_area,registro_m,data_aprov,municipio_,uf_id',returnGeometry:'true',outSR:'4326',f:'geojson',resultRecordCount:'2000'});
    const r=await fetch(`${SRC}?${qs}`,{headers:{'user-agent':'MALHA/8.1'}});
    if(!r.ok) throw new Error(`SIGEF ${r.status}`);
    const j=await r.json();
    j.source='Infra S.A. / INCRA SIGEF 2026-02';
    j.coverage='parcelas certificadas com municipio_=3170206';
    res.setHeader('Cache-Control','s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(j);
  }catch(e){res.status(502).json({type:'FeatureCollection',features:[],error:'SIGEF indisponível',detail:String(e.message||e)});}
}
