/* Évora Viabilidade · GitHub OAuth readiness v1.0 */
(function(){
'use strict';
if(window.__evoraGithubAuthStatusV1)return;
window.__evoraGithubAuthStatusV1=true;

const AUTH_ERROR_KEY='evora.auth.error.v1';
const CHECK_ENDPOINT='/api/github-auth-start?check=1';
const fallbackSetup={
 applicationName:'Évora Viabilidade',
 homepageUrl:'https://evora-viabilidade.vercel.app',
 callbackUrl:'https://qsdffayasuzsmngteika.supabase.co/auth/v1/callback',
 redirectPattern:'https://evora-viabilidade.vercel.app/**',
 githubOAuthAppsUrl:'https://github.com/settings/developers',
 supabaseProvidersUrl:'https://supabase.com/dashboard/project/qsdffayasuzsmngteika/auth/providers',
 supabaseUrlConfigUrl:'https://supabase.com/dashboard/project/qsdffayasuzsmngteika/auth/url-configuration'
};

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let providerStatus=null;
let scheduled=false;
let statusPromise=null;

function loadStatus(force=false){
 if(statusPromise&&!force)return statusPromise;
 statusPromise=fetch(CHECK_ENDPOINT,{headers:{Accept:'application/json'},cache:'no-store'})
  .then(async response=>{
   const text=await response.text();
   let data={};
   try{data=text?JSON.parse(text):{};}catch{data={enabled:false,description:'Não foi possível verificar a configuração do GitHub.'};}
   providerStatus={
    enabled:Boolean(response.ok&&data.enabled),
    code:data.code||null,
    description:data.description||'',
    setup:{...fallbackSetup,...(data.setup||{})}
   };
   return providerStatus;
  })
  .catch(error=>{
   providerStatus={enabled:false,code:'github_status_unavailable',description:error.message||'Não foi possível verificar a configuração do GitHub.',setup:fallbackSetup};
   return providerStatus;
  })
  .finally(()=>{statusPromise=null;scheduleEnhance();});
 return statusPromise;
}
function setupHtml(setup){
 return '<details class="github-provider-setup" open><summary>Ativação administrativa pendente</summary><div class="github-provider-steps">'+
  '<div><span>1</span><p>Crie uma OAuth App no GitHub chamada <b>'+esc(setup.applicationName)+'</b>.</p></div>'+
  '<label>Homepage URL<code>'+esc(setup.homepageUrl)+'</code></label>'+
  '<label>Authorization callback URL<code>'+esc(setup.callbackUrl)+'</code></label>'+
  '<div><span>2</span><p>No Supabase, habilite <b>Authentication → Providers → GitHub</b> e informe o Client ID e o Client Secret.</p></div>'+
  '<div><span>3</span><p>Em <b>Authentication → URL Configuration</b>, autorize:</p></div>'+
  '<label>Redirect URL<code>'+esc(setup.redirectPattern)+'</code></label>'+
  '<div class="github-provider-links"><a href="'+esc(setup.githubOAuthAppsUrl)+'" target="_blank" rel="noopener noreferrer">Abrir OAuth Apps do GitHub</a><a href="'+esc(setup.supabaseProvidersUrl)+'" target="_blank" rel="noopener noreferrer">Abrir provedores no Supabase</a><a href="'+esc(setup.supabaseUrlConfigUrl)+'" target="_blank" rel="noopener noreferrer">Abrir URLs no Supabase</a></div>'+
  '<p class="github-provider-secret-note">O Client Secret deve ser inserido diretamente no Supabase. Não o envie por mensagem nem o grave no código.</p>'+
 '</div></details>';
}
function renderDialogStatus(){
 const dialog=document.getElementById('supabase-sync-dialog');
 if(!dialog?.open||!providerStatus||providerStatus.enabled)return;
 const block=dialog.querySelector('[data-github-auth-block]');
 if(!block)return;
 let panel=block.querySelector('[data-github-provider-status]');
 if(!panel){
  panel=document.createElement('div');
  panel.className='github-provider-status';
  panel.dataset.githubProviderStatus='1';
  const divider=block.querySelector('.github-auth-divider');
  block.insertBefore(panel,divider||null);
 }
 panel.innerHTML='<strong>Login com GitHub aguardando ativação</strong><p>'+esc(providerStatus.description||'O provedor GitHub ainda não está habilitado no Supabase Auth.')+'</p>'+setupHtml(providerStatus.setup);
 const button=block.querySelector('[data-cloud-github]');
 if(button){
  button.dataset.providerReady='0';
  button.setAttribute('aria-disabled','true');
  const label=button.querySelector('span');
  if(label)label.textContent='GitHub · ativação pendente';
  button.title='Consulte as etapas de ativação abaixo';
 }
}
function renderIntelligenceStatus(){
 document.querySelectorAll('[data-intel-login]').forEach(button=>{
  if(!providerStatus)return;
  if(providerStatus.enabled){
   button.dataset.providerReady='1';
   button.removeAttribute('aria-disabled');
   button.textContent='Continuar com GitHub';
   button.title='Entrar com GitHub e sincronizar o empreendimento';
  }else{
   button.dataset.providerReady='0';
   button.setAttribute('aria-disabled','true');
   button.textContent='Ativar login com GitHub';
   button.title='O provedor GitHub ainda precisa ser habilitado no Supabase';
  }
 });
 const banner=document.querySelector('.intel-login-banner');
 if(!banner||!providerStatus||providerStatus.enabled)return;
 let note=banner.querySelector('[data-intel-github-status]');
 if(!note){
  note=document.createElement('div');
  note.className='intel-github-status';
  note.dataset.intelGithubStatus='1';
  banner.appendChild(note);
 }
 note.innerHTML='<strong>Integração preparada; ativação externa pendente.</strong><span>'+esc(providerStatus.description||'O GitHub ainda não está habilitado no Supabase Auth.')+'</span>';
}
function installStyles(){
 if(document.getElementById('evora-github-provider-status-style'))return;
 const style=document.createElement('style');
 style.id='evora-github-provider-status-style';
 style.textContent=`
 .github-provider-status{margin-top:12px;padding:12px;border:1px solid #ead9ba;background:#fffaf0;border-radius:7px}.github-provider-status>strong{display:block;font-size:10px;color:#755a2e}.github-provider-status>p{font-size:8px;line-height:1.55;color:#76684d;margin-top:5px}.github-provider-setup{margin-top:10px;border-top:1px solid #eadfc9;padding-top:9px}.github-provider-setup summary{cursor:pointer;font-size:8px;font-weight:700;color:#5d513a}.github-provider-steps{display:grid;gap:8px;margin-top:9px}.github-provider-steps>div:not(.github-provider-links){display:flex;gap:8px;align-items:flex-start}.github-provider-steps>div>span{display:grid;place-items:center;width:17px;height:17px;border-radius:50%;background:#ebe1cc;color:#705b35;font-size:8px;font-weight:700;flex:0 0 auto}.github-provider-steps p{font-size:8px;line-height:1.5;color:#6d624f}.github-provider-steps label{display:grid;gap:4px;font-size:7px;text-transform:uppercase;letter-spacing:.7px;color:#88795f}.github-provider-steps code{display:block;padding:7px 8px;border:1px solid #e6ddcb;background:#fff;border-radius:4px;color:#493f30;font:8px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:none;letter-spacing:0;overflow-wrap:anywhere}.github-provider-links{display:flex;gap:6px;flex-wrap:wrap}.github-provider-links a{font-size:8px;color:#315f43;text-decoration:none;border:1px solid #d8e3d2;background:#f6faf3;border-radius:4px;padding:6px 8px}.github-provider-secret-note{padding:8px 9px;background:#fff4ef;border-left:3px solid #b66a52;border-radius:0 4px 4px 0}.intel-github-status{grid-column:1/-1;margin-top:9px;padding:9px 11px;border:1px solid #ead9ba;background:#fffaf0;border-radius:6px}.intel-github-status strong,.intel-github-status span{display:block}.intel-github-status strong{font-size:9px;color:#755a2e}.intel-github-status span{font-size:8px;line-height:1.5;color:#76684d;margin-top:3px}[data-cloud-github][aria-disabled="true"],[data-intel-login][aria-disabled="true"]{opacity:.72;cursor:help}
 `;
 document.head.appendChild(style);
}
function enhance(){
 installStyles();
 renderDialogStatus();
 renderIntelligenceStatus();
}
function scheduleEnhance(){
 if(scheduled)return;
 scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;enhance();});
}
function showBlockedStatus(){
 const message=providerStatus?.description||'O login com GitHub ainda precisa ser habilitado no Supabase Auth.';
 sessionStorage.setItem(AUTH_ERROR_KEY,message);
 window.EvoraSupabase?.open?.();
 scheduleEnhance();
}

document.addEventListener('click',event=>{
 const trigger=event.target.closest?.('[data-cloud-github],[data-intel-login]');
 if(!trigger)return;
 if(providerStatus?.enabled)return;
 event.preventDefault();
 event.stopImmediatePropagation();
 if(providerStatus){showBlockedStatus();return;}
 loadStatus().then(status=>{
  if(status.enabled)window.EvoraGitHubAuth?.signIn?.();
  else showBlockedStatus();
 });
},true);

const observer=new MutationObserver(scheduleEnhance);
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('evora:supabase-status',scheduleEnhance);
window.addEventListener('hashchange',scheduleEnhance);
window.EvoraGitHubProvider={get status(){return providerStatus;},refresh:()=>loadStatus(true)};
loadStatus();
scheduleEnhance();
})();
