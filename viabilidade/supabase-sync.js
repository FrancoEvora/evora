/* Évora Viabilidade · Supabase cloud sync v1.0
 * Uses only a public/publishable key in the browser. Authorization is enforced by RLS.
 */
(function(){
'use strict';

const STORE='evora.viabilidade.v1';
const SESSION_KEY='evora.supabase.session.v1';
const CONFIG_ENDPOINT='/api/supabase-config';
const PROJECTS_TABLE='viability_projects';
const SETTINGS_TABLE='viability_user_settings';
const SYNC_DELAY=850;

const originalSetItem=Storage.prototype.setItem;
let suspendLocalEvents=false;
Storage.prototype.setItem=function(key,value){
  const isLibrary=this===localStorage&&key===STORE;
  const previous=isLibrary?this.getItem(key):null;
  originalSetItem.call(this,key,value);
  if(isLibrary&&!suspendLocalEvents){
    window.dispatchEvent(new CustomEvent('evora:library-changed',{detail:{previous,value}}));
  }
};

const safeJSON=(value,fallback=null)=>{try{return JSON.parse(value);}catch{return fallback;}};
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const nowISO=()=>new Date().toISOString();
const timestamp=value=>{const time=Date.parse(value||'');return Number.isFinite(time)?time:0;};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

let config=null;
let session=readSession();
let currentUser=session&&session.user||null;
let cloudState='starting';
let cloudMessage='Preparando sincronização…';
let syncTimer=null;
let pendingRemoved=new Set();
let lastLibrary=readLibrary();
let syncInFlight=null;

function readLibrary(){
  const value=safeJSON(localStorage.getItem(STORE),null);
  return value&&Array.isArray(value.projects)?value:null;
}
function readSession(){
  const value=safeJSON(localStorage.getItem(SESSION_KEY),null);
  return value&&value.access_token&&value.refresh_token?value:null;
}
function saveSession(payload){
  if(!payload||!payload.access_token||!payload.refresh_token)return null;
  const stored={
    access_token:payload.access_token,
    refresh_token:payload.refresh_token,
    token_type:payload.token_type||'bearer',
    expires_at:Number(payload.expires_at)||Math.floor(Date.now()/1000)+(Number(payload.expires_in)||3600),
    user:payload.user||currentUser||null
  };
  originalSetItem.call(localStorage,SESSION_KEY,JSON.stringify(stored));
  session=stored;currentUser=stored.user||null;return stored;
}
function clearSession(){
  localStorage.removeItem(SESSION_KEY);session=null;currentUser=null;
}
function setState(state,message){
  cloudState=state;cloudMessage=message||'';renderCloudControls();
  window.dispatchEvent(new CustomEvent('evora:supabase-status',{detail:{state,message:cloudMessage,user:currentUser}}));
}

async function parseResponse(response){
  const text=await response.text();
  const data=text?safeJSON(text,text):null;
  if(!response.ok){
    const message=data&&typeof data==='object'&&(data.msg||data.message||data.error_description||data.error)||response.statusText||'Falha na comunicação com o Supabase.';
    const error=new Error(String(message));error.status=response.status;error.data=data;throw error;
  }
  return data;
}
async function loadConfig(){
  try{
    const response=await fetch(CONFIG_ENDPOINT,{headers:{Accept:'application/json'},cache:'no-store'});
    const text=await response.text(),data=text?safeJSON(text,{}):{};
    config=data||{};
    if(!response.ok||!config.configured||!config.url||!config.publishableKey){
      setState('unavailable',config.message||'Supabase ainda não configurado.');return false;
    }
    config.url=String(config.url).replace(/\/$/,'');return true;
  }catch(error){
    config={configured:false,message:error.message};setState('unavailable','Configuração do Supabase indisponível.');return false;
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
  if(!session||!session.refresh_token)return null;
  try{
    const data=await authRequest('token?grant_type=refresh_token',{body:{refresh_token:session.refresh_token}});
    return saveSession(data);
  }catch(error){clearSession();return null;}
}
async function ensureSession(){
  if(!session)return null;
  if(Number(session.expires_at||0)<=Math.floor(Date.now()/1000)+75){
    const refreshed=await refreshSession();if(!refreshed)return null;
  }
  if(!currentUser){
    try{
      const user=await authRequest('user',{method:'GET',token:session.access_token});
      currentUser=user;session.user=user;originalSetItem.call(localStorage,SESSION_KEY,JSON.stringify(session));
    }catch{clearSession();return null;}
  }
  return session;
}
async function signIn(email,password){
  const data=await authRequest('token?grant_type=password',{body:{email,password}});
  saveSession(data);return data;
}
async function signUp(email,password){
  const redirect=encodeURIComponent(location.origin+location.pathname);
  const data=await authRequest('signup?redirect_to='+redirect,{body:{email,password,data:{product:'evora-viabilidade'}}});
  if(data&&data.access_token)saveSession(data);
  return data;
}
async function signOut(){
  try{if(session)await authRequest('logout',{token:session.access_token,body:{scope:'local'}});}catch{}
  clearSession();setState('signed_out','Entre para sincronizar os empreendimentos.');renderAuthDialog();
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
function isUntouchedDemo(project){
  return project&&project.id==='demo'&&project.params&&project.params.name==='Residencial Horizonte'&&String(project.params.city||'').includes('demonstrativo');
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
  if(!currentUser||!library||!Array.isArray(library.projects)||!library.projects.length)return;
  const rows=library.projects.map(project=>localProjectRow(project,currentUser.id));
  await restRequest(PROJECTS_TABLE+'?on_conflict=user_id%2Cclient_id',{method:'POST',body:rows,prefer:'resolution=merge-duplicates,return=minimal'});
}
async function upsertSettings(library){
  if(!currentUser||!library)return;
  await restRequest(SETTINGS_TABLE+'?on_conflict=user_id',{method:'POST',body:{user_id:currentUser.id,active_project_client_id:library.active||null,schema_version:1,updated_at:nowISO()},prefer:'resolution=merge-duplicates,return=minimal'});
}
async function deleteRemoteProjects(ids){
  if(!ids.length)return;
  for(const id of ids){
    await restRequest(PROJECTS_TABLE+'?client_id=eq.'+encodeURIComponent(id),{method:'DELETE',prefer:'return=minimal'});
  }
}
function mergeLibraries(local,remoteRows,settings){
  const localProjects=local&&Array.isArray(local.projects)?local.projects.slice():[];
  const remoteProjects=remoteRows.map(remoteProject);
  const localUsable=remoteProjects.length&&localProjects.length===1&&isUntouchedDemo(localProjects[0])?[]:localProjects;
  const merged=new Map();
  remoteProjects.forEach(project=>merged.set(project.id,project));
  localUsable.forEach(project=>{
    const remote=merged.get(project.id);
    if(!remote||timestamp(project.updated)>=timestamp(remote.updated))merged.set(project.id,project);
  });
  let projects=[...merged.values()].sort((a,b)=>timestamp(b.updated)-timestamp(a.updated));
  if(!projects.length&&localProjects.length)projects=localProjects;
  const candidates=[settings&&settings.active_project_client_id,local&&local.active,projects[0]&&projects[0].id];
  const active=candidates.find(id=>id&&projects.some(project=>project.id===id))||null;
  return {active,projects};
}
function comparable(library){
  if(!library)return '';
  return JSON.stringify({active:library.active||null,projects:(library.projects||[]).map(project=>({id:project.id,params:project.params,actuals:project.actuals,updated:project.updated}))});
}

async function pullAndMerge(){
  const active=await ensureSession();
  if(!active){setState('signed_out','Entre para sincronizar os empreendimentos.');return;}
  setState('syncing','Sincronizando empreendimentos…');
  const [remoteRows,settings]=await Promise.all([fetchRemoteProjects(),fetchRemoteSettings()]);
  const local=readLibrary()||{active:null,projects:[]};
  const merged=mergeLibraries(local,remoteRows,settings);
  const changed=comparable(local)!==comparable(merged);
  if(changed){
    suspendLocalEvents=true;originalSetItem.call(localStorage,STORE,JSON.stringify(merged));suspendLocalEvents=false;lastLibrary=merged;
  }
  await upsertProjects(merged);await upsertSettings(merged);
  setState('synced','Dados salvos no Supabase.');
  if(changed){await delay(120);location.reload();}
}
async function pushLibrary(library,removed=[]){
  if(syncInFlight)return syncInFlight;
  syncInFlight=(async()=>{
    try{
      const active=await ensureSession();
      if(!active){setState('signed_out','Entre para sincronizar os empreendimentos.');return;}
      setState('syncing','Salvando alterações…');
      await upsertProjects(library);await upsertSettings(library);await deleteRemoteProjects(removed);
      setState('synced','Dados salvos no Supabase.');
    }catch(error){
      setState(navigator.onLine?'error':'offline',navigator.onLine?'Falha ao sincronizar: '+error.message:'Sem internet. Alterações preservadas neste navegador.');
      throw error;
    }finally{syncInFlight=null;}
  })();
  return syncInFlight;
}
function schedulePush(library,removed=[]){
  removed.forEach(id=>pendingRemoved.add(id));
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>{
    const ids=[...pendingRemoved];pendingRemoved.clear();
    pushLibrary(library,ids).catch(()=>{});
  },SYNC_DELAY);
}

function cloudLabel(){
  if(cloudState==='synced')return 'Nuvem sincronizada';
  if(cloudState==='syncing')return 'Sincronizando…';
  if(cloudState==='offline')return 'Offline';
  if(cloudState==='error')return 'Falha na nuvem';
  if(cloudState==='unavailable')return 'Supabase pendente';
  if(cloudState==='signed_out')return 'Entrar na nuvem';
  return 'Nuvem';
}
function installStyles(){
  if(document.getElementById('supabase-sync-style'))return;
  const style=document.createElement('style');style.id='supabase-sync-style';
  style.textContent=`
  .cloud-sync-button{position:relative}.cloud-sync-button:before{content:'';width:7px;height:7px;border-radius:50%;background:#9aa69f;display:block}.cloud-sync-button[data-state="synced"]:before{background:#5f8c65}.cloud-sync-button[data-state="syncing"]:before{background:#bb914a;animation:cloudPulse 1s infinite}.cloud-sync-button[data-state="offline"],.cloud-sync-button[data-state="error"]{color:#a15845}.cloud-sync-button[data-state="offline"]:before,.cloud-sync-button[data-state="error"]:before{background:#b55742}.cloud-sync-button[data-state="unavailable"]:before{background:#bb914a}@keyframes cloudPulse{50%{opacity:.35}}
  .supabase-dialog{border:1px solid var(--line);border-radius:12px;padding:0;max-width:500px;width:calc(100% - 34px);color:var(--ink);box-shadow:0 24px 100px #0003}.supabase-dialog::backdrop{background:#112e2580;backdrop-filter:blur(4px)}.cloud-dialog-inner{padding:25px}.cloud-dialog-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.cloud-dialog-head h2{font-size:20px}.cloud-dialog-head p{font-size:10px;color:var(--muted);margin-top:6px}.cloud-dialog-close{border:0;background:none;padding:5px}.cloud-auth-tabs{display:flex;border:1px solid var(--line);padding:3px;border-radius:6px;margin:20px 0 15px}.cloud-auth-tabs button{flex:1;border:0;background:none;padding:8px;font-size:10px;border-radius:4px}.cloud-auth-tabs button.active{background:#eaf1e3;color:var(--green);font-weight:650}.cloud-auth-form{display:grid;gap:13px}.cloud-auth-form label{display:grid;gap:6px;font-size:10px}.cloud-auth-form input{border:1px solid #dfe5da;border-radius:5px;min-height:41px;padding:9px 10px;font-size:13px}.cloud-auth-form .button{width:100%;margin-top:3px}.cloud-auth-message{font-size:9px;line-height:1.6;color:var(--muted);min-height:15px}.cloud-auth-message.error{color:#a24f3b}.cloud-account{margin-top:19px;padding:15px;background:#f3f7ef;border-radius:7px}.cloud-account span{font-size:8px;color:var(--muted);letter-spacing:.8px}.cloud-account strong{display:block;font-size:13px;margin-top:5px}.cloud-account p{font-size:9px;color:var(--muted);margin-top:7px}.cloud-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.cloud-blocker{margin-top:18px;padding:14px;background:#fff8ef;border:1px solid #ebd8b5;border-radius:7px}.cloud-blocker strong{font-size:11px}.cloud-blocker p{font-size:9px;color:#7b6948;margin-top:6px;line-height:1.65}.cloud-local-note{font-size:9px;color:var(--muted);line-height:1.6;margin-top:14px}@media(max-width:720px){.cloud-sync-button span{display:none}.supabase-dialog input{font-size:16px}}
  `;document.head.appendChild(style);
}
function ensureDialog(){
  let dialog=document.getElementById('supabase-sync-dialog');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='supabase-sync-dialog';dialog.className='supabase-dialog';document.body.appendChild(dialog);
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});return dialog;
}
let authMode='login';
function renderAuthDialog(message='',isError=false){
  const dialog=ensureDialog();
  if(cloudState==='unavailable'||!config||!config.configured){
    dialog.innerHTML='<div class="cloud-dialog-inner"><div class="cloud-dialog-head"><div><h2>Banco de dados Supabase</h2><p>Persistência em nuvem preparada, aguardando ativação.</p></div><button class="cloud-dialog-close" data-cloud-close aria-label="Fechar">✕</button></div><div class="cloud-blocker"><strong>Projeto evora-gestao indisponível</strong><p>O projeto Supabase está inativo por pendências de cobrança da organização. O schema, a autenticação e a sincronização já estão implementados; falta restaurar o projeto, aplicar o schema e configurar a chave publicável na Vercel.</p></div><p class="cloud-local-note">Enquanto isso, a plataforma continua salvando os estudos neste navegador. Exporte o backup JSON antes de limpar dados ou trocar de computador.</p></div>';
    bindDialog(dialog);return;
  }
  if(session&&currentUser){
    dialog.innerHTML='<div class="cloud-dialog-inner"><div class="cloud-dialog-head"><div><h2>Supabase conectado</h2><p>'+esc(cloudMessage||'Dados sincronizados.')+'</p></div><button class="cloud-dialog-close" data-cloud-close aria-label="Fechar">✕</button></div><div class="cloud-account"><span>USUÁRIO</span><strong>'+esc(currentUser.email||currentUser.id)+'</strong><p>Os empreendimentos deste usuário são protegidos por Row Level Security e sincronizados entre dispositivos.</p></div><div class="cloud-actions"><button class="button primary" data-cloud-sync-now>Sincronizar agora</button><button class="button" data-cloud-signout>Sair da nuvem</button></div></div>';
    bindDialog(dialog);return;
  }
  dialog.innerHTML='<div class="cloud-dialog-inner"><div class="cloud-dialog-head"><div><h2>Évora na nuvem</h2><p>Entre para sincronizar todos os empreendimentos no Supabase.</p></div><button class="cloud-dialog-close" data-cloud-close aria-label="Fechar">✕</button></div><div class="cloud-auth-tabs"><button data-cloud-mode="login" class="'+(authMode==='login'?'active':'')+'">Entrar</button><button data-cloud-mode="signup" class="'+(authMode==='signup'?'active':'')+'">Criar conta</button></div><form class="cloud-auth-form" data-cloud-auth="'+authMode+'"><label>E-mail<input type="email" name="email" required autocomplete="email"></label><label>Senha<input type="password" name="password" required minlength="8" autocomplete="'+(authMode==='login'?'current-password':'new-password')+'"></label><div class="cloud-auth-message '+(isError?'error':'')+'">'+esc(message)+'</div><button class="button primary" type="submit">'+(authMode==='login'?'Entrar e sincronizar':'Criar conta')+'</button></form><p class="cloud-local-note">No primeiro acesso, os estudos já existentes neste navegador serão migrados automaticamente, sem apagar o backup local.</p></div>';
  bindDialog(dialog);
}
function bindDialog(dialog){
  dialog.querySelector('[data-cloud-close]')?.addEventListener('click',()=>dialog.close());
  dialog.querySelectorAll('[data-cloud-mode]').forEach(button=>button.addEventListener('click',()=>{authMode=button.dataset.cloudMode;renderAuthDialog();}));
  dialog.querySelector('[data-cloud-signout]')?.addEventListener('click',()=>signOut());
  dialog.querySelector('[data-cloud-sync-now]')?.addEventListener('click',()=>pullAndMerge().catch(error=>renderAuthDialog(error.message,true)));
  const form=dialog.querySelector('[data-cloud-auth]');
  if(form)form.addEventListener('submit',async event=>{
    event.preventDefault();const submit=form.querySelector('button[type="submit"]'),data=new FormData(form),email=String(data.get('email')||'').trim(),password=String(data.get('password')||'');submit.disabled=true;submit.textContent='Processando…';
    try{
      if(form.dataset.cloudAuth==='login'){
        await signIn(email,password);renderAuthDialog();await pullAndMerge();
      }else{
        const response=await signUp(email,password);
        if(response&&response.access_token){renderAuthDialog();await pullAndMerge();}
        else renderAuthDialog('Conta criada. Confirme o e-mail para liberar o primeiro acesso.',false);
      }
    }catch(error){renderAuthDialog(error.message,true);}finally{submit.disabled=false;}
  });
}
function renderCloudControls(){
  installStyles();
  const top=document.querySelector('.top-actions');
  if(!top)return;
  let button=top.querySelector('[data-cloud-button]');
  if(!button){
    button=document.createElement('button');button.type='button';button.className='button small cloud-sync-button';button.dataset.cloudButton='1';button.innerHTML='<span></span>';button.addEventListener('click',()=>{renderAuthDialog();ensureDialog().showModal();});
    const projectSelect=top.querySelector('.project-select');
    if(projectSelect)projectSelect.insertAdjacentElement('afterend',button);else top.prepend(button);
  }
  button.dataset.state=cloudState;button.title=cloudMessage||cloudLabel();button.innerHTML='<span>'+esc(cloudLabel())+'</span>';
}

window.addEventListener('evora:library-changed',event=>{
  const previous=safeJSON(event.detail&&event.detail.previous,null)||lastLibrary;
  const next=safeJSON(event.detail&&event.detail.value,null);
  if(!next||suspendLocalEvents)return;
  const before=new Set((previous&&previous.projects||[]).map(project=>String(project.id)));
  const after=new Set((next.projects||[]).map(project=>String(project.id)));
  const removed=[...before].filter(id=>!after.has(id));
  lastLibrary=next;
  if(session&&config&&config.configured)schedulePush(next,removed);
});
window.addEventListener('online',()=>{if(session&&config&&config.configured)pullAndMerge().catch(()=>{});});
window.addEventListener('offline',()=>setState('offline','Sem internet. Alterações preservadas localmente.'));
window.addEventListener('storage',event=>{
  if(event.key===SESSION_KEY){session=readSession();currentUser=session&&session.user||null;setState(session?'starting':'signed_out',session?'Validando sessão…':'Entre para sincronizar os empreendimentos.');}
});

const appRoot=document.getElementById('app');
if(appRoot)new MutationObserver(renderCloudControls).observe(appRoot,{childList:true,subtree:true});

async function init(){
  installStyles();renderCloudControls();
  const available=await loadConfig();
  if(!available)return;
  const active=await ensureSession();
  if(!active){setState('signed_out','Entre para sincronizar os empreendimentos.');return;}
  try{await pullAndMerge();}catch(error){setState('error','Falha ao sincronizar: '+error.message);}
}

window.EvoraSupabase={
  get state(){return cloudState;},
  get user(){return currentUser;},
  sync:()=>pullAndMerge(),
  signOut,
  open:()=>{renderAuthDialog();ensureDialog().showModal();}
};

init();
})();
