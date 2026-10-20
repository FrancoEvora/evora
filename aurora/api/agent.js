import {authenticate,client,parseInput,collectContext,generate,respondError,AppError} from './_lib/core.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido'});}
 try{
  if(Number(req.headers['content-length']||0)>20000)throw new AppError('Solicitação muito grande.',413);
  const {db,user}=await authenticate(req);const {workspaceId,assetId,prompt}=parseInput(req.body);
  const{data:member,error:memberError}=await db.from('aurora_members').select('role,active').eq('workspace_id',workspaceId).eq('user_id',user.id).single();
  if(memberError||!member?.active||!['owner','admin','manager','analyst'].includes(member.role))throw new AppError('Seu perfil não permite solicitar análises por IA.',403);
  const context=await collectContext(db,workspaceId,assetId);
  const{error:rateError}=await db.rpc('aurora_reserve_ai',{w:workspaceId});if(rateError)throw new AppError('Limite de análises atingido. Tente novamente amanhã.',429);
  const {result,model}=await generate(context,prompt);
  const{data:id,error}=await client().rpc('aurora_save_run',{token:process.env.CRON_SECRET,w:workspaceId,a:assetId,u:user.id,p:prompt,result_text:result,model_name:model});
  if(error)throw new AppError('A análise foi produzida, mas não pôde ser salva. Tente novamente.',503);
  return res.status(200).json({id,result,model});
 }catch(error){return respondError(res,error)}
}
