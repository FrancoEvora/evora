/* Arisa Intelligence: no application login, server-to-server credentials only. */
import { getVercelOidcToken } from '@vercel/oidc';
import { createHash } from 'node:crypto';

export const config = { runtime: 'nodejs', maxDuration: 120 };
const RELEASE='20261027-direct-1';
const MAX_BYTES=180000;
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Evora-Release':RELEASE}});

async function readLimited(request){
 const reader=request.body?.getReader();
 if(!reader)throw Object.assign(new Error('Corpo vazio.'),{status:400});
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw Object.assign(new Error('O contexto excede o tamanho permitido.'),{status:413});}chunks.push(value);}
 return Buffer.concat(chunks).toString('utf8');
}

export default {
 async fetch(request){
  if(!['GET','POST'].includes(request.method))return respond({error:'Método não permitido.'},405);
  const url=new URL(request.url);
  if(request.method==='POST'){
   const origin=request.headers.get('origin');
   if(origin!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return respond({error:'Origem da solicitação não autorizada.'},403);
   if(!request.headers.get('content-type')?.startsWith('application/json'))return respond({error:'Envie a solicitação em JSON.'},415);
   if(Number(request.headers.get('content-length')||0)>MAX_BYTES)return respond({error:'O contexto excede o tamanho permitido.'},413);
  }
  try{
   let body;
   if(request.method==='POST'){
    try{body=JSON.parse(await readLimited(request));}catch(error){return respond({error:error.status===413?error.message:'Solicitação inválida.'},error.status||400);}
    if(!body||Array.isArray(body)||typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>5000||typeof body.projectId!=='string'||!body.projectId||body.projectId.length>160||!body.snapshot||Array.isArray(body.snapshot)||typeof body.snapshot!=='object'||body.snapshot.project?.id!==body.projectId)return respond({error:'Selecione o empreendimento e informe uma pergunta válida.'},400);
   }
   let token;
   try{token=await getVercelOidcToken();}catch{return respond({error:'A conexão segura do servidor está indisponível.',code:'RUNTIME_IDENTITY'},503);}
   if(!token)return respond({error:'A conexão segura do servidor está indisponível.',code:'RUNTIME_IDENTITY'},503);
   const supabaseUrl=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
   if(!supabaseUrl)return respond({error:'A integração do servidor não está configurada.'},503);
   // Tokens and API keys never go to browser responses, logs or source code.
   const ip=request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'unknown';
   const clientHash=createHash('sha256').update(ip.split(',')[0].trim()+'|'+new Date().toISOString().slice(0,10)+'|evora-viabilidade').digest('hex');
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),100000);
   let response,payload;
   try{
    response=await fetch(supabaseUrl+'/functions/v1/viability-intelligence',{method:request.method,headers:{'Content-Type':'application/json','x-evora-runtime-token':token,'x-evora-client-hash':clientHash},body:body?JSON.stringify({projectId:body.projectId,prompt:body.prompt,history:body.history,snapshot:body.snapshot}):undefined,signal:controller.signal});
    payload=await response.json();
   }finally{clearTimeout(timer);}
   if(!response.ok){
    console.error('viability-intelligence',{status:response.status,code:payload?.code||'UPSTREAM_ERROR'});
    return respond({error:payload?.code==='RUNTIME_UNAUTHORIZED'?'A conexão segura entre os servidores não pôde ser validada.':String(payload?.error||'A OpenAI não concluiu a análise.'),code:payload?.code||'UPSTREAM_ERROR'},response.status===401?503:response.status);
   }
   return respond(payload);
  }catch(error){
   console.error('viability-intelligence',{code:error?.name||'UNAVAILABLE'});
   return respond({error:error?.name==='AbortError'?'A análise excedeu o tempo disponível. Tente uma pergunta mais específica.':'Não foi possível concluir a comunicação com a Inteligência.',code:'INTELLIGENCE_UNAVAILABLE'},error?.name==='AbortError'?504:503);
  }
 }
};
