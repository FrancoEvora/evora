import {authenticate,client,uuid,respondError,AppError} from './_lib/core.js';
import {executeSource,getPublicJson} from './_lib/public-sources.js';
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');try{const{db}=await authenticate(req);
 if(req.method==='GET'){const uf=String(req.query.uf||'');if(!/^[A-Z]{2}$/.test(uf))throw new AppError('Selecione uma UF.');const data=await getPublicJson(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);return res.status(200).json({municipalities:data.map(x=>({id:x.id,name:x.nome}))})}
 if(req.method!=='POST')throw new AppError('Método não permitido',405);const body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(uuid.test(body?.assetId)){
 const{data:sources,error}=await db.from('aurora_sources').select('id').eq('asset_id',body.assetId).eq('enabled',true).in('source_key',['ibge_census','ibge_population','ibge_gdp','ibge_sinapi','bcb_selic','bcb_ipca','anm_mining']);
 if(error)throw new AppError('Não foi possível consultar as conexões autorizadas.',403);if(!sources?.length)throw new AppError('Ativo sem conexões acessíveis.',404);
 const results=[];for(let i=0;i<sources.length;i+=4)results.push(...await Promise.all(sources.slice(i,i+4).map(async source=>{const{data:job,error:claimError}=await db.rpc('aurora_claim_source',{i:source.id});if(claimError)return{ok:false,id:source.id,error:claimError.message};return executeSource(client(),job,process.env.CRON_SECRET)})));
 return res.status(200).json({completed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results});
 }
 if(!uuid.test(body?.sourceId))throw new AppError('Selecione uma conexão.');const{data:job,error}=await db.rpc('aurora_claim_source',{i:body.sourceId});if(error)throw new AppError(error.message,403);const result=await executeSource(client(),job,process.env.CRON_SECRET);return res.status(result.ok?200:502).json(result);
 }catch(e){return respondError(res,e)}}
