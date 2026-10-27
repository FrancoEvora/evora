/* Évora Viabilidade · Supabase cloud sync v2.0 (non-blocking) */
(function(){
'use strict';
if(window.__evoraSupabaseSafeV2)return;
window.__evoraSupabaseSafeV2=true;

const STORE='evora.viabilidade.v1';
const SESSION_KEY='evora.supabase.session.v1';
const MIGRATION_KEY='evora.supabase.localMigration.v1';
const CONFIG_ENDPOINT='/supabase-config.json';
const PROJECTS_TABLE='viability_projects';
const SETTINGS_TABLE='viability_user_settings';
const SYNC_DELAY=900;

const safeJSON=(value,fallback=null)=>{try{return JSON.parse(value);}catch{return fallback;}};
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const nowISO=()=>new Date().toISOString();
const stamp=value=>{const time=Date.parse(value||'');return Number.isFinite(time)?time:0;};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

let config=null;
let session=readSession();
let currentUser=session?.user||null;
let cloudState='starting';
let cloudMessage='Preparando sincronização…';
let authMode='login';
let syncTimer=null;
let syncPromise=null;
let lastLibrary=readLibrary();
let pendingRemoved=new Set();
let internalWrite=false;
let renderScheduled=false;

const nativeSetItem=Storage.prototype.setItem;
const nativeRemoveItem=Storage.prototype.removeItem;
try{
  Storage.prototype.setItem=function(key,value){
    const watch=this===localStorage&&key===STORE;
    const previous=watch?this.getItem(key):null;
    nativeSetItem.call(this,key,value);
    if(watch&&!internalWrite){
      window.dispatchEvent(new CustomEvent('evora:library-changed',{detail:{previous,value}}));
    }
  };
}catch{}

function readLibrary(){
  const value=safeJSON(localStorage.getItem(STORE),null);
  return value&&Array.isArray(value.projects)?value:null;
}
function readSession(){
  const value=safeJSON(localStorage.getItem(SESSION_KEY),null);
  return value&&value.access_token&&value.refresh_token?value:null;
}
function writeNative(key,value){
  internalWrite=true;
  try{nativeSetItem.call(localStorage,key,value);}finally{internalWrite=false;}
}
function saveSession(payload){
  if(!payload?.access_token||!payload?.refresh_token)return null;
  session={
    access_token:payload.access_token,
    refresh_token:payload.refresh_token,
    token_type:payload.token_type||'bearer',
    expires_at:Number(payload.expires_at)||Math.floor(Date.now()/1000)+(Number(payload.expires_in)||3600),
    user:payload.user||currentUser||null
  };
  currentUser=session.user||null;
  writeNative(SESSION_KEY,JSON.stringify(session));
  return session;
}
function clearSession(){
  try{nativeRemoveItem.call(localStorage,SESSION_KEY);}catch{localStorage.removeItem(SESSION_KEY);}
  session=null;currentUser=null;
}
function setState(state,message){
  cloudState=state;cloudMessage=message||'';
  scheduleControls();
  const dialog=document.getElementById('supabase-sync-dialog');
  if(dialog?.open)renderDialog();
  window.dispatchEvent(new CustomEvent('evora:supabase-status',{detail:{state,message:cloudMessage,user:currentUser}}));
}

async function parseResponse(response){
  const text=await response.text();
  const data=text?safeJSON(text,text):null;
  if(!response.ok){
    const message=(data&&typeof data==='object'&&(data.msg||data.message||data.error_description||data.error))||response.statusText||'Falha na comunicação com o Supabase.';
    const error=new Error(String(message));error.status=response.status;error.data=data;throw error;
  }
  return data;
}
async function loadConfig(){
  try{
    const response=await fetch(CONFIG_ENDPOINT,{headers:{Accept:'application/json'},cache:'no-store'});
    const data=await parseResponse(response);
    config=data||{};
    if(!config.configured||!config.url||!config.publishableKey){
      setState('unavailable',config.message||'Supabase ainda não configurado.');
      return false;
    }
    config.url=String(config.url).replace(/\/$/,'');
    return true;
  }catch(error){
    config={configured:false,message:error.message};
    setState('unavailable','Configuração do Supabase indisponível.');
    return false;
  }
}
function publicHeaders(extra={}){
  return {'apikey':config.publishableKey,'Content-Type':'application/json',...extra};
}
async function authRequest(path,{method='POST',body,token}={}){
  const headers=publicHeaders(token?{Authorization:'Bearer '+token}:{});
  const response=await fetch(config.url+'/auth/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return parseResponse(response);
}
async function restRequest(path,{method='GET',body,prefer}={}){
  const active=await ensureSession();
  if(!active)throw new Error('Sessão não autenticada.');
  const headers=publicHeaders({Authorization:'Bearer '+active.access_token});
  if(prefer)headers.Prefer=prefer;
  const response=await fetch(config.url+'/rest/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return parseResponse(response);
}
async function refreshSession(){
  if(!session?.refresh_token)return null;
  try{
    const data=await authRequest('token?grant_type=refresh_token',{body:{refresh_token:session.refresh_token}});
    return saveSession(data);
  }catch{
    clearSession();
    return null;
  }
}
async function ensureSession(){
  if(!session)return null;
  if(Number(session.expires_at||0)<=Math.floor(Date.now()/1000)+75){
    if(!await refreshSession())return null;
  }
  if(!currentUser){
    try{
      const user=await authRequest('user',{method:'GET',token:session.access_token});
      currentUser=user;session.user=user;writeNative(SESSION_KEY,JSON.stringify(session));
    }catch{
      clearSession();
      return null;
    }
  }
  return session;
}
async function signIn(email,password){
  const data=await authRequest('token?grant_type=password',{body:{email,password}});
  saveSession(data);
  return data;
}
async function signUp(email,password){
  const redirect=encodeURIComponent(location.origin+location.pathname);
  const data=await authRequest('signup?redirect_to='+redirect,{body:{email,password,data:{product:'evora-viabilidade'}}});
  if(data?.access_token)saveSession(data);
  return data;
}
async function signOut(){
  try{if(session)await authRequest('logout',{token:session.access_token,body:{scope:'local'}});}catch{}
  clearSession();
  setState('signed_out','Entre para migrar a base local e sincronizar os empreendimentos.');
}

function isUntouchedDemo(project){
  return project?.id==='demo'&&project.params?.name==='Residencial Horizonte'&&String(project.params?.city||'').includes('demonstrativo');
}
function remoteProject(row){
  return {id:String(row.client_id),params:row.params||{},actuals:row.actuals||{sales:{},work:{},plan:null},updated:row.updated_at||nowISO()};
}
function localProjectRow(project,userId){
  const params=project.params||{};
  return {
    user_id:userId,
    client_id:String(project.id),
    name:String(params.name||'Empreendimento').slice(0,90),
    city:String(params.city||'').slice(0,120),
    params,
    actuals:project.actuals&&typeof project.actuals==='object'?project.actuals:{sales:{},work:{},plan:null},
    version:1,
    updated_at:project.updated||nowISO()
  };
}
async function fetchRemoteProjects(){
  const rows=await restRequest(PROJECTS_TABLE+'?select=client_id,name,city,params,actuals,version,updated_at&order=updated_at.desc');
  return Array.isArray(rows)?rows:[];
}
async function fetchRemoteSettings(){
  const rows=await restRequest(SETTINGS_TABLE+'?select=active_project_client_id,schema_version,updated_at&limit=1');
  return Array.isArray(rows)&&rows.length?rows[0]:null;
}
async function upsertProjects(library){
  if(!currentUser||!library?.projects?.length)return;
  const rows=library.projects.map(project=>localProjectRow(project,currentUser.id));
  await restRequest(PROJECTS_TABLE+'?on_conflict=user_id%2Cclient_id',{method:'POST',body:rows,prefer:'resolution=merge-duplicates,return=minimal'});
}
async function upsertSettings(library){
  if(!currentUser||!library)return;
  await restRequest(SETTINGS_TABLE+'?on_conflict=user_id',{method:'POST',body:{user_id:currentUser.id,active_project_client_id:library.active||null,schema_version:1,updated_at:nowISO()},prefer:'resolution=merge-duplicates,return=minimal'});
}
async function deleteRemoteProjects(ids){
  for(const id of ids){
    await restRequest(PROJECTS_TABLE+'?client_id=eq.'+encodeURIComponent(id),{method:'DELETE',prefer:'return=minimal'});
  }
}
function mergeLibraries(local,remoteRows,settings){
  const localProjects=Array.isArray(local?.projects)?local.projects.slice():[];
  const remoteProjects=remoteRows.map(remoteProject);
  const localUsable=remoteProjects.length&&localProjects.length===1&&isUntouchedDemo(localProjects[0])?[]:localProjects;
  const merged=new Map(remoteProjects.map(project=>[project.id,project]));
  for(const project of localUsable){
    const remote=merged.get(project.id);
    if(!remote||stamp(project.updated)>=stamp(remote.updated))merged.set(project.id,project);
  }
  let projects=[...merged.values()].sort((a,b)=>stamp(b.updated)-stamp(a.updated));
  if(!projects.length&&localProjects.length)projects=localProjects;
  const candidates=[settings?.active_project_client_id,local?.active,projects[0]?.id];
  const active=candidates.find(id=>id&&projects.some(project=>project.id===id))||null;
  return {active,projects};
}
function comparable(library){
  if(!library)return '';
  return JSON.stringify({active:library.active||null,projects:(library.projects||[]).map(project=>({id:project.id,params:project.params,actuals:project.actuals,updated:project.updated}))});
}
async function syncNow(){
  if(syncPromise)return syncPromise;
  syncPromise=(async()=>{
    const active=await ensureSession();
    if(!active){setState('signed_out','Entre para migrar a base local e sincronizar os empreendimentos.');return;}
    setState('syncing','Migrando e sincronizando empreendimentos…');
    const [remoteRows,settings]=await Promise.all([fetchRemoteProjects(),fetchRemoteSettings()]);
    const local=readLibrary()||{active:null,projects:[]};
    const localCount=(local.projects||[]).filter(project=>!isUntouchedDemo(project)).length;
    const merged=mergeLibraries(local,remoteRows,settings);
    const changed=comparable(local)!==comparable(merged);
    if(changed){
      writeNative(STORE,JSON.stringify(merged));
      lastLibrary=merged;
    }
    await upsertProjects(merged);
    await upsertSettings(merged);
    writeNative(MIGRATION_KEY,JSON.stringify({userId:currentUser.id,migratedAt:nowISO(),localProjectsMigrated:localCount,totalProjects:merged.projects.length}));
    setState('synced',localCount?'Base local migrada e dados salvos no Supabase.':'Dados salvos no Supabase.');
    if(changed){await pause(120);location.reload();}
  })().catch(error=>{
    setState(navigator.onLine?'error':'offline',navigator.onLine?'Falha ao sincronizar: '+error.message:'Sem internet. Alterações preservadas neste navegador.');
    throw error;
  }).finally(()=>{syncPromise=null;});
  return syncPromise;
}
function schedulePush(library,removed=[]){
  removed.forEach(id=>pendingRemoved.add(id));
  clearTimeout(syncTimer);
  syncTimer=setTimeout(async()=>{
    const ids=[...pendingRemoved];pendingRemoved.clear();
    try{
      if(!await ensureSession())return;
      setState('syncing','Salvando alterações…');
      await upsertProjects(library);
      await upsertSettings(library);
      await deleteRemoteProjects(ids);
      setState('synced','Dados salvos no Supabase.');
    }catch(error){
      setState(navigator.onLine?'error':'offline',navigator.onLine?'Falha ao sincronizar: '+error.message:'Sem internet. Alterações preservadas neste navegador.');
    }
  },SYNC_DELAY);
}

function cloudLabel(){
  return ({synced:'Nuvem sincronizada',syncing:'Sincronizando…',offline:'Offline',error:'Falha na nuvem',unavailable:'Supabase pendente',signed_out:'Entrar na nuvem'})[cloudState]||'Nuvem';
}
function installStyles(){
  if(document.getElementById('supabase-sync-safe-style'))return;
  const style=document.createElement('style');
  style.id='supabase-sync-safe-style';
  style.textContent=`
  .cloud-sync-button{display:inline-flex;align-items:center;gap:7px}.cloud-sync-button:before{content:'';width:7px;height:7px;border-radius:50%;background:#98a49d}.cloud-sync-button[data-state="synced"]:before{background:#5f8c65}.cloud-sync-button[data-state="syncing"]:before{background:#bb914a;animation:cloudPulse 1s infinite}.cloud-sync-button[data-state="error"]:before,.cloud-sync-button[data-state="offline"]:before{background:#b55742}.cloud-sync-button[data-state="unavailable"]:before{background:#bb914a}@keyframes cloudPulse{50%{opacity:.35}}
  .supabase-dialog{border:1px solid var(--line);border-radius:12px;padding:0;max-width:500px;width:calc(100% - 34px);color:var(--ink);box-shadow:0 24px 100px #0003}.supabase-dialog::backdrop{background:#112e2580;backdrop-filter:blur(4px)}.cloud-dialog-inner{padding:25px}.cloud-dialog-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.cloud-dialog-head h2{font-size:20px}.cloud-dialog-head p{font-size:10px;color:var(--muted);margin-top:6px}.cloud-dialog-close{border:0;background:none;padding:5px}.cloud-auth-tabs{display:flex;border:1px solid var(--line);padding:3px;border-radius:6px;margin:20px 0 15px}.cloud-auth-tabs button{flex:1;border:0;background:none;padding:8px;font-size:10px;border-radius:4px}.cloud-auth-tabs button.active{background:#eaf1e3;color:var(--green);font-weight:650}.cloud-auth-form{display:grid;gap:13px}.cloud-auth-form label{display:grid;gap:6px;font-size:10px}.cloud-auth-form input{border:1px solid #dfe5da;border-radius:5px;min-height:41px;padding:9px 10px;font-size:13px}.cloud-auth-form .button{width:100%;margin-top:3px}.cloud-auth-message{font-size:9px;line-height:1.6;color:var(--muted);min-height:15px}.cloud-auth-message.error{color:#a24f3b}.cloud-account{margin-top:19px;padding:15px;background:#f3f7ef;border-radius:7px}.cloud-account span{font-size:8px;color:var(--muted);letter-spacing:.8px}.cloud-account strong{display:block;font-size:13px;margin-top:5px}.cloud-account p,.cloud-local-note{font-size:9px;color:var(--muted);margin-top:7px;line-height:1.6}.cloud-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.cloud-blocker{margin-top:18px;padding:14px;background:#fff8ef;border:1px solid #ebd8b5;border-radius:7px}.cloud-blocker strong{font-size:11px}.cloud-blocker p{font-size:9px;color:#7b6948;margin-top:6px;line-height:1.65}.cloud-migration{margin-top:12px;padding:11px 13px;border:1px solid #dfe8d8;background:#f7faf4;border-radius:6px;font-size:9px;color:#53675a;line-height:1.55}@media(max-width:720px){.cloud-sync-button span{display:none}.supabase-dialog input{font-size:16px}}
  `;
  document.head.appendChild(style);
}
function scheduleControls(){
  if(renderScheduled)return;
  renderScheduled=true;
  requestAnimationFrame(()=>{renderScheduled=false;renderControls();});
}
function renderControls(){
  installStyles();
  const top=document.querySelector('.top-actions');
  if(!top)return;
  let button=top.querySelector('[data-cloud-button]');
  if(!button){
    button=document.createElement('button');
    button.type='button';button.className='button small cloud-sync-button';button.dataset.cloudButton='1';
    button.addEventListener('click',openDialog);
    const select=top.querySelector('.project-select');
    if(select)select.insertAdjacentElement('afterend',button);else top.prepend(button);
  }
  const label=cloudLabel();
  if(button.dataset.state!==cloudState)button.dataset.state=cloudState;
  if(button.title!==cloudMessage)button.title=cloudMessage;
  if(button.textContent!==label)button.textContent=label;
}
function ensureDialog(){
  let dialog=document.getElementById('supabase-sync-dialog');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='supabase-sync-dialog';dialog.className='supabase-dialog';document.body.appendChild(dialog);
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  return dialog;
}
function migrationSummary(){
  const info=safeJSON(localStorage.getItem(MIGRATION_KEY),null);
  if(!info||!currentUser||info.userId!==currentUser.id)return '';
  return '<div class="cloud-migration"><strong>Base local migrada</strong><br>'+Number(info.localProjectsMigrated||0)+' empreendimento(s) local(is) incorporado(s) à nuvem em '+new Date(info.migratedAt).toLocaleString('pt-BR')+'.</div>';
}
function renderDialog(message='',isError=false){
  const dialog=ensureDialog();
  if(cloudState==='unavailable'||!config?.configured){
    dialog.innerHTML='<div class="cloud-dialog-inner"><div class="cloud-dialog-head"><div><h2>Banco de dados Supabase</h2><p>Persistência em nuvem indisponível.</p></div><button class="cloud-dialog-close" data-cloud-close>✕</button></div><div class="cloud-blocker"><strong>Configuração pendente</strong><p>'+esc(config?.message||cloudMessage)+'</p></div><p class="cloud-local-note">A plataforma continua preservando os dados no navegador.</p></div>';
  }else if(session&&currentUser){
    dialog.innerHTML='<div class="cloud-dialog-inner"><div class="cloud-dialog-head"><div><h2>Supabase conectado</h2><p>'+esc(cloudMessage)+'</p></div><button class="cloud-dialog-close" data-cloud-close>✕</button></div><div class="cloud-account"><span>USUÁRIO</span><strong>'+esc(currentUser.email||currentUser.id)+'</strong><p>Os empreendimentos são protegidos por Row Level Security e sincronizados entre dispositivos.</p></div>'+migrationSummary()+'<div class="cloud-actions"><button class="button primary" data-cloud-sync-now>Migrar e sincronizar agora</button><button class="button" data-cloud-signout>Sair da nuvem</button></div></div>';
  }else{
    dialog.innerHTML='<div class="cloud-dialog-inner"><div class="cloud-dialog-head"><div><h2>Évora na nuvem</h2><p>Entre para migrar sua base local ao Supabase.</p></div><button class="cloud-dialog-close" data-cloud-close>✕</button></div><div class="cloud-auth-tabs"><button data-cloud-mode="login" class="'+(authMode==='login'?'active':'')+'">Entrar</button><button data-cloud-mode="signup" class="'+(authMode==='signup'?'active':'')+'">Criar conta</button></div><form class="cloud-auth-form" data-cloud-auth="'+authMode+'"><label>E-mail<input type="email" name="email" required autocomplete="email"></label><label>Senha<input type="password" name="password" required minlength="8" autocomplete="'+(authMode==='login'?'current-password':'new-password')+'"></label><div class="cloud-auth-message '+(isError?'error':'')+'">'+esc(message)+'</div><button class="button primary" type="submit">'+(authMode==='login'?'Entrar, migrar e sincronizar':'Criar conta')+'</button></form><p class="cloud-local-note">No primeiro acesso, todos os estudos deste navegador serão enviados ao Supabase. A cópia local será preservada.</p></div>';
  }
  bindDialog(dialog);
}
function bindDialog(dialog){
  dialog.querySelector('[data-cloud-close]')?.addEventListener('click',()=>dialog.close());
  dialog.querySelectorAll('[data-cloud-mode]').forEach(button=>button.addEventListener('click',()=>{authMode=button.dataset.cloudMode;renderDialog();}));
  dialog.querySelector('[data-cloud-signout]')?.addEventListener('click',()=>signOut());
  dialog.querySelector('[data-cloud-sync-now]')?.addEventListener('click',()=>syncNow().then(()=>renderDialog()).catch(error=>renderDialog(error.message,true)));
  const form=dialog.querySelector('[data-cloud-auth]');
  if(form)form.addEventListener('submit',async event=>{
    event.preventDefault();
    const submit=form.querySelector('button[type="submit"]');
    const data=new FormData(form),email=String(data.get('email')||'').trim(),password=String(data.get('password')||'');
    submit.disabled=true;submit.textContent='Processando…';
    try{
      if(form.dataset.cloudAuth==='login'){
        await signIn(email,password);renderDialog();await syncNow();
      }else{
        const response=await signUp(email,password);
        if(response?.access_token){renderDialog();await syncNow();}
        else renderDialog('Conta criada. Confirme o e-mail para liberar o acesso.');
      }
    }catch(error){renderDialog(error.message,true);}
  });
}
function openDialog(){
  renderDialog();
  const dialog=ensureDialog();
  if(!dialog.open)dialog.showModal();
}

window.addEventListener('evora:library-changed',event=>{
  const previous=safeJSON(event.detail?.previous,null)||lastLibrary;
  const next=safeJSON(event.detail?.value,null);
  if(!next)return;
  const before=new Set((previous?.projects||[]).map(project=>String(project.id)));
  const after=new Set((next.projects||[]).map(project=>String(project.id)));
  const removed=[...before].filter(id=>!after.has(id));
  lastLibrary=next;
  if(session&&config?.configured)schedulePush(next,removed);
});
window.addEventListener('online',()=>{if(session&&config?.configured)syncNow().catch(()=>{});});
window.addEventListener('offline',()=>setState('offline','Sem internet. Alterações preservadas localmente.'));
window.addEventListener('storage',event=>{
  if(event.key===SESSION_KEY){session=readSession();currentUser=session?.user||null;setState(session?'starting':'signed_out',session?'Validando sessão…':'Entre para migrar e sincronizar.');}
});

const root=document.getElementById('app');
if(root)new MutationObserver(scheduleControls).observe(root,{childList:true,subtree:true});

async function init(){
  installStyles();scheduleControls();
  if(!await loadConfig())return;
  if(!await ensureSession()){
    setState('signed_out','Entre para migrar a base local e sincronizar os empreendimentos.');
    return;
  }
  try{await syncNow();}catch{}
}

window.EvoraSupabase={
  get state(){return cloudState;},
  get user(){return currentUser;},
  sync:syncNow,
  signOut,
  open:openDialog
};

init();
})();
