import {authenticate,client,uuid,respondError,AppError} from './_lib/core.js';
import {executeSource,getPublicJson} from './_lib/public-sources.js';
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');try{const{db}=await authenticate(req);
 if(req.method==='GET'){const uf=String(req.query.uf||'');if(!/^[A-Z]{2}$/.test(uf))throw new AppError('Selecione uma UF.');const data=await getPublicJson(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);return res.status(200).json({municipalities:data.map(x=>({id:x.id,name:x.nome}))})}
 if(req.method!=='POST')throw new AppError('Método não permitido',405);const body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!uuid.test(body?.sourceId))throw new AppError('Selecione uma conexão.');const{data:job,error}=await db.rpc('aurora_claim_source',{i:body.sourceId});if(error)throw new AppError(error.message,403);const result=await executeSource(client(),job,process.env.CRON_SECRET);return res.status(result.ok?200:502).json(result);
 }catch(e){return respondError(res,e)}}
