/* Buyer plans editor. Idempotent DOM enhancement; no login or database policy changes. */
(function(){
'use strict';
const E=window.EvoraEngine,H=E?.buyerPlans,ROOT=document.getElementById('app');
if(!H||!ROOT||window.__buyerPlansUI)return;window.__buyerPlansUI=true;
const STORE='evora.viabilidade.v1',drafts=new Map();let pending=false,committing=false,cacheKey='',cache=null,selected='',all=false;
const originalSimulate=E.simulate;
E.simulate=function(input,light=false){
 const r=originalSimulate(input,light);
 if(r.paymentPlans)r.p.buyerPlanSummary=r.paymentPlans.map(x=>({name:x.name,share:x.share,type:x.type,system:x.system,term:x.term,interest:x.interest,sacocFrequency:x.sacocFrequency,sacocAnnualRate:x.sacocAnnualRate,index:x.index,correction:x.correction,unitPrice:x.unitPrice,expectedEquivalentLots:x.units,firstRegular:x.contract.first,...x.totals}));
 return r;
};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=2)=>Number.isFinite(Number(n))?Number(n).toLocaleString('pt-BR',{maximumFractionDigits:d}):'—';
const money=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
const clone=H.copy;
const hints={name:'Identificação livre. Ex.: Acesso, Equilíbrio ou Investidor.',type:'À vista recebe tudo na venda; parcelado utiliza as condições abaixo.',share:'Percentual estimado dos compradores em cada grupo mensal de vendas. Todos os planos somam 100%.',discount:'Desconto adicional ao desconto global. Ex.: 10% global e 5% aqui resultam em 14,5% total.',entry:'Percentual do preço final do lote pago como entrada.',entryMonths:'Parcelas da entrada, desde o mês da venda, sem juros ou correção nesta modelagem.',term:'Número de prestações mensais após terminar a entrada. Não inclui as parcelas da entrada.',interest:'Taxa efetiva mensal. No SACOC mensal, aplicada acumulativamente à cota de principal desde a primeira prestação.',system:'Price: prestação-base constante. SAC: amortização-base constante. SACOC: cotas de principal com crescimento acumulativo, conforme periodicidade configurada.',sacocFrequency:'Blocos anuais: primeiras 12 cotas-base sem acréscimo remuneratório; 13ª a 24ª com um acréscimo anual. Mensal: crescimento desde a primeira prestação. Correção monetária independente.',sacocAnnualRate:'Taxa acumulada a cada bloco de 12 prestações. Não se soma aos juros mensais, que são ignorados neste modo. Confira a convenção com o contrato.',index:'Índice usado apenas neste plano. Não combina TR e IPCA.',correction:'Hipótese anual de correção, não taxa atual consultada no mercado.',indexFrequency:'Reajuste mensal ou por blocos de 12 vencimentos.',balloon:'Percentual total do preço nos balões; não é o percentual de cada balão. No SACOC, a cota-base do balão também recebe a evolução configurada.',balloons:'Balões anuais: primeiro no 12º vencimento após a entrada. Devem caber no prazo.'};
const labels={name:'Nome do plano',type:'Forma de pagamento',share:'Participação nas vendas (%)',discount:'Desconto adicional (%)',entry:'Entrada total (%)',entryMonths:'Parcelas da entrada',term:'Parcelas após a entrada',interest:'Juros / evolução (% a.m.)',system:'Amortização',sacocFrequency:'Evolução das cotas SACOC',sacocAnnualRate:'Evolução SACOC (% a.a.)',index:'Indexador',correction:'Correção projetada (% a.a.)',indexFrequency:'Reajuste',balloon:'Total-base em balões (%)',balloons:'Quantidade de balões anuais'};
const options={type:[['installments','Parcelado'],['cash','À vista']],system:[['PRICE','Price'],['SAC','SAC'],['SACOC','SACOC · cotas crescentes']],sacocFrequency:[[12,'Blocos anuais · 12 prestações'],[1,'Mensal · desde a 1ª prestação']],index:[['TR','TR'],['IPCA','IPCA'],['NONE','Sem correção']],indexFrequency:[['monthly','Mensal'],['annual','Anual']]};
function current(){
 let lib;try{lib=JSON.parse(localStorage.getItem(STORE));}catch{}
 const project=lib?.projects?.find(p=>p.id===lib.active)||lib?.projects?.[0]||{id:'demo',params:clone(E.defaults)};
 return {project,params:project.params,config:H.read(project.params.buyerPlansJson)};
}
function result(data){const k=JSON.stringify(data.params);if(k!==cacheKey){cache=E.simulate(data.params,true);cacheKey=k;}return cache;}
function draft(data){
 const source=JSON.stringify(data.config);let d=drafts.get(data.project.id);
 if(!d||(!d.dirty&&d.source!==source)){d={source,config:clone(data.config),dirty:false,revision:0,error:'',notice:''};drafts.set(data.project.id,d);}
 return d;
}
function validate(d,p){try{H.validate(d.config,E.prepare(p));return '';}catch(e){return e.message;}}
function publish(data,config){
 const checked=H.validate(config,E.prepare(data.params));
 let input=document.getElementById('buyer-plans-bridge');
 if(!input){input=document.createElement('input');input.id='buyer-plans-bridge';input.hidden=true;input.dataset.param='buyerPlansJson';document.body.appendChild(input);}
 committing=true;input.value=JSON.stringify(checked);input.dispatchEvent(new Event('change',{bubbles:true}));committing=false;
 drafts.delete(data.project.id);cacheKey='';schedule();
}
function field(plan,i,key){
 const id='buyer-'+i+'-'+key,value=plan[key]??E.defaults[key];let control;
 if(options[key])control='<select id="'+id+'" data-buyer-field="'+key+'" data-plan-index="'+i+'">'+options[key].map(([v,n])=>'<option value="'+v+'" '+(String(value)===String(v)?'selected':'')+'>'+n+'</option>').join('')+'</select>';
 else control='<input id="'+id+'" data-buyer-field="'+key+'" data-plan-index="'+i+'" type="'+(key==='name'?'text':'number')+'" '+(key==='name'?'maxlength="80"':('step="'+(['entryMonths','term','balloons'].includes(key)?'1':'any')+'" inputmode="decimal" min="'+(key==='correction'?-20:0)+'"'))+' value="'+esc(value)+'">';
 return '<label class="buyer-field" for="'+id+'"><span>'+labels[key]+'</span>'+control+'<small>'+hints[key]+'</small></label>';
}
function condition(plan){return plan.system==='SACOC'?E.sacoc.description(plan):plan.system+' · '+fmt(plan.interest,3)+'% a.m.';}
function preview(plan,p){
 try{
  const pp=H.terms(E.prepare(p),plan),price=p.lot*p.price*(1-p.discount/100)*(1-plan.discount/100);
  if(plan.type==='cash')return 'Lote médio: <b>'+money(price)+'</b> · pagamento integral na venda.';
  const c=E.contract(pp,price);
  let text='Lote médio: <b>'+money(price)+'</b> · entrada: <b>'+plan.entryMonths+' × '+money(c.entry/plan.entryMonths)+'</b> · primeira prestação regular: <b>'+money(c.first)+'</b>'+(plan.balloon>0?' · '+plan.balloons+' balões-base de <b>'+money(price*plan.balloon/100/plan.balloons)+'</b>':'')+'.';
  if(plan.system==='SACOC')text+='<br><strong>'+esc(E.sacoc.description(pp))+'</strong> · '+[13,25,pp.term].filter((age,i,a)=>age<=pp.term&&a.indexOf(age)===i).map(age=>age+'ª: <b>'+money(c.schedule[age-1].regular)+'</b>').join(' · ')+'<br>Prestações indicadas incluem a correção hipotética selecionada, sem entrada nem balão. Convenção simulada, não proposta contratual aprovada.';
  return text;
 }catch{return 'Revise as condições para visualizar o plano.';}
}
function card(plan,i,p){
 const regularKeys=['entry','entryMonths','term','system'];
 if(plan.system==='SACOC'){regularKeys.push('sacocFrequency');regularKeys.push((plan.sacocFrequency??12)===12?'sacocAnnualRate':'interest');}else regularKeys.push('interest');
 return '<article class="buyer-card" data-plan-card="'+i+'"><div class="buyer-card-top"><span>PLANO '+String(i+1).padStart(2,'0')+'</span><div><button type="button" class="button small" data-buyer-action="duplicate" data-plan-index="'+i+'">Duplicar</button><button type="button" class="button small danger" data-buyer-action="remove" data-plan-index="'+i+'">Excluir</button></div></div><div class="buyer-fields">'+['name','type','share','discount'].map(k=>field(plan,i,k)).join('')+'</div>'+(plan.type==='installments'?'<div class="buyer-fields">'+regularKeys.map(k=>field(plan,i,k)).join('')+'</div><details class="buyer-advanced"><summary>Correção e balões</summary><div class="buyer-fields">'+['index','correction','indexFrequency','balloon','balloons'].map(k=>field(plan,i,k)).join('')+'</div></details>':'')+'<div class="buyer-preview">'+preview(plan,p)+'</div></article>';
}
function editor(data,d){
 const c=d.config,sum=c.plans.reduce((n,p)=>n+(Number(p.share)||0),0),invalid=validate(d,data.params);
 return '<div class="buyer-heading"><div><span class="eyebrow">CONDIÇÕES COMERCIAIS</span><h3>Planos de pagamento dos compradores</h3><p>Condições diferentes no mesmo empreendimento, consolidadas em uma única carteira.</p></div><div class="buyer-switch"><button type="button" data-buyer-action="single" class="'+(!c.enabled?'active':'')+'">Plano único</button><button type="button" data-buyer-action="multiple" class="'+(c.enabled?'active':'')+'">Vários planos</button></div></div>'+
 (!c.enabled?'<p class="buyer-note">O estudo continua usando o plano abaixo e o percentual à vista da estratégia de vendas. Ao ativar vários planos, essas condições são preservadas automaticamente.</p>':'<div class="buyer-toolbar"><strong data-buyer-total>Soma das participações: '+fmt(sum)+'%</strong><div><button class="button small" data-buyer-action="equal">Distribuir igualmente</button><button class="button small" data-buyer-action="normalize">Ajustar soma para 100%</button><button class="button primary small" data-buyer-action="add" '+(c.plans.length>=12?'disabled':'')+'>+ Adicionar plano</button></div></div><p class="buyer-note">A participação é aplicada a cada mês de venda, inclusive ao lançamento. O plano à vista entra nesta mesma soma de 100%; o antigo percentual à vista não é somado novamente. A quantidade por plano é uma estimativa em lotes equivalentes, não uma alocação de contratos individuais.</p><div class="buyer-cards">'+c.plans.map((p,i)=>card(p,i,data.params)).join('')+'</div><div class="buyer-save"><div><strong data-buyer-state>'+(d.dirty?'Alterações ainda não aplicadas':'Condições aplicadas ao estudo')+'</strong><p data-buyer-error role="status">'+esc(d.error||invalid||d.notice)+'</p></div><div><button class="button" data-buyer-action="reset">Descartar alterações</button><button class="button primary" data-buyer-action="apply" '+(invalid||!d.dirty?'disabled':'')+'>Aplicar planos e recalcular</button></div></div><p class="buyer-note">As simulações por lote não incluem perdas nem atrasos. Os recebimentos consolidados aplicam os riscos globais. Nenhum desconto ou taxa é recomendação comercial automática.</p>');
}
function updateFeedback(data,d){
 const area=document.querySelector('[data-buyer-manager]');if(!area)return;
 const invalid=validate(d,data.params),sum=d.config.plans.reduce((n,p)=>n+(Number(p.share)||0),0);
 const total=area.querySelector('[data-buyer-total]');if(total){total.textContent='Soma das participações: '+fmt(sum)+'%';total.classList.toggle('buyer-invalid',Math.abs(sum-100)>.000001);}
 const status=area.querySelector('[data-buyer-state]');if(status)status.textContent=d.dirty?'Alterações ainda não aplicadas':'Condições aplicadas ao estudo';
 const error=area.querySelector('[data-buyer-error]');if(error)error.textContent=d.error||invalid||d.notice;
 const apply=area.querySelector('[data-buyer-action="apply"]');if(apply)apply.disabled=!!invalid||!d.dirty;
}
function mixTable(r){
 const rows=r.paymentPlans||[];
 return '<div class="table-wrap"><table class="buyer-table"><thead><tr><th>Plano</th><th>Participação</th><th>Preço do lote médio</th><th>Entrada</th><th>Condição</th><th>1ª prestação regular</th><th>Recebido até entrega</th><th>Recebido no ciclo</th></tr></thead><tbody>'+rows.map(x=>'<tr><td><strong>'+esc(x.name)+'</strong><small>'+fmt(x.units,2)+' lotes equivalentes'+(x.share===0?' · fora do mix':'')+'</small></td><td>'+fmt(x.share)+'%</td><td>'+money(x.unitPrice)+'</td><td>'+(x.type==='cash'?'Integral':fmt(x.entry)+'% em '+x.entryMonths+'x')+'</td><td>'+(x.type==='cash'?'À vista':x.term+'x · '+esc(condition(x)))+'<small>'+(x.type==='cash'||x.index==='NONE'?'Sem correção':esc(x.index)+' '+fmt(x.correction)+'% a.a. · '+(x.indexFrequency==='annual'?'anual':'mensal'))+(x.type==='installments'&&x.balloon>0?' · balões: '+fmt(x.balloon)+'% em '+x.balloons+'x':'')+'</small></td><td>'+(x.type==='cash'?'—':money(x.contract.first))+'</td><td>'+money(x.totals.receivedAtCompletion)+'</td><td>'+money(x.totals.receipts)+'</td></tr>').join('')+'</tbody><tfoot><tr><th>Carteira consolidada</th><th>100%</th><td colspan="4">'+r.totals.qty+' lotes · cada venda contada uma vez</td><th>'+money(r.totals.receivedAtCompletion)+'</th><th>'+money(r.totals.receipts)+'</th></tr></tfoot></table></div><p class="buyer-note">Primeira prestação: lote médio no mês-base, após a entrada e antes de riscos de recebimento. Entradas e balões não estão incluídos nesse valor de prestação. Recebimentos incluem remuneração, correção projetada, perdas e atrasos. Entrega: M'+r.totals.workEnd+'.</p>';
}
function amortization(r){
 const plan=r.paymentPlans.find(x=>x.id===selected)||r.paymentPlans.find(x=>x.share>0)||r.paymentPlans[0];selected=plan.id;
 const rows=all?plan.contract.schedule:plan.contract.schedule.slice(0,24),sacoc=plan.system==='SACOC';
 return '<div class="buyer-amort-head"><div><h3>Um lote. Cada plano por dentro.</h3><p>Condições do lote médio na data-base, sem perdas nem atrasos.</p></div><label>Plano<select data-buyer-contract>'+r.paymentPlans.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===plan.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label></div><div class="buyer-preview">'+preview(plan,r.p)+'</div>'+(plan.type==='cash'?'<p class="buyer-note">Não há saldo financiado nem tabela de amortização neste plano.</p>':'<div class="table-wrap"><table><thead><tr><th>Vencimento após entrada</th><th>Parcela regular</th><th>Balão</th><th>'+(sacoc?'Remuneração da cota':'Juros')+'</th><th>'+(sacoc?'Cota-base corrigida':'Amortização')+'</th><th>'+(sacoc?'Saldo-base corrigido':'Saldo corrigido')+'</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+x.age+'º</td><td>'+money(x.regular)+'</td><td>'+money(x.balloon)+'</td><td>'+money(x.interest)+'</td><td>'+money(x.amortization)+'</td><td>'+money(x.balance)+'</td></tr>').join('')+'</tbody></table></div>'+(sacoc?'<p class="buyer-note">No SACOC, a remuneração é calculada sobre a cota deste vencimento, não como juros mensais sobre todo o saldo. O saldo-base corrigido exclui a remuneração das cotas e não é valor de quitação antecipada.</p>':'')+'<button class="button small" data-buyer-action="amort">'+(all?'Mostrar 24 vencimentos':'Mostrar todos os vencimentos')+'</button>');
}
function forms(data,d){
 const source=document.querySelector('[data-param="entry"]'),section=source?.closest('.form-section');if(!section)return;
 const title=section.querySelector('h2');if(title&&!title.dataset.buyerNamed){title.dataset.buyerNamed='1';title.innerHTML='<span class="section-number">03</span>Planos dos compradores';}
 let manager=section.querySelector('[data-buyer-manager]');if(!manager){manager=document.createElement('div');manager.dataset.buyerManager='1';manager.className='buyer-manager';section.insertBefore(manager,section.querySelector('.fields'));}
 const sig=data.project.id+'|'+d.source+'|'+d.revision;
 if(manager.dataset.signature!==sig){manager.dataset.signature=sig;manager.innerHTML=editor(data,d);}
 const saved=data.config.enabled;
 section.querySelector('.fields').hidden=saved;
 const note=section.querySelector('.form-note');if(note)note.hidden=saved;
 const sub=section.querySelector('.panel-head .panel-sub');if(sub){const value=saved?'O mix de planos substitui o parcelamento único e o antigo percentual de vendas à vista.':'Condição única ou vários planos independentes para o mesmo empreendimento.';if(sub.textContent!==value)sub.textContent=value;}
 const cash=document.querySelector('[data-param="cashSales"]');if(cash){cash.disabled=saved;cash.closest('.field')?.classList.toggle('buyer-derived',saved);cash.title=saved?'Definido pelas participações dos planos. O valor antigo é preservado para o modo único.':'';}
 updateFeedback(data,d);
}
function outputs(data){
 if(!data.config.enabled)return;
 const r=result(data),sig=data.project.id+'|'+JSON.stringify(data.params);
 if(location.hash==='#portfolio'){
  const old=[...document.querySelectorAll('.panel')].find(p=>p.querySelector('h2')?.textContent.trim()==='Um lote. O plano por dentro.');
  const grid=old?.closest('.grid-two');if(grid)grid.hidden=true;
  const memory=[...document.querySelectorAll('.panel')].find(p=>p.querySelector('h2')?.textContent.trim()==='Memória de amortização do lote médio');if(memory)memory.hidden=true;
  let panel=document.querySelector('[data-buyer-analysis]');
  if(!panel){panel=document.createElement('section');panel.className='panel buyer-analysis';panel.dataset.buyerAnalysis='1';if(grid)grid.before(panel);else document.querySelector('main.content')?.appendChild(panel);}
  const signature=sig+'|'+selected+'|'+all;
  if(panel.dataset.signature!==signature){panel.dataset.signature=signature;panel.innerHTML='<div class="panel-head"><div><h2>Planos e composição da carteira</h2><p class="panel-sub">Os recebimentos de todos os planos alimentam os mesmos gráficos, sem duplicar custos.</p></div></div>'+mixTable(r)+'<div class="buyer-amort">'+amortization(r)+'</div>';panel.dataset.signature=sig+'|'+selected+'|'+all;}
 }
 const report=document.querySelector('.report');if(report&&!report.querySelector('[data-buyer-report]')){
  const commercial=[...report.querySelectorAll('.report-block')].find(b=>b.querySelector('h3')?.textContent.startsWith('02'));
  if(commercial){
   const cols=commercial.querySelectorAll('.report-grid > div');
   if(cols[1])cols[1].innerHTML='<p><strong>'+r.paymentPlans.filter(x=>x.share>0).length+' planos de pagamento ativos.</strong></p><p>Perda esperada: '+fmt(r.p.loss)+'%. Recebimento com atraso: '+fmt(r.p.late)+'%, recuperado em '+r.p.delay+' meses.</p><p>Mix constante por mês de venda. Descontos adicionais incidem após o desconto global.</p>';
   commercial.querySelectorAll('.report-kv').forEach(kv=>{if(kv.querySelector('span')?.textContent==='Vendas à vista')kv.querySelector('b').textContent=fmt(r.paymentPlans.filter(x=>x.type==='cash').reduce((n,x)=>n+x.share,0))+'%';});
   const block=document.createElement('div');block.dataset.buyerReport='1';block.innerHTML=mixTable(r);commercial.appendChild(block);
  }
 }
 if(location.hash==='#intelligence'){
  const context=document.querySelector('.intel-context-body');
  if(context){let block=context.querySelector('[data-buyer-context]');if(!block){block=document.createElement('div');block.className='intel-context-group';block.dataset.buyerContext='1';context.appendChild(block);}
   if(block.dataset.signature!==sig){block.dataset.signature=sig;block.innerHTML='<span class="intel-context-label">Planos dos compradores</span>'+r.paymentPlans.map(x=>'<div class="intel-context-row"><span>'+esc(x.name)+'</span><b>'+fmt(x.share)+'% · '+(x.type==='cash'?'à vista':x.term+'x · '+x.system)+'</b></div>').join('');}
   context.querySelectorAll('.intel-context-row').forEach(row=>{if(row.querySelector('span')?.textContent==='Entrada / prazo'){const b=row.querySelector('b'),value='Condições próprias por plano';if(b&&b.textContent!==value)b.textContent=value;}});
  }
 }
}
function enhance(){
 if(committing)return;let data;try{data=current();}catch{return;}const d=draft(data);
 forms(data,d);try{outputs(data);}catch{}
}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;observer.disconnect();try{enhance();}finally{observer.observe(ROOT,{childList:true,subtree:true});}});}
const observer=new MutationObserver(schedule);observer.observe(ROOT,{childList:true,subtree:true});
window.addEventListener('hashchange',schedule);window.addEventListener('storage',e=>{if(e.key===STORE)schedule();});
document.addEventListener('input',event=>{
 const el=event.target;if(!el.matches?.('[data-buyer-field]'))return;
 const data=current(),d=draft(data),i=Number(el.dataset.planIndex),key=el.dataset.buyerField;
 if(!d.config.plans[i])return;
 d.config.plans[i][key]=['name','type','system','index','indexFrequency'].includes(key)?el.value:(el.value===''?null:Number(el.value));d.dirty=true;d.error='';d.notice='';
 updateFeedback(data,d);
 const output=el.closest('.buyer-card')?.querySelector('.buyer-preview');if(output)output.innerHTML=validate(d,data.params)?'Revise os campos indicados antes de aplicar.':preview(d.config.plans[i],data.params);
});
document.addEventListener('change',event=>{
 const el=event.target;
 if(el.matches?.('[data-buyer-field="type"],[data-buyer-field="system"],[data-buyer-field="sacocFrequency"]')){const data=current(),d=draft(data),i=Number(el.dataset.planIndex),key=el.dataset.buyerField;if(!d.config.plans[i])return;d.config.plans[i][key]=key==='sacocFrequency'?Number(el.value):el.value;d.dirty=true;d.revision++;schedule();}
 if(el.matches?.('[data-buyer-contract]')){selected=el.value;all=false;schedule();}
});
document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-buyer-action]');if(!button)return;
 const action=button.dataset.buyerAction,data=current(),d=draft(data),i=Number(button.dataset.planIndex);
 try{
  if(action==='single'){if(data.config.enabled)publish(data,{...data.config,enabled:false});return;}
  if(action==='multiple'){if(!data.config.enabled)publish(data,data.config.plans.length?{...data.config,enabled:true}:H.starter(E.prepare(data.params)));return;}
  if(action==='reset'){drafts.delete(data.project.id);schedule();return;}
  if(action==='apply'){
   if(JSON.stringify(data.config)!==d.source)throw new Error('As condições foram alteradas em outra janela. Descarte o rascunho e revise a versão atual antes de salvar.');
   publish(data,d.config);return;
  }
  if(action==='amort'){all=!all;schedule();return;}
  if(action==='add'){if(d.config.plans.length>=12)return;d.config.plans.push(H.blank(E.prepare(data.params)));}
  if(action==='duplicate'){if(d.config.plans.length>=12)return;d.config.plans.splice(i+1,0,{...clone(d.config.plans[i]),id:H.uid(),name:(d.config.plans[i].name+' — cópia').slice(0,80),share:0});}
  if(action==='remove'){if(d.config.plans.length<=1)throw new Error('Mantenha pelo menos um plano ou volte ao modo único.');if(!confirm('Excluir o plano “'+d.config.plans[i].name+'” deste rascunho? A mudança só vale após Aplicar.'))return;d.config.plans.splice(i,1);}
  if(action==='equal'||action==='normalize'){
   const sum=d.config.plans.reduce((n,p)=>n+Math.max(0,Number(p.share)||0),0);let used=0;
   d.config.plans.forEach((p,j)=>{const share=j===d.config.plans.length-1?100-used:Math.round((action==='equal'||sum<=0?100/d.config.plans.length:Math.max(0,Number(p.share)||0)/sum*100)*10000)/10000;p.share=Number(share.toFixed(4));used+=p.share;});
  }
  d.dirty=true;d.error='';d.revision++;
 }catch(e){d.error=e.message;d.revision++;}
 schedule();
});
window.addEventListener('beforeunload',event=>{if([...drafts.values()].some(d=>d.dirty)){event.preventDefault();event.returnValue='';}});
schedule();
})();
