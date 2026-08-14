// Meta configuration flow mirrored from Évora Campaign Control v4.1.4 desktop.
// The UI behavior intentionally follows the local version: Connect -> discover -> select assets -> save activation.
const META_LOCAL_API=`${SUPABASE_URL}/functions/v1/campaign-control-meta-local`;
let localDiscovery=null, localStatus=null;

async function metaLocalApi(action,body){
  if(!session) throw new Error('Sem sessão');
  const r=await fetch(`${META_LOCAL_API}?action=${encodeURIComponent(action)}`,{
    method:body?'POST':'GET',
    headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
    body:body?JSON.stringify(body):undefined
  });
  let j={};try{j=await r.json()}catch{}
  if(!r.ok)throw new Error(j.detail||j.error||`Falha Meta (${r.status})`);
  return j;
}
function localGranted(perms=[]){return (perms||[]).filter(p=>p.status==='granted').map(p=>p.permission)}
function localOption(text,value,data={}){const o=document.createElement('option');o.value=value;o.textContent=text;Object.entries(data).forEach(([k,v])=>o.dataset[k]=v??'');return o}
function localPopulate(data){
  localDiscovery=data||{};
  const accounts=$('#localAdSelect'),pages=$('#localPageSelect'),phones=$('#localPhoneSelect');
  accounts.innerHTML='<option value="">Selecione</option>';
  (data.ad_accounts||[]).forEach(a=>accounts.appendChild(localOption(`${a.name||'Sem nome'} · act_${a.account_id||String(a.id||'').replace('act_','')} · ${a.currency||''}`,a.account_id||String(a.id||'').replace('act_',''),{name:a.name||''})));
  pages.innerHTML='<option value="">Selecione</option>';
  (data.pages||[]).forEach(p=>pages.appendChild(localOption(`${p.name||'Sem nome'} · ${p.id}`,p.id,{name:p.name||'',instagram:p.instagram_business_account?.id||''})));
  phones.innerHTML='<option value="">Selecione ou informe manualmente</option>';
  (data.phones||[]).forEach(p=>phones.appendChild(localOption(`${p.verified_name||'WhatsApp'} · ${p.display_phone_number||p.id}`,p.id,{number:String(p.display_phone_number||'').replace(/\D/g,''),name:`${p.verified_name||''} ${p.display_phone_number||''}`.trim()})));

  const c=localStatus?.connection;
  const savedAd=String(c?.ad_account_id||'').replace(/^act_/,'');
  if(savedAd){if(![...accounts.options].some(o=>o.value===savedAd))accounts.appendChild(localOption(`${c?.metadata?.ad_account_name||'Conta salva'} · act_${savedAd}`,savedAd,{name:c?.metadata?.ad_account_name||''}));accounts.value=savedAd;$('#localAdID').value=savedAd;$('#localAdName').value=c?.metadata?.ad_account_name||''}
  if(c?.page_id){if(![...pages.options].some(o=>o.value===c.page_id))pages.appendChild(localOption(`${c.page_name||'Página salva'} · ${c.page_id}`,c.page_id,{name:c.page_name||'',instagram:c?.metadata?.instagram_actor_id||''}));pages.value=c.page_id;$('#localPageID').value=c.page_id;$('#localInstagramID').value=c?.metadata?.instagram_actor_id||''}
  const savedPhone=c?.metadata?.whatsapp_phone_number_id||'';if(savedPhone){if(![...phones.options].some(o=>o.value===savedPhone))phones.appendChild(localOption(`${c?.metadata?.whatsapp_display_name||'WhatsApp salvo'} · ${c?.metadata?.whatsapp_number||savedPhone}`,savedPhone,{number:String(c?.metadata?.whatsapp_number||'').replace(/\D/g,''),name:c?.metadata?.whatsapp_display_name||''}));phones.value=savedPhone;$('#localPhoneID').value=savedPhone;$('#localWhatsApp').value=String(c?.metadata?.whatsapp_number||'').replace(/\D/g,'')}

  if(!accounts.value&&accounts.options.length===2){accounts.selectedIndex=1;accounts.dispatchEvent(new Event('change'))}
  if(!pages.value&&pages.options.length===2){pages.selectedIndex=1;pages.dispatchEvent(new Event('change'))}
  if(!phones.value&&phones.options.length===2){phones.selectedIndex=1;phones.dispatchEvent(new Event('change'))}
  const granted=localGranted(data.permissions||[]),warn=granted.includes('ads_management')?'':' A permissão ads_management não apareceu entre as permissões concedidas.';
  $('#localSetupInfo').textContent=`${(data.ad_accounts||[]).length} conta(s), ${(data.pages||[]).length} Página(s) e ${(data.phones||[]).length} número(s) de WhatsApp encontrados.${warn}`;
  $('#localConnectStatus').textContent='Conectado como '+(data.identity?.name||data.identity?.id||'usuário Meta');
  $('#localConnectStatus').className='inline-status ok';
}

