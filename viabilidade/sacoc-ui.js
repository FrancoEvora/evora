/* SACOC controls and explanatory labels. Pure view enhancement; no direct storage writes. */
(function(){
'use strict';
const E=window.EvoraEngine,ROOT=document.getElementById('app');if(!E?.sacoc||!ROOT||window.__evoraSacocUI)return;window.__evoraSacocUI=true;
const STORE='evora.viabilidade.v1',esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let scheduled=false,key='',cached=null;
function active(){let lib;try{lib=JSON.parse(localStorage.getItem(STORE));}catch{}const project=lib?.projects?.find(x=>x.id===lib.active)||lib?.projects?.[0]||{id:'demo',params:{...E.defaults}};return project;}
function calculation(project){const k=JSON.stringify(project.params);if(k!==key){cached=E.simulate(project.params,true);key=k;}return cached;}
function field(key,label,value,options,hint){return '<label class="field sacoc-field"><span class="field-label">'+label+'</span>'+(options?'<select data-param="'+key+'" aria-label="'+label+'">'+options.map(([v,n])=>'<option value="'+v+'" '+(String(v)===String(value)?'selected':'')+'>'+n+'</option>').join('')+'</select>':'<input data-param="'+key+'" aria-label="'+label+'" type="number" min="0" max="100" step="any" inputmode="decimal" value="'+esc(value)+'">')+'<small class="sacoc-hint">'+hint+'</small></label>';}
function form(project){
 const p={...E.defaults,...project.params},input=document.querySelector('[data-param="system"]');if(!input)return;
 if(!input.querySelector('option[value="SACOC"]')){const option=document.createElement('option');option.value='SACOC';option.textContent='SACOC · cotas crescentes';input.appendChild(option);}
 input.value=p.system;
 const section=input.closest('.form-section'),fields=section?.querySelector('.fields');if(!fields)return;
 let multiple=false;try{multiple=E.buyerPlans.read(p.buyerPlansJson).enabled;}catch{}
 const enabled=p.system==='SACOC'&&!multiple;
 let frequency=fields.querySelector('[data-param="sacocFrequency"]');
 if(!frequency){fields.insertAdjacentHTML('beforeend',field('sacocFrequency','Evolução das cotas SACOC',p.sacocFrequency,[[12,'Blocos anuais · 12 prestações'],[1,'Mensal · desde a 1ª prestação']],'A evolução remuneratória é independente do indexador. O primeiro bloco anual utiliza as cotas-base; o primeiro acréscimo ocorre na 13ª prestação.'));frequency=fields.querySelector('[data-param="sacocFrequency"]');}
 let rate=fields.querySelector('[data-param="sacocAnnualRate"]');
 if(!rate){fields.insertAdjacentHTML('beforeend',field('sacocAnnualRate','Evolução SACOC (% a.a.)',p.sacocAnnualRate,null,'Taxa acumulada a cada bloco de 12 prestações. A taxa mensal do plano não é somada no modo anual.'));rate=fields.querySelector('[data-param="sacocAnnualRate"]');}
 frequency.value=p.sacocFrequency;rate.value=p.sacocAnnualRate;
 frequency.closest('.field').hidden=!enabled;rate.closest('.field').hidden=!enabled||p.sacocFrequency!==12;
 const monthly=fields.querySelector('[data-param="interest"]');if(monthly){monthly.disabled=enabled&&p.sacocFrequency===12;monthly.closest('.field').hidden=enabled&&p.sacocFrequency===12;}
 let note=section.querySelector('[data-sacoc-explanation]');if(!note){note=document.createElement('div');note.className='sacoc-note';note.dataset.sacocExplanation='1';section.appendChild(note);}note.hidden=!enabled;
 if(enabled){const text=E.sacoc.description(p)+'. A entrada não sofre juros ou correção neste modelo. As cotas-base dos balões também recebem a evolução. A correção TR/IPCA permanece independente; selecione “Sem correção” quando não houver indexação contratual. O saldo-base não equivale ao valor de quitação antecipada.';if(note.textContent!==text)note.textContent=text;}
}
function changeText(node,text){if(node&&node.textContent!==text)node.textContent=text;}
function note(container,id,text){if(!container)return;let p=container.querySelector('[data-sacoc-note="'+id+'"]');if(!p){p=document.createElement('p');p.dataset.sacocNote=id;p.className='sacoc-note';container.appendChild(p);}changeText(p,text);}
function outputs(project){
 if(!['#portfolio','#report','#performance'].includes(location.hash))return;
 const r=calculation(project),p=r.p,single=!r.paymentPlans&&p.system==='SACOC',plans=r.paymentPlans||[];
 const has=single||plans.some(x=>x.type==='installments'&&x.system==='SACOC');if(!has)return;
 if(single){
  const panel=[...document.querySelectorAll('.panel')].find(n=>n.querySelector('h2')?.textContent.trim()==='Um lote. O plano por dentro.');
  if(panel){
   const label=[...panel.querySelectorAll('.report-kv')].find(x=>['Juros efetivos anuais equivalentes','Evolução das cotas SACOC'].includes(x.querySelector('span')?.textContent));
   if(label){changeText(label.querySelector('span'),'Evolução das cotas SACOC');changeText(label.querySelector('b'),E.sacoc.description(p));}
   note(panel,'single-description',E.sacoc.description(p)+'. '+[13,25,p.term].filter((k,i,a)=>k<=p.term&&a.indexOf(k)===i).map(k=>k+'ª prestação regular: '+money(r.contract.schedule[k-1].regular)).join(' · ')+'. Valores incluem a correção hipotética, sem entrada e sem balões.');
  }
  const memory=[...document.querySelectorAll('.panel')].find(n=>n.querySelector('h2')?.textContent.trim()==='Memória de amortização do lote médio');
  if(memory){const th=memory.querySelectorAll('thead th');changeText(th[3],'Remuneração da cota');changeText(th[4],'Cota-base corrigida');changeText(th[5],'Saldo-base corrigido');note(memory,'balance',r.contract.interestDefinition+' '+r.contract.balanceDefinition);}
  const report=document.querySelector('.report');if(report){const kv=[...report.querySelectorAll('.report-kv')].find(x=>x.querySelector('span')?.textContent==='Plano / juros');if(kv)changeText(kv.querySelector('b'),p.term+'x · '+E.sacoc.description(p));note(report,'rule',E.sacoc.description(p)+'. Crescimento das cotas e correção monetária são componentes distintos. Confira a fórmula e as datas de incidência com o contrato.');}
 }
 const perf=[...document.querySelectorAll('.performance-section')].find(n=>n.querySelector('h3')?.textContent==='Carteira, planos de venda e terreno');
 if(perf){
  const table=perf.querySelector('table'),rows=table?.querySelectorAll('tbody tr');
  if(rows){changeText(table.querySelectorAll('thead th')[3],'Prazo / amortização');if(plans.length){plans.forEach((x,i)=>{if(x.type==='installments'&&x.system==='SACOC')changeText(rows[i]?.querySelectorAll('td')[2],x.term+'x · '+E.sacoc.description(x));});}else if(single){changeText(rows[1]?.querySelectorAll('td')[2],p.term+'x · '+E.sacoc.description(p));}}
  note(perf,'rule','Nos planos SACOC, remuneração acumulada das cotas e correção monetária são calculadas separadamente. O principal exibido é o saldo-base corrigido, sem remuneração das cotas; não corresponde automaticamente ao valor contratual de quitação antecipada.');
 }
}
function methodology(){
 const area=document.querySelector('.methodology');if(!area||area.querySelector('[data-sacoc-method]'))return;
 const block=document.createElement('section');block.dataset.sacocMethod='1';block.innerHTML='<h3>SACOC · regra de cotas adotada nesta simulação</h3><p>A escolha SACOC deve ser compatibilizada com a fórmula e as datas do contrato. Nesta plataforma, o principal depois da entrada é distribuído em cotas-base regulares e cotas-base de balões. A remuneração incide sobre cada cota, e não como os juros mensais do SAC sobre todo o saldo.</p><div class="formula">Cota regular = (principal financiado − principal destinado aos balões) ÷ prazo<br>Mensal: pagamento da cota k = cota-base × (1 + taxa mensal)^k × fator de correção<br>Blocos anuais: pagamento da cota k = cota-base × (1 + taxa anual)^piso((k − 1) ÷ 12) × fator de correção</div><p>No modo anual, o primeiro acréscimo remuneratório ocorre na 13ª prestação e a taxa mensal é ignorada. No modo mensal, o acréscimo começa na primeira prestação. Não há remuneração ou correção durante o parcelamento da entrada. Balões amortizam o mesmo principal, sem duplicar o preço.</p><p>O fator de correção permanece independente: sem correção = 1; correção mensal = (1 + hipótese anual)^(k/12); correção anual = (1 + hipótese anual)^piso(k/12). Portanto, correção monetária anual e evolução anual das cotas têm datas de incidência diferentes nesta convenção. O saldo-base corrigido não é cálculo de liquidação antecipada.</p>';
 area.appendChild(block);
}
function style(){if(document.getElementById('sacoc-ui-style'))return;const node=document.createElement('style');node.id='sacoc-ui-style';node.textContent='.sacoc-field[hidden]{display:none!important}.sacoc-hint{display:block;font-size:11px;line-height:1.5;color:var(--muted,#64736b);margin-top:6px}.sacoc-note{padding:12px 15px;margin:12px 0;border-left:3px solid #648693;background:#f6f8f5;font-size:11px;line-height:1.65;color:#52665a}.sacoc-note[hidden]{display:none!important}.sacoc-field select,.sacoc-field input{width:100%;min-width:0}@media print{.sacoc-note{break-inside:avoid;background:white}}';document.head.appendChild(node);}
function enhance(){style();const p=active();form(p);try{outputs(p);}catch{}methodology();}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;observer.disconnect();try{enhance();}finally{observer.observe(ROOT,{childList:true,subtree:true});}});}
const observer=new MutationObserver(schedule);observer.observe(ROOT,{childList:true,subtree:true});window.addEventListener('hashchange',schedule);window.addEventListener('storage',e=>{if(e.key===STORE)schedule();});schedule();
})();
