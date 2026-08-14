// Campaign Control Cloud — Meta ad account binding fallback.
// Loaded after app.js. Uses the saved Marketing API credential from the backend;
// never exposes the token to the browser.
const META_ACCOUNT_BIND_API=`${SUPABASE_URL}/functions/v1/campaign-control-meta-account`;
const EVORA_DEFAULT_AD_ACCOUNT='act_1648254472526653';

async function bindMetaAdAccount(adAccountId){
  if(!session) throw new Error('Sem sessão');
  const id=String(adAccountId||'').trim();
  if(!id) throw new Error('Informe o ID da conta de anúncios.');
  const r=await fetch(META_ACCOUNT_BIND_API,{
    method:'POST',
    headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
    body:JSON.stringify({ad_account_id:id})
  });
  let j={}; try{j=await r.json()}catch{}
  if(!r.ok) throw new Error(j.detail||j.error||`Falha ao validar conta (${r.status})`);
  return j;
}

function renderManualAdAccountFallback(message=''){
  const host=document.querySelector('#metaDetected');
  if(!host) return;
  const box=document.createElement('div');
  box.id='metaManualAdFallback';
  box.className='card';
  box.style.marginTop='14px';
  box.innerHTML=`
    <div class="section-title">Vincular conta de anúncios diretamente</div>
    <p class="muted">A Meta não listou a conta pela descoberta automática. O Campaign Control pode validar o ID diretamente usando a credencial de Marketing salva.</p>
    ${message?`<p class="error">${esc(message)}</p>`:''}
    <div class="toolbar">
      <input id="metaDirectAdId" value="${EVORA_DEFAULT_AD_ACCOUNT}" placeholder="act_123456789" style="min-width:280px" />
      <button id="metaDirectBind" class="primary">Validar e vincular conta</button>
    </div>
    <div id="metaDirectMsg" class="muted"></div>`;
  host.appendChild(box);
  document.querySelector('#metaDirectBind').onclick=async()=>{
    const btn=document.querySelector('#metaDirectBind'),msg=document.querySelector('#metaDirectMsg');
    btn.disabled=true; msg.textContent='Validando a conta diretamente na Meta…'; msg.className='muted';
    try{
      const d=await bindMetaAdAccount(document.querySelector('#metaDirectAdId').value);
      msg.innerHTML=`<strong>Conta validada e vinculada:</strong> ${esc(d.ad_account?.name||d.ad_account?.id||'Conta Meta')} · ${esc(d.ad_account?.id||'')}`;
      msg.className='muted';
      metaCurrentConnection=d.connection||metaCurrentConnection;
      setTimeout(renderConnections,700);
    }catch(e){msg.textContent=e.message;msg.className='error';btn.disabled=false;}
  };
}

// Replace the previous loader. If discovery returns zero ad accounts, validate the known
// Évora ad account directly. It is only persisted after the Meta Graph API confirms access.
loadSavedMetaAssets=async function(){
  const msg=document.querySelector('#metaSetupMsg');
  if(!metaHasSavedMarketingToken) return;
  msg.textContent='Carregando Página, Business e contas de anúncios salvas…';
  msg.className='muted';
  try{
    const d=await api('meta-discover-saved');
    if((d.ad_accounts||[]).length){
      renderMetaDiscovery(d);
      msg.textContent=`Conexão carregada automaticamente: ${(d.pages||[]).length} página(s), ${(d.businesses||[]).length} Business(es) e ${(d.ad_accounts||[]).length} conta(s) de anúncios.`;
      msg.className='muted';
      return;
    }

    msg.textContent='A listagem automática da Meta retornou 0 contas. Validando diretamente a conta da Évora…';
    try{
      const bound=await bindMetaAdAccount(EVORA_DEFAULT_AD_ACCOUNT);
      const ad=bound.ad_account;
      d.ad_accounts=[{...ad,source:'direct_validation'}];
      metaCurrentConnection=bound.connection||metaCurrentConnection;
      renderMetaDiscovery(d);
      const select=document.querySelector('#metaAdSelect');
      if(select&&ad?.id) select.value=ad.id;
      msg.innerHTML=`<strong>Conta encontrada por validação direta:</strong> ${esc(ad?.name||'Évora ADS 01')} · ${esc(ad?.id||EVORA_DEFAULT_AD_ACCOUNT)}. A conexão foi atualizada.`;
      msg.className='muted';
      return;
    }catch(directError){
      renderMetaDiscovery(d);
      msg.textContent='A Meta não devolveu contas pela listagem automática. Use a validação direta abaixo.';
      msg.className='error';
      renderManualAdAccountFallback(directError.message);
    }
  }catch(e){
    msg.textContent=e.message;
    msg.className='error';
    const host=document.querySelector('#metaDetected');
    if(host) renderManualAdAccountFallback(e.message);
  }
};