async function localConnect(){
  const btn=$('#localConnectBtn');btn.disabled=true;$('#localSetupError').textContent='';$('#localSetupInfo').textContent='Conectando e descobrindo os ativos…';
  try{
    const d=await metaLocalApi('discover',{api_version:$('#localApiVersion').value,access_token:$('#localToken').value,app_secret:$('#localAppSecret').value});
    localPopulate(d);
  }catch(e){$('#localSetupError').textContent=e.message;$('#localConnectStatus').textContent='Falha na conexão';$('#localConnectStatus').className='inline-status'}finally{btn.disabled=false}
}
async function localSave(){
  const ad=$('#localAdID').value.trim(),page=$('#localPageID').value.trim();if(!ad||!page){$('#localSetupError').textContent='Selecione a conta de anúncios e a Página.';return}
  const btn=$('#localSaveBtn');btn.disabled=true;$('#localSetupError').textContent='';$('#localSaveSuccess').textContent='Validando os ativos e salvando…';
  try{
    const d=await metaLocalApi('save',{api_version:$('#localApiVersion').value,access_token:$('#localToken').value,app_secret:$('#localAppSecret').value,app_id:$('#localAppID').value,ad_account_id:ad,ad_account_name:$('#localAdName').value,page_id:page,page_name:$('#localPageName').value,instagram_actor_id:$('#localInstagramID').value,whatsapp_number:$('#localWhatsApp').value,whatsapp_phone_number_id:$('#localPhoneID').value});
    $('#localToken').value='';$('#localAppSecret').value='';$('#localSaveSuccess').textContent=`Ativação validada e salva. Conta: ${d.account?.name||'Meta'} · Página: ${d.page?.name||page}.`;
    setTimeout(renderConnections,700);
  }catch(e){$('#localSetupError').textContent=e.message;$('#localSaveSuccess').textContent=''}finally{btn.disabled=false}
}

openMetaSetup=async function(){
  title('Ativação administrativa');
  try{localStatus=await metaLocalApi('status')}catch{localStatus={connection:null,token_configured:false,api_version:'v25.0'}}
  const c=localStatus?.connection,m=c?.metadata||{},savedAd=String(c?.ad_account_id||'').replace(/^act_/,'');
  $('#content').innerHTML=`<div class="card"><div class="section-title">1. Conectar e descobrir os ativos</div><p class="muted">Mesmo fluxo da versão local v4.1.4. O token salvo pode ser reutilizado; deixe o campo vazio para manter a credencial existente.</p><div class="grid two"><label>Versão da API<input id="localApiVersion" value="${esc(localStatus?.api_version||m.api_version||'v25.0')}"></label><label>App Secret <span class="muted">(opcional)</span><input id="localAppSecret" type="password" autocomplete="off" placeholder="Deixe vazio quando não for exigido"></label></div><label style="display:block;margin-top:12px">Token de acesso<input id="localToken" type="password" autocomplete="off" placeholder="${localStatus?.token_configured?'Token salvo no Vault. Deixe vazio para manter.':'Cole um token com ads_management'}"></label><div class="toolbar" style="margin-top:16px"><button id="localConnectBtn" class="primary">Conectar à Meta</button><span id="localConnectStatus" class="inline-status"></span></div><div id="localSetupError" class="error"></div><div id="localSetupInfo" class="muted"></div></div>
  <div class="card" style="margin-top:16px"><div class="section-title">2. Escolher a operação</div><div class="grid two"><div><label>Conta de anúncios<select id="localAdSelect"><option value="">Selecione</option>${savedAd?`<option value="${esc(savedAd)}" selected>${esc(m.ad_account_name||'Conta salva')} · act_${esc(savedAd)} · ${esc(m.ad_account_currency||'')}</option>`:''}</select></label><input id="localAdID" type="hidden" value="${esc(savedAd)}"><input id="localAdName" type="hidden" value="${esc(m.ad_account_name||'')}"></div><div><label>Página<select id="localPageSelect"><option value="">Selecione</option>${c?.page_id?`<option value="${esc(c.page_id)}" selected>${esc(c.page_name||'Página salva')} · ${esc(c.page_id)}</option>`:''}</select></label><input id="localPageID" type="hidden" value="${esc(c?.page_id||'')}"><input id="localPageName" type="hidden" value="${esc(c?.page_name||'')}"><input id="localInstagramID" type="hidden" value="${esc(m.instagram_actor_id||'')}"></div></div><div class="grid two" style="margin-top:12px"><label>WhatsApp Business<select id="localPhoneSelect"><option value="">Selecione ou informe manualmente</option>${m.whatsapp_phone_number_id?`<option value="${esc(m.whatsapp_phone_number_id)}" selected>${esc(m.whatsapp_display_name||'WhatsApp salvo')} · ${esc(m.whatsapp_number||m.whatsapp_phone_number_id)}</option>`:''}</select></label><label>WhatsApp com DDI/DDD<input id="localWhatsApp" value="${esc(String(m.whatsapp_number||'').replace(/\D/g,''))}" placeholder="5534..."></label></div><input id="localPhoneID" type="hidden" value="${esc(m.whatsapp_phone_number_id||'')}"><input id="localAppID" type="hidden" value="${esc(c?.app_id||'1296933085661158')}"><div class="toolbar" style="margin-top:16px"><button id="localSaveBtn" class="primary">Salvar ativação</button><button id="localCancelBtn" class="secondary">Cancelar</button></div><div id="localSaveSuccess" class="muted"></div></div>`;
  $('#localConnectBtn').onclick=localConnect;$('#localSaveBtn').onclick=localSave;$('#localCancelBtn').onclick=renderConnections;
  $('#localAdSelect').onchange=e=>{const o=e.target.selectedOptions[0];if(o&&o.value){$('#localAdID').value=o.value;$('#localAdName').value=o.dataset.name||''}};
  $('#localPageSelect').onchange=e=>{const o=e.target.selectedOptions[0];if(o&&o.value){$('#localPageID').value=o.value;$('#localPageName').value=o.dataset.name||'';$('#localInstagramID').value=o.dataset.instagram||''}};
  $('#localPhoneSelect').onchange=e=>{const o=e.target.selectedOptions[0];if(o&&o.value){$('#localPhoneID').value=o.value;if(o.dataset.number)$('#localWhatsApp').value=o.dataset.number}};
};
