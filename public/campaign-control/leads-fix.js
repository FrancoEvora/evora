// Exact desktop lead retrieval bridge: resolve Page Access Token, then Page forms -> form leads.
const LEADS_API=`${SUPABASE_URL}/functions/v1/campaign-control-leads`;
const localApiBase=localApi;
localApi=async function(path,opts={}){
  if(!String(path).startsWith('/api/leads')) return localApiBase(path,opts);
  const src=new URL(path,location.origin);
  let action='list';
  if(src.pathname==='/api/leads/diagnostics') action='diagnostics';
  else if(src.pathname==='/api/leads/sync') action='sync';
  else if(src.pathname==='/api/leads/update') action='update';
  const q=new URLSearchParams({action}); for(const[k,v]of src.searchParams)q.append(k,v);
  const r=await fetch(`${LEADS_API}?${q}`,{method:opts.method||'GET',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:opts.body?JSON.stringify(opts.body):undefined});
  let j={};try{j=await r.json()}catch{}
  if(!r.ok)throw new Error(j.error||j.detail||`Falha ao ler leads (${r.status})`);
  return j;
};
