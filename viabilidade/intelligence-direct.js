/* Évora Viabilidade · Arisa direct OpenAI client v2. No user login required. */
(function(){
'use strict';
if(window.__evoraIntelligenceDirect)return;
window.__evoraIntelligenceDirect=true;
const E=window.EvoraEngine,ROOT=document.getElementById('app');
if(!E||!ROOT)return;
const STORE='evora.viabilidade.v1',HISTORY='evora.intelligence.direct.v2.';
const states=new Map();let scheduled=false,service={ready:null,model:'',error:''};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=v=>JSON.parse(JSON.stringify(v));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const clamp=v=>Math.max(0,Math.min(1,num(v)));
const fmt=(v,d=0)=>num(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const money=v=>{const n=num(v),a=Math.abs(n);return (n<0?'−':'')+'R$ '+(a>=1e6?fmt(a/1e6,1)+' mi':fmt(a,0));};
const pct=v=>fmt(v,1)+'%';
const now=()=>new Date().toISOString();
const quick=[
 ['diagnosis','Diagnóstico executivo','Saúde, liquidez, rentabilidade e riscos.','Faça um diagnóstico executivo do empreendimento: principais riscos, pontos fortes e prioridade de gestão. Diferencie os resultados calculados das hipóteses.'],
 ['funding','Reduzir funding','Carteira, entrada, vendas e cronograma.','Como reduzir a necessidade máxima de funding deste empreendimento? Compare antecipação de recebimentos, entrada, velocidade de vendas e cronograma; quantifique apenas cenários efetivamente calculados.'],
 ['sales','Preço × velocidade','Compare as 25 combinações calculadas.','Compare a matriz de preço e velocidade de vendas. Indique o melhor equilíbrio entre retorno e liquidez entre os cenários calculados e explique a validação comercial necessária.'],
 ['stages','Etapas da obra','Sequência, sobreposição e desembolsos.','Analise as etapas e proponha uma sequência de execução para reduzir a exposição. Identifique dependências e compromissos que precisam ser verificados. Não invente impacto financeiro de mudanças ainda não simuladas.'],
 ['land','Terreno e parceria','Valor nominal, VPL e peso no VGV.','Analise o peso econômico do terreno com e sem TMA e proponha alternativas negociais a simular, sem confundir permuta nominal com valor presente.'],
 ['decision','Melhor solução','Recomendação e plano de ação.','Proponha a direção mais equilibrada entre os cenários analisados. Compare VPL, funding, score e riscos; indique mudanças exatas a simular, contrapartidas e plano de ação. Não afirme ótimo global.']
];
function parse(text,fallback){try{return JSON.parse(text);}catch{return fallback;}}
function active(){
 try{const lib=parse(localStorage.getItem(STORE),null);if(lib?.projects?.length)return lib.projects.find(p=>p.id===lib.active)||lib.projects[0];}catch{}
 return {id:'demo',params:clone(E.defaults),actuals:{sales:{},work:{},plan:null},updated:'demo'};
}
function stateFor(id){
 if(!states.has(id)){
  let messages=[];try{messages=parse(localStorage.getItem(HISTORY+id),[])||[];}catch{}
  messages=Array.isArray(messages)?messages.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string').slice(-60):[];
  states.set(id,{messages,busy:false,error:'',snapshot:null,key:'',result:null,revision:0,historyWarning:''});
 }
 return states.get(id);
}
function saveHistory(id,s){try{localStorage.setItem(HISTORY+id,JSON.stringify(s.messages.slice(-60)));s.historyWarning='';}catch{s.historyWarning='O navegador não permitiu salvar a conversa. O estudo original não foi alterado.';}}
function signature(project){return project.id+'|'+JSON.stringify(project.params)+'|'+JSON.stringify(project.actuals||{})+'|'+String(project.updated||'');}
function dataFor(project){const s=stateFor(project.id),key=signature(project);if(s.key!==key){s.result=E.simulate(project.params,true);s.key=key;s.snapshot=null;}return {state:s,result:s.result};}
function funding(result){
 let finance=0,best={value:0,month:0,operatingBalance:0,financeCost:0},peakDebt=0;
 for(const r of result.rows){finance+=num(r.interest)+num(r.fee);const value=Math.max(0,finance-num(r.cumulative));if(value>best.value)best={value,month:r.t,operatingBalance:num(r.cumulative),financeCost:finance};peakDebt=Math.max(peakDebt,num(r.debt));}
 const end=result.rows[result.totals.workEnd]||{};
 return {...best,peakDebt,debtAtDelivery:num(end.debt),additionalFunding:num(result.totals.extra),totalDraw:num(result.totals.draw),totalRepay:num(result.totals.repay)};
}
function health(result){
 const t=result.totals,work=Math.max(1,num(t.work)),f=funding(result);
 const dimensions=[['Rentabilidade',25,25*clamp(num(t.vpl)/Math.max(1,num(t.vgv))/.15)],['Cobertura da obra',20,20*clamp(num(t.coverage)/100)],['Liquidez e exposição',20,20*(1-clamp(num(t.peak)/work))],['Absorção comercial',15,15*clamp(num(t.soldAtCompletion)/Math.max(1,num(t.qty)))],['Dívida na entrega',10,10*(1-(f.peakDebt?clamp(f.debtAtDelivery/f.peakDebt):0))],['Funding não coberto',10,10*(1-clamp(num(t.extra)/(work*.25)))]];
 let score=Math.round(dimensions.reduce((a,x)=>a+x[2],0));if(t.vpl<0)score=Math.min(score,49);if(t.extra>1)score=Math.min(score,69);
 return {score,classification:score>=80?'Forte':score>=65?'Estável':score>=50?'Atenção':'Crítica',tone:score>=80?'strong':score>=65?'stable':score>=50?'attention':'critical',dimensions:dimensions.map(([label,max,score])=>({label,max,score})),method:'Heurística interna não validada como rating. VPL negativo limita a 49; funding adicional não coberto limita a 69.'};
}
function timeline(result){
 const t=result.totals,months=[0,6,12,24,36,t.workEnd,t.peakMonth,t.lastSale,t.horizon];
 return [...new Set(months.filter(m=>m>=0&&m<result.rows.length))].sort((a,b)=>a-b).map(m=>{const r=result.rows[m];return {month:m,receipts:num(r.received),cumulativeReceipts:num(r.cumReceived),portfolioNet:num(r.cumPortfolioNet),cashForWork:num(r.cumCashForWork),work:num(r.cumWork),operatingBalance:num(r.cumulative),debt:num(r.debt),cash:num(r.bank),unitsSold:num(r.cumUnits)};});
}
function compact(result){const t=result.totals;return {vpl:num(t.vpl),vgv:num(t.vgv),work:num(t.work),receipts:num(t.receipts),operatingPeak:num(t.peak),operatingPeakMonth:t.peakMonth,fundingMaximum:funding(result).value,additionalFunding:num(t.extra),coverageCapacityPct:num(t.coverage),workEnd:t.workEnd,lastSale:t.lastSale,score:health(result).score};}
function stages(result){
 const p=result.p,list=result.stages?.length?result.stages:[{name:'Implantação',budget:p.work,start:p.workStart,duration:p.duration,end:result.totals.workEnd,contingency:p.contingency,curve:p.curve,nominalTotal:result.totals.work}];
 const base=list.reduce((a,s)=>a+num(s.budget),0);
 return list.map(s=>({name:s.name,budget:s.budget,share:base?num(s.budget)/base*100:0,start:s.start,end:s.end??(s.start+s.duration-1),duration:s.duration,contingency:s.contingency,curve:s.curve,nominalTotal:s.nominalTotal}));
}
function actualsSummary(project,result){
 const a=project.actuals||{},sales=Object.entries(a.sales||{}).map(([m,v])=>[Number(m),Number(v)]).filter(([m,v])=>Number.isInteger(m)&&m>=0&&Number.isFinite(v)),work=Object.entries(a.work||{}).map(([m,v])=>[Number(m),Number(v)]).filter(([m,v])=>Number.isInteger(m)&&m>=0&&Number.isFinite(v));
 let plan=result,baseline='Premissas atuais';if(a.plan?.params){try{plan=E.simulate(a.plan.params,true);baseline='Baseline congelado em '+a.plan.savedAt;}catch{baseline='Baseline inválido; comparação usa premissas atuais';}}
 const sm=sales.length?Math.max(...sales.map(x=>x[0])):null,wm=work.length?Math.max(...work.map(x=>x[0])):null;
 return {available:sm!==null||wm!==null,baseline,salesLastMonth:sm,salesActual:sales.reduce((n,x)=>n+x[1],0),salesPlanned:sm===null?null:num(plan.rows[Math.min(sm,plan.rows.length-1)]?.cumUnits),workLastMonth:wm,workActual:work.reduce((n,x)=>n+x[1],0),workPlanned:wm===null?null:plan.workWeights.reduce((n,w,i)=>i+plan.p.workStart<=wm?n+w*100:n,0),note:'Meses não preenchidos são ausência de informação, não confirmação de zero.'};
}
function snapshotFor(project){
 const {state:s,result}=dataFor(project);if(s.snapshot)return s.snapshot;
 const p=result.p,t=result.totals,capacity=Math.max(0,num(t.cashForWorkAtCompletion)),absorbed=Math.min(num(t.work),capacity);
 const scenarios=E.scenarios(p).map(x=>x.error?{name:x.name,error:x.error}:{name:x.name,description:x.description,...compact(x.result)});
 const sensitivity=[];for(const speedDelta of [-30,-15,0,15,30])for(const priceDelta of [-10,-5,0,5,10]){try{const r=E.simulate({...p,price:p.price*(1+priceDelta/100),speed:p.speed*(1+speedDelta/100)},true);sensitivity.push({priceDelta,speedDelta,price:r.p.price,speed:r.p.speed,...compact(r)});}catch(e){sensitivity.push({priceDelta,speedDelta,error:e.message});}}
 s.snapshot={schemaVersion:2,source:'Premissas e cálculos deste navegador; não auditados',engineVersion:E.version,generatedAt:now(),project:{id:project.id,name:p.name,city:p.city,updatedAt:project.updated},premises:p,indicators:compact(result),health:health(result),funding:funding(result),land:{nominal:num(t.land),vpl:num(t.landVpl),tma:p.tma,nominalPctVgv:t.vgv?t.land/t.vgv*100:0,vplPctVgv:t.vgv?t.landVpl/t.vgv*100:0},portfolio:{receiptsAtDelivery:num(t.receivedAtCompletion),netAtDelivery:num(t.portfolioNetAtCompletion),cashForWorkAtDelivery:num(t.cashForWorkAtCompletion),absorbableContribution:absorbed,contributionPct:t.work?absorbed/t.work*100:0,surplus:Math.max(0,capacity-t.work),uncovered:Math.max(0,t.work-absorbed),futureReceipts:num(t.futureReceipts),futureReceiptsPV:num(t.pvFuture)},workStages:stages(result),timeline:timeline(result),scenarios,sensitivity,actuals:actualsSummary(project,result),warnings:result.warnings};
 return s.snapshot;
}
function markdown(text){
 const bold=s=>esc(s).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
 return String(text||'').split('\n').map(line=>/^#{1,3} /.test(line)?'<h3>'+bold(line.replace(/^#{1,3} /,''))+'</h3>':/^[*-] /.test(line)?'<p>• '+bold(line.slice(2))+'</p>':line.trim()?'<p>'+bold(line)+'</p>':'<br>').join('');
}
function ensureNav(){
 const nav=document.querySelector('.nav');if(!nav)return;
 let button=nav.querySelector('[data-intelligence-nav]');
 if(!button){button=document.createElement('button');button.type='button';button.className='intelligence-nav';button.dataset.intelligenceNav='1';button.innerHTML='<svg class="intelligence-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5h16v14z M8 15V9 M12 15V7 M16 15v-4"/></svg>Inteligência<span class="index">IA</span>';button.addEventListener('click',()=>{if(location.hash==='#intelligence')render(true);else location.hash='intelligence';document.getElementById('sidebar')?.classList.remove('open');});nav.prepend(button);}
 const on=location.hash==='#intelligence';button.classList.toggle('active',on);if(on){button.setAttribute('aria-current','page');nav.querySelectorAll('[data-page]').forEach(b=>{b.classList.remove('active');b.removeAttribute('aria-current');});}else button.removeAttribute('aria-current');
}
function render(force=false){
 ensureNav();if(location.hash!=='#intelligence')return;
 const project=active(),main=document.querySelector('main.content');if(!main)return;
 let result,s;try{({result,state:s}=dataFor(project));}catch(e){main.innerHTML='<div class="error-banner"><strong>Revise as premissas deste empreendimento.</strong> '+esc(e.message)+'</div>';return;}
 const sig=s.key+'|'+s.revision+'|'+s.busy+'|'+s.error+'|'+service.ready;
 if(!force&&main.querySelector('.intel-page')&&main.dataset.intelligenceDirect===sig)return;
 main.dataset.intelligenceDirect=sig;
 const h=health(result),f=funding(result),t=result.totals,workStages=stages(result);
 const crumb=document.querySelector('.breadcrumb b');if(crumb)crumb.textContent='Inteligência';
 const messages=s.messages.length?s.messages.map(m=>'<article class="intel-message '+m.role+'"><div class="intel-avatar">'+(m.role==='assistant'?'A':'EU')+'</div><div class="intel-bubble"><div class="intel-markdown">'+markdown(m.content)+'</div><div class="intel-message-meta">'+esc(m.role==='assistant'?(m.model||'OpenAI'):'Você')+' · '+esc(new Date(m.createdAt||Date.now()).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}))+'</div></div></article>').join(''):'<div class="intel-empty"><div class="intel-empty-mark">A</div><h3>Analise o negócio. Sem barreiras.</h3><p>Escolha uma análise ou escreva sua pergunta. A Arisa utiliza as premissas e os cenários do empreendimento selecionado, sem exigir login.</p></div>';
 main.innerHTML='<div class="intel-page"><header class="intel-heading"><div><div class="eyebrow">Évora · inteligência estratégica</div><h1>Inteligência</h1><p class="subtitle">Arisa · análise de cenários com a API OpenAI existente da Évora.</p></div><div class="intel-heading-actions"><button class="button" data-direct-refresh>Atualizar contexto</button></div></header>'+
 '<section class="intel-agent-hero"><div class="intel-agent-orb"><strong>A</strong></div><div class="intel-agent-copy"><span>ARISA INTELLIGENCE</span><h2>'+esc(project.params.name)+'</h2><p>Carteira, funding, preço, velocidade e '+workStages.length+' etapa(s) de obra.</p></div><div class="intel-agent-status"><div class="intel-status-pill '+(s.busy?'loading':service.ready===false?'error':'ready')+'">'+(s.busy?'Analisando cenário':service.ready===false?'Conexão indisponível':'Acesso sem login')+'</div><b>OpenAI · conexão no servidor</b><small>A chave nunca é enviada ao navegador.</small></div></section>'+
 '<div class="intel-kpis"><div class="intel-kpi '+h.tone+'"><span>Score de saúde</span><strong>'+h.score+' · '+h.classification+'</strong><small>Indicador interno de triagem</small></div><div class="intel-kpi"><span>VPL do empreendimento</span><strong>'+money(t.vpl)+'</strong><small>TMA '+pct(result.p.tma)+' a.a.</small></div><div class="intel-kpi"><span>Funding máximo</span><strong>'+money(f.value)+'</strong><small>Pico em M'+f.month+'</small></div><div class="intel-kpi"><span>Obra nominal</span><strong>'+money(t.work)+'</strong><small>Entrega em M'+t.workEnd+'</small></div><div class="intel-kpi"><span>Terreno em VPL</span><strong>'+money(t.landVpl)+'</strong><small>Sem TMA: '+money(t.land)+'</small></div></div>'+
 '<div class="intel-layout"><section class="intel-chat-panel"><div class="intel-chat-head"><div><h2>Análise e recomendações</h2><p>Conversa separada por empreendimento, salva neste navegador.</p></div><div class="intel-chat-tools">'+(s.messages.length?'<button class="button small" data-direct-export>Exportar conversa</button><button class="button small danger" data-direct-clear>Limpar conversa</button>':'')+'</div></div><div class="intel-quick-prompts">'+quick.map(q=>'<button type="button" class="intel-quick-prompt" data-direct-prompt="'+q[0]+'" '+(s.busy?'disabled':'')+'><strong>'+q[1]+'</strong><span>'+q[2]+'</span></button>').join('')+'</div><div class="intel-messages" data-intel-messages>'+messages+(s.busy?'<article class="intel-message assistant"><div class="intel-avatar">A</div><div class="intel-bubble"><div class="intel-thinking"><i></i><i></i><i></i><span>Comparando os cenários deste empreendimento…</span></div></div></article>':'')+'</div>'+
 (s.error?'<div class="intel-error" role="alert">'+esc(s.error)+'</div>':'')+(s.historyWarning?'<p class="intel-error">'+esc(s.historyWarning)+'</p>':'')+
 '<div class="intel-composer"><form data-direct-form><textarea name="prompt" required maxlength="5000" aria-label="Pergunta para a Arisa" placeholder="Como reduzir o funding sem baixar o preço do lote?" '+(s.busy?'disabled':'')+'></textarea><button class="button primary intel-send" type="submit" '+(s.busy?'disabled':'')+'>Analisar</button></form><p class="intel-composer-note">Sem login. Envia somente o contexto do estudo selecionado à OpenAI. Não altera suas premissas. O histórico desta conversa fica neste dispositivo; a sincronização dos estudos em nuvem continua opcional.</p></div></section>'+
 '<aside class="intel-context-panel"><div class="intel-context-head"><h2>Contexto da análise</h2><p>As simulações são recalculadas antes de enviar.</p></div><div class="intel-context-body"><div class="intel-context-group"><span class="intel-context-label">Premissas</span><div class="intel-context-row"><span>VGV</span><b>'+money(t.vgv)+'</b></div><div class="intel-context-row"><span>Preço / m²</span><b>'+money(result.p.price)+'</b></div><div class="intel-context-row"><span>Velocidade de vendas</span><b>'+fmt(result.p.speed,2)+' lotes/mês</b></div><div class="intel-context-row"><span>Entrada / prazo</span><b>'+pct(result.p.entry)+' / '+result.p.term+'x</b></div></div><div class="intel-context-group"><span class="intel-context-label">Etapas</span>'+workStages.map(w=>'<div class="intel-stage"><div class="intel-stage-head"><strong>'+esc(w.name)+'</strong><b>'+pct(w.share)+'</b></div><small>M'+w.start+' a M'+w.end+' · '+money(w.budget)+'</small></div>').join('')+'</div><div class="intel-context-group"><span class="intel-context-label">Comparações</span><p>4 cenários projetados · 25 combinações de preço e velocidade · marcos de 6, 12, 24 e 36 meses · realizado e baseline, quando preenchidos.</p></div></div><div class="intel-context-foot">São hipóteses de viabilidade, não garantia de retorno ou aprovação de crédito.</div></aside></div><footer class="footer"><span>Évora · Arisa · OpenAI direta</span><span>Motor '+esc(E.version)+' · estudos preservados</span></footer></div>';
 requestAnimationFrame(()=>{const box=main.querySelector('[data-intel-messages]');if(box)box.scrollTop=box.scrollHeight;});
}
async function send(prompt){
 const project=clone(active()),text=String(prompt||'').trim(),s=stateFor(project.id);if(!text||s.busy)return;
 s.busy=true;s.error='';s.revision++;render(true);
 await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
 try{
  const snapshot=snapshotFor(project),history=s.messages.slice(-10).map(m=>({role:m.role,content:m.content}));
  s.messages.push({role:'user',content:text,createdAt:now()});saveHistory(project.id,s);s.revision++;render(true);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),115000);
  let response,data;
  try{response=await fetch('/api/intelligence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:project.id,prompt:text,history,snapshot}),signal:controller.signal});data=await response.json().catch(()=>null);}finally{clearTimeout(timer);}
  if(!response.ok)throw new Error(data?.error||'A conexão não respondeu em JSON. Reabra a plataforma pelo link de acesso.');
  if(typeof data?.reply!=='string'||!data.reply.trim())throw new Error('A OpenAI não retornou uma análise.');
  s.messages.push({role:'assistant',content:data.reply+(data.incomplete?'\n\n**A resposta atingiu o limite de geração. Faça uma pergunta mais específica para aprofundar.**':''),createdAt:data.generatedAt||now(),model:data.model,provider:data.provider,snapshotAt:snapshot.generatedAt});
  service.ready=true;service.model=data.model;saveHistory(project.id,s);
 }catch(e){s.error=e.name==='AbortError'?'A análise excedeu o prazo. Tente uma pergunta mais específica.':e.message;}
 finally{s.busy=false;s.revision++;if(active().id===project.id)render(true);}
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;render();});}
// Observe only shell replacement, never the rendered conversation subtree.
new MutationObserver(schedule).observe(ROOT,{childList:true});
window.addEventListener('hashchange',schedule);
window.addEventListener('storage',e=>{if(e.key===STORE)schedule();});
document.addEventListener('click',e=>{
 const el=e.target.closest?.('[data-direct-prompt],[data-direct-refresh],[data-direct-clear],[data-direct-export]');if(!el)return;
 const project=active(),s=stateFor(project.id);
 if(el.dataset.directPrompt){const q=quick.find(q=>q[0]===el.dataset.directPrompt);if(q)send(q[3]);}
 if(el.hasAttribute('data-direct-refresh')){s.key='';s.snapshot=null;s.revision++;render(true);}
 if(el.hasAttribute('data-direct-clear')&&!s.busy&&confirm('Limpar somente a conversa local deste empreendimento? As premissas e os dados na nuvem serão preservados.')){s.messages=[];s.error='';s.revision++;saveHistory(project.id,s);render(true);}
 if(el.hasAttribute('data-direct-export')){const blob=new Blob([JSON.stringify({project:project.params.name,exportedAt:now(),messages:s.messages},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='arisa-analise.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
});
document.addEventListener('submit',e=>{if(!e.target.matches?.('[data-direct-form]'))return;e.preventDefault();const input=e.target.querySelector('textarea');send(input.value);});
document.addEventListener('keydown',e=>{if(e.target.matches?.('[data-direct-form] textarea')&&(e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();e.target.form.requestSubmit();}});
window.EvoraIntelligence={snapshot:()=>snapshotFor(active()),refresh:schedule,version:'2.0-direct'};
fetch('/api/intelligence',{cache:'no-store'}).then(async r=>{const d=await r.json();service={ready:r.ok&&d.ok===true,model:d.model||'',error:d.error||''};schedule();}).catch(()=>{service.ready=false;schedule();});
schedule();
})();
