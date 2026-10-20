import {guardWorker,client,respondError} from './_lib/core.js';import {executeSource} from './_lib/public-sources.js';
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Método não permitido'});try{
 guardWorker(req);const db=client(),token=process.env.CRON_SECRET,results=[],started=Date.now();
 // Two batches of 24, with at most six provider requests in flight. The second
 // batch starts only with enough time left inside the 180-second function budget.
 for(let batch=0;batch<2;batch++){
  if(batch&&Date.now()-started>80000)break;
  const{data:jobs,error}=await db.rpc('aurora_source_jobs',{token});if(error)throw error;
  for(let i=0;i<jobs.length;i+=6)results.push(...await Promise.all(jobs.slice(i,i+6).map(j=>executeSource(db,j,token))));
  if(jobs.length<24)break;
 }
 return res.status(200).json({ok:true,completed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length});
 }catch(e){return respondError(res,e)}}
