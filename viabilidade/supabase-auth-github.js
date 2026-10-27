/* Évora Viabilidade · GitHub OAuth bridge v1.0 */
(function(){
'use strict';
if(window.__evoraGithubAuthV1)return;
window.__evoraGithubAuthV1=true;

const SESSION_KEY='evora.supabase.session.v1';
const RETURN_HASH_KEY='evora.auth.returnHash.v1';
const AUTH_ERROR_KEY='evora.auth.error.v1';
const CONFIG_ENDPOINT='/supabase-config.json';
const DEFAULT_RETURN_HASH='#intelligence';

const safeJSON=(value,fallback=null)=>{try{return JSON.parse(value);}catch{return fallback;}};
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const nativeSetItem=Storage.prototype.setItem;
let configPromise=null;
let scheduled=false;

function writeSession(payload){
 if(!payload.access_token||!payload.refresh_token)return false;
 const session={
  access_token:payload.access_token,
  refresh_token:payload.refresh_token,
  token_type:payload.token_type||'bearer',
  expires_at:Number(payload.expires_at)||Math.floor(Date.now()/1000)+(Number(payload.expires_in)||3600),
  provider_token:payload.provider_token||null,
  provider_refresh_token:payload.provider_refresh_token||null,
  user:null
 };
 nativeSetItem.call(localStorage,SESSION_KEY,JSON.stringify(session));
 return true;
}
function storedReturnHash(){
 const value=sessionStorage.getItem(RETURN_HASH_KEY)||DEFAULT_RETURN_HASH;
 sessionStorage.removeItem(RETURN_HASH_KEY);
 return value.startsWith('#')?value:'#'+value;
}
function cleanCallbackUrl(returnHash){
 const url=new URL(location.href);
 ['auth_callback','auth_error','auth_error_description','error','error_code','error_description','code'].forEach(key=>url.searchParams.delete(key));
 url.hash='';
 history.replaceState(null,'',url.pathname+(url.search||'')+returnHash);
 window.dispatchEvent(new HashChangeEvent('hashchange'));
}
function captureOAuthCallback(){
 const hashParams=new URLSearchParams(location.hash.startsWith('#')?location.hash.slice(1):'');
 const queryParams=new URLSearchParams(location.search);
 const accessToken=hashParams.get('access_token');
 const refreshToken=hashParams.get('refresh_token');
 const hashError=hashParams.get('error_description')||hashParams.get('error');
 const queryError=queryParams.get('auth_error_description')||queryParams.get('auth_error')||queryParams.get('error_description')||queryParams.get('error');
 const returnHash=storedReturnHash();
 if(accessToken&&refreshToken){
  writeSession({
   access_token:accessToken,
   refresh_token:refreshToken,
   token_type:hashParams.get('token_type')||'bearer',
   expires_in:Number(hashParams.get('expires_in'))||3600,
   expires_at:Number(hashParams.get('expires_at'))||0,
   provider_token:hashParams.get('provider_token'),
   provider_refresh_token:hashParams.get('provider_refresh_token')
  });
  sessionStorage.removeItem(AUTH_ERROR_KEY);
  cleanCallbackUrl(returnHash);
  return true;
 }
 if(hashError||queryError){
  sessionStorage.setItem(AUTH_ERROR_KEY,String(hashError||queryError));
  cleanCallbackUrl(returnHash);
 }
 return false;
}

async function loadConfig(){
 if(configPromise)return configPromise;
 configPromise=fetch(CONFIG_ENDPOINT,{headers:{Accept:'application/json'},cache:'no-store'})
  .then(async response=>{
   const text=await response.text();
   const data=text?safeJSON(text,{}):{};
   if(!response.ok||!data?.configured||!data?.url)throw new Error(data?.message||'A conexão com o Supabase não está disponível.');
   return data;
  })
  .catch(error=>{configPromise=null;throw error;});
 return configPromise;
}
function oauthReturnUrl(){
 const url=new URL(location.href);
 url.hash='';
 ['auth_error','auth_error_description','error','error_code','error_description','code'].forEach(key=>url.searchParams.delete(key));
 url.searchParams.set('auth_callback','github');
 return url.toString();
}
async function signInWithGitHub(){
 await loadConfig();
 const returnHash=location.hash&&location.hash!=='#'&& !location.hash.includes('access_token=')?location.hash:DEFAULT_RETURN_HASH;
 sessionStorage.setItem(RETURN_HASH_KEY,returnHash||DEFAULT_RETURN_HASH);
 sessionStorage.removeItem(AUTH_ERROR_KEY);
 const start=new URL('/api/github-auth-start',location.origin);
 start.searchParams.set('return_to',oauthReturnUrl());
 location.assign(start.toString());
}
function githubIcon(){
 return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .8a11.5 11.5 0 0 0-3.64 22.42c.58.1.79-.25.79-.56v-2.2c-3.22.7-3.9-1.36-3.9-1.36-.52-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.4-1.27.74-1.56-2.57-.29-5.27-1.28-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A10.9 10.9 0 0 1 12 6.27c.98 0 1.94.13 2.84.39 2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.08.79 2.18v3.18c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .8Z"/></svg>';
}
function authErrorMessage(raw){
 const value=String(raw||'');
 if(!value)return '';
 if(/provider.*not enabled|github_provider_disabled|unsupported provider/i.test(value)){
  return 'O login com GitHub ainda precisa ser habilitado no Supabase Auth. A interface já está pronta; falta cadastrar a OAuth App do GitHub no projeto evora-gestao.';
 }
 if(/redirect/i.test(value))return 'A URL de retorno da Évora Viabilidade ainda não foi autorizada no Supabase.';
 if(/access_denied|denied|cancel/i.test(value))return 'O acesso pelo GitHub foi cancelado antes da conclusão.';
 return value;
}
function setupDetails(){
 return '<details class="github-auth-setup"><summary>Configuração administrativa necessária</summary><div><span>OAuth App</span><b>Évora Viabilidade</b><span>Homepage</span><code>https://evora-viabilidade.vercel.app</code><span>Callback do GitHub</span><code>https://qsdffayasuzsmngteika.supabase.co/auth/v1/callback</code><span>Redirect permitido no Supabase</span><code>https://evora-viabilidade.vercel.app/**</code></div></details>';
}
function injectCloudDialog(){
 const dialog=document.getElementById('supabase-sync-dialog');
 if(!dialog?.open||dialog.querySelector('[data-github-auth-block]'))return;
 if(localStorage.getItem(SESSION_KEY))return;
 const inner=dialog.querySelector('.cloud-dialog-inner');
 const form=dialog.querySelector('.cloud-auth-form');
 if(!inner||!form)return;
 const rawError=sessionStorage.getItem(AUTH_ERROR_KEY)||'';
 const error=authErrorMessage(rawError);
 const block=document.createElement('div');
 block.className='github-auth-block';
 block.dataset.githubAuthBlock='1';
 block.innerHTML='<button type="button" class="github-auth-button" data-cloud-github>'+githubIcon()+'<span>Continuar com GitHub</span></button><p>Use a mesma conta GitHub com a qual você acessa o ecossistema da Évora. No primeiro acesso, a base deste navegador será migrada para o Supabase.</p>'+(error?'<div class="github-auth-error"><strong>Não foi possível entrar com GitHub.</strong><span>'+esc(error)+'</span>'+(/habilitado no Supabase/i.test(error)?setupDetails():'')+'</div>':'')+'<div class="github-auth-divider"><span>ou use uma conta da aplicação</span></div>';
 const tabs=dialog.querySelector('.cloud-auth-tabs');
 inner.insertBefore(block,tabs||form);
}
function enhanceIntelligenceLogin(){
 document.querySelectorAll('[data-intel-login]').forEach(button=>{
  if(button.dataset.githubAuthReady==='1')return;
  button.dataset.githubAuthReady='1';
  button.textContent='Continuar com GitHub';
  button.title='Entrar com GitHub e sincronizar o empreendimento';
 });
}
function installStyles(){
 if(document.getElementById('evora-github-auth-style'))return;
 const style=document.createElement('style');
 style.id='evora-github-auth-style';
 style.textContent=`
 .github-auth-block{margin:20px 0 4px}.github-auth-button{width:100%;min-height:44px;border:0;border-radius:6px;background:#17202a;color:#fff;display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 15px;font:600 11px/1 system-ui;cursor:pointer}.github-auth-button:hover{background:#0d1117}.github-auth-button svg{width:18px;height:18px}.github-auth-block>p{font-size:9px;line-height:1.55;color:var(--muted);margin:9px 2px 0}.github-auth-divider{display:flex;align-items:center;gap:10px;margin:17px 0 0;color:var(--muted);font-size:8px}.github-auth-divider:before,.github-auth-divider:after{content:'';height:1px;background:var(--line);flex:1}.github-auth-error{margin-top:12px;padding:11px 12px;border:1px solid #e8c8bc;background:#fff7f4;border-radius:6px}.github-auth-error strong,.github-auth-error span{display:block}.github-auth-error strong{font-size:10px;color:#934b39}.github-auth-error span{font-size:8px;line-height:1.55;color:#7d5e55;margin-top:4px}.github-auth-setup{margin-top:9px;border-top:1px solid #ecd8d0;padding-top:8px}.github-auth-setup summary{cursor:pointer;font-size:8px;font-weight:650;color:#6f544c}.github-auth-setup div{display:grid;gap:4px;margin-top:8px}.github-auth-setup span{font-size:7px!important;text-transform:uppercase;letter-spacing:.7px}.github-auth-setup b,.github-auth-setup code{font-size:8px;overflow-wrap:anywhere;color:#4a3a35}.cloud-auth-tabs{margin-top:13px!important}
 `;
 document.head.appendChild(style);
}
function enhance(){
 if(scheduled)return;
 scheduled=true;
 requestAnimationFrame(()=>{
  scheduled=false;
  installStyles();
  injectCloudDialog();
  enhanceIntelligenceLogin();
 });
}

captureOAuthCallback();
const observer=new MutationObserver(enhance);
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',enhance);
window.addEventListener('evora:supabase-status',enhance);
document.addEventListener('click',event=>{
 const github=event.target.closest?.('[data-cloud-github]');
 const intelligence=event.target.closest?.('[data-intel-login]');
 if(!github&&!intelligence)return;
 event.preventDefault();
 event.stopImmediatePropagation();
 signInWithGitHub().catch(error=>{
  sessionStorage.setItem(AUTH_ERROR_KEY,error.message||'Não foi possível iniciar o login com GitHub.');
  window.EvoraSupabase?.open?.();
  enhance();
 });
},true);

window.EvoraGitHubAuth={signIn:signInWithGitHub,get error(){return authErrorMessage(sessionStorage.getItem(AUTH_ERROR_KEY));}};
enhance();
})();
