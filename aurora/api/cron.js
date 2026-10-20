import {guardWorker,client,generate,respondError} from './_lib/core.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Método não permitido'});
 try{guardWorker(req);const db=client(),token=process.env.CRON_SECRET;
  const{data:jobs,error}=await db.rpc('aurora_monitor_and_claim',{token});if(error)throw error;
  let completed=0,failed=0;
  for(const job of jobs||[]){let output={result:'',model:process.env.AI_GATEWAY_MODEL||''},errorCode=null;try{output=await generate({asset:job.asset,actions:job.actions,documents:job.documents,notes:job.notes,workItems:job.workItems,licenses:job.licenses,is_demo:job.is_demo,publicSources:job.publicSources},job.prompt)}catch(e){errorCode='provider_unavailable';failed++}
   const{error:saveError}=await db.rpc('aurora_finish_job',{token,j:job.id,lease:job.lease,result_text:output.result,model_name:output.model,error_code:errorCode});if(saveError)failed++;else if(!errorCode)completed++;
  }
  return res.status(200).json({ok:true,completed,failed});
 }catch(error){return respondError(res,error)}
}
