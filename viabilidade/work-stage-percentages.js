/* Évora Viabilidade · Divisão percentual das etapas v1.0 */
(function(){
'use strict';
const E=window.EvoraEngine,H=E&&E.workStageHelpers,STORE='evora.viabilidade.v1',MODE_STORE='evora.workStages.allocation.v1';
if(!E||!H||window.__workStagePercentagesV1)return;
window.__workStagePercentagesV1=true;

const COLORS=['#497d58','#bb914a','#648693','#8b6f58','#78966c','#9a775f','#8b7796','#6f8e8b'];
const clone=value=>JSON.parse(JSON.stringify(value));
const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||0));
const fmt=(value,digits=1)=>Number.isFinite(Number(value))?Number(value).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
const money=value=>{const n=Number(value)||0,a=Math.abs(n),sign=n<0?'−':'';return sign+'R$ '+(a>=1e6?fmt(a/1e6,1)+' mi':a>=1e4?fmt(a/1e3,0)+' mil':fmt(a,0));};

function active(){
 try{
  const library=JSON.parse(localStorage.getItem(STORE));
  if(!library||!Array.isArray(library.projects)||!library.projects.length)return null;
  const project=library.projects.find(item=>item.id===library.active)||library.projects[0];
  const params=E.prepare(project.params),result=E.simulate(project.params,true);
  return {library,project,params,result};
 }catch{return null;}
}
function bridge(){return document.getElementById('work-stage-bridge-v2');}
function commit(stages){
 const input=bridge()?.querySelector('[data-param="workStagesJson"]');
 if(!input)return;
 input.value=JSON.stringify(H.serializeStages(stages));
 input.dispatchEvent(new Event('change',{bubbles:true}));
}
function modeMap(){try{return JSON.parse(localStorage.getItem(MODE_STORE))||{};}catch{return {};}}
function allocationMode(projectId){const value=modeMap()[projectId];return value==='percent'?'percent':'value';}
function setAllocationMode(projectId,mode){const map=modeMap();map[projectId]=mode==='percent'?'percent':'value';localStorage.setItem(MODE_STORE,JSON.stringify(map));}
function totalBudget(stages){return stages.reduce((sum,stage)=>sum+Math.max(0,Number(stage.budget)||0),0);}
function shares(stages){
 const total=totalBudget(stages);
 if(!stages.length)return [];
 if(total<=0)return stages.map(()=>100/stages.length);
 return stages.map(stage=>Math.max(0,Number(stage.budget)||0)/total*100);
}
function roundedBudgets(total,percentages){
 const budgets=percentages.map(value=>Math.round(total*value*100)/100);
 const difference=Math.round((total-budgets.reduce((sum,value)=>sum+value,0))*100)/100;
 if(budgets.length)budgets[budgets.length-1]=Math.max(0,Math.round((budgets[budgets.length-1]+difference)*100)/100);
 return budgets;
}
function rebalance(stages,index,targetPercent){
 const next=clone(stages),total=totalBudget(next),count=next.length;
 if(!count||total<=0)return next;
 if(count===1){next[0].budget=total;return next;}
 const target=clamp(targetPercent,0,100),remaining=100-target,current=shares(next),otherSum=current.reduce((sum,value,i)=>i===index?sum:sum+value,0);
 const percentages=current.map((value,i)=>{
  if(i===index)return target;
  return otherSum>0?value/otherSum*remaining:remaining/(count-1);
 });
 const budgets=roundedBudgets(total,percentages.map(value=>value/100));
 next.forEach((stage,i)=>{stage.budget=budgets[i];});
 return next;
}
function scaleTotal(stages,newTotal){
 const next=clone(stages),total=Math.max(0,Number(newTotal)||0),current=shares(next),budgets=roundedBudgets(total,current.map(value=>value/100));
 next.forEach((stage,index)=>{stage.budget=budgets[index]||0;});
 return next;
}
function equalize(stages){
 const next=clone(stages),total=totalBudget(next),count=next.length;if(!count)return next;
 const percentages=Array(count).fill(1/count),budgets=roundedBudgets(total,percentages);
 next.forEach((stage,index)=>{stage.budget=budgets[index]||0;});
 return next;
}
function signature(data,mode){return data.project.id+'|'+String(data.project.updated||'')+'|'+data.params.workStagesJson+'|'+mode;}

function installStyles(){
 if(document.getElementById('work-stage-percentages-style'))return;
 const style=document.createElement('style');style.id='work-stage-percentages-style';
 style.textContent=`
 .stage-allocation-panel{margin:13px 0 16px;padding:14px 15px;border:1px solid #dce5d7;border-radius:8px;background:#f7faf4}
 .stage-allocation-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
 .stage-allocation-head>div:first-child span{display:block;font-size:8px;letter-spacing:1px;color:var(--muted)}
 .stage-allocation-head h4{font-size:13px;margin:4px 0 0}
 .stage-allocation-switch{display:flex;border:1px solid var(--line);padding:3px;border-radius:5px;background:#fff}
 .stage-allocation-switch button{border:0;background:none;padding:6px 9px;border-radius:3px;font-size:9px;color:var(--muted)}
 .stage-allocation-switch button.active{background:#e6efe0;color:var(--green);font-weight:650}
 .stage-allocation-data{display:grid;grid-template-columns:minmax(180px,.65fr) minmax(0,1.35fr);gap:14px;margin-top:13px;align-items:end}
 .stage-total-field{display:grid;grid-template-columns:1fr auto;gap:5px 8px;align-items:center}
 .stage-total-field span{font-size:9px;color:var(--muted)}
 .stage-total-field input{grid-column:1/-1;width:100%;border:1px solid #dfe5da;background:#fff;border-radius:5px;min-height:37px;padding:8px 10px;font-size:12px;color:var(--ink)}
 .stage-total-field small{grid-column:1/-1;font-size:8px;color:var(--muted)}
 .stage-percentage-bar{height:18px;border-radius:5px;overflow:hidden;background:#e8eee4;display:flex}
 .stage-percentage-bar i{display:block;height:100%;min-width:0;position:relative}
 .stage-percentage-legend{display:flex;flex-wrap:wrap;gap:7px 13px;margin-top:8px}
 .stage-percentage-legend span{font-size:8px;color:var(--muted);display:flex;align-items:center;gap:5px}
 .stage-percentage-legend i{width:7px;height:7px;border-radius:2px;display:inline-block}
 .stage-allocation-status{display:flex;justify-content:space-between;gap:14px;align-items:center;margin-top:11px;padding-top:10px;border-top:1px solid #e1e8dc}
 .stage-allocation-status p{font-size:8px;line-height:1.55;color:var(--muted);margin:0}
 .stage-allocation-status b{font-size:10px;white-space:nowrap;color:var(--green)}
 .stage-percent-field.percent-active{background:#f1f6ec;border-color:#cbdcc1}
 .stage-percent-field input{font-weight:650;color:#315f43}
 .work-stage-card.percent-mode [data-stage-field="budget"]{background:#f3f5f1;color:#78837b}
 .stage-result .stage-percent-result{color:#315f43;font-weight:650}
 .stage-timeline-percent{display:inline-flex;margin-left:5px;padding:2px 5px;border-radius:4px;background:#edf4e8;color:#42684a;font-size:8px;font-weight:650}
 .report-stage-percent{color:#42684a;font-weight:650}
 @media(max-width:720px){.stage-allocation-head{display:block}.stage-allocation-switch{margin-top:10px;width:max-content}.stage-allocation-data{grid-template-columns:1fr}.stage-allocation-status{display:block}.stage-allocation-status b{display:block;margin-top:7px}.stage-percent-field input,.stage-total-field input{font-size:16px}}
 `;document.head.appendChild(style);
}

function allocationPanel(data,mode){
 const stages=data.params.workStages,total=totalBudget(stages),percentages=shares(stages),sum=percentages.reduce((a,b)=>a+b,0);
 const panel=document.createElement('div');panel.className='stage-allocation-panel';panel.dataset.stageAllocationPanel='1';
 const segments=percentages.map((value,index)=>'<i style="width:'+value+'%;background:'+COLORS[index%COLORS.length]+'" title="'+stages[index].name+' · '+fmt(value,1)+'%"></i>').join('');
 const legend=stages.map((stage,index)=>'<span><i style="background:'+COLORS[index%COLORS.length]+'"></i>'+stage.name+' · '+fmt(percentages[index],1)+'%</span>').join('');
 panel.innerHTML=
  '<div class="stage-allocation-head"><div><span>FORMA DE DIVISÃO DO ORÇAMENTO</span><h4>Valores ou percentuais por etapa</h4></div><div class="stage-allocation-switch"><button type="button" data-stage-allocation-mode="value" class="'+(mode==='value'?'active':'')+'">Valores em R$</button><button type="button" data-stage-allocation-mode="percent" class="'+(mode==='percent'?'active':'')+'">Percentuais</button></div></div>'+ 
  '<div class="stage-allocation-data"><label class="stage-total-field"><span>Orçamento total-base da obra</span><input type="number" min="0" step="1000" data-stage-total-budget value="'+total.toFixed(2)+'" '+(mode==='percent'?'':'disabled')+'><small>'+(mode==='percent'?'Altere o total sem mudar a participação relativa das etapas.':'Derivado da soma dos valores informados em cada etapa.')+'</small></label><div><div class="stage-percentage-bar">'+segments+'</div><div class="stage-percentage-legend">'+legend+'</div></div></div>'+ 
  '<div class="stage-allocation-status"><p>'+(mode==='percent'?'Ao alterar o percentual de uma etapa, as demais são reequilibradas proporcionalmente para preservar 100% e o orçamento total.':'Os percentuais são calculados automaticamente a partir dos orçamentos-base de cada etapa.')+'</p><div><button type="button" class="button small" data-stage-percent-equalize '+(mode==='percent'?'':'disabled')+'>Distribuir igualmente</button> <b>Total '+fmt(sum,1)+'%</b></div></div>';
 return panel;
}

function enhanceManager(data){
 if(data.params.workMode!=='stages')return;
 const manager=document.querySelector('.work-stage-manager');if(!manager)return;
 const mode=allocationMode(data.project.id),sig=signature(data,mode);
 if(manager.dataset.percentageSignature===sig)return;
 manager.dataset.percentageSignature=sig;
 manager.querySelector('[data-stage-allocation-panel]')?.remove();
 const summary=manager.querySelector('.work-stage-summary');
 const panel=allocationPanel(data,mode);
 if(summary)summary.insertAdjacentElement('afterend',panel);else manager.prepend(panel);
 const percentages=shares(data.params.workStages);
 manager.querySelectorAll('.work-stage-card').forEach((card,index)=>{
  card.classList.toggle('percent-mode',mode==='percent');
  card.querySelector('.stage-percent-field')?.remove();
  const fields=card.querySelector('.stage-fields'),budget=fields?.querySelector('[data-stage-field="budget"]');
  if(!fields||!budget)return;
  budget.disabled=mode==='percent';
  const label=document.createElement('label');label.className='stage-percent-field '+(mode==='percent'?'percent-active':'');
  label.innerHTML='<span>Participação da etapa</span><small>% do orçamento</small><input type="number" min="0" max="100" step="0.1" data-stage-percent="'+index+'" value="'+percentages[index].toFixed(3)+'" '+(mode==='percent'?'':'disabled')+'>';
  budget.closest('label').insertAdjacentElement('afterend',label);
  const result=card.querySelector('.stage-result');if(result){const badge=document.createElement('span');badge.className='stage-percent-result';badge.textContent=fmt(percentages[index],1)+'% do orçamento-base';result.appendChild(badge);}
 });
}

function enhanceTimelineAndReport(data){
 if(data.params.workMode!=='stages')return;
 const percentages=shares(data.params.workStages);
 document.querySelectorAll('.stage-timeline-row').forEach((row,index)=>{
  if(row.querySelector('.stage-timeline-percent'))return;
  const value=document.createElement('span');value.className='stage-timeline-percent';value.textContent=fmt(percentages[index],1)+'%';
  row.querySelector('strong')?.appendChild(value);
 });
 const table=document.querySelector('.stage-table table');
 if(table&&!table.dataset.percentages){
  table.dataset.percentages='1';
  const header=table.querySelector('thead tr'),headers=header&&header.querySelectorAll('th');
  if(header&&headers?.length){const th=document.createElement('th');th.textContent='Participação';header.insertBefore(th,headers[3]||null);}
  table.querySelectorAll('tbody tr').forEach((row,index)=>{const cells=row.querySelectorAll('td'),td=document.createElement('td');td.textContent=fmt(percentages[index],1)+'%';row.insertBefore(td,cells[3]||null);});
 }
 document.querySelectorAll('.work-stages-report .report-stage-grid>div').forEach((item,index)=>{
  const small=item.querySelector('small');if(!small||small.querySelector('.report-stage-percent'))return;
  small.insertAdjacentHTML('beforeend',' · <span class="report-stage-percent">'+fmt(percentages[index],1)+'% do orçamento</span>');
 });
}

function enhance(){
 installStyles();const data=active();if(!data)return;enhanceManager(data);enhanceTimelineAndReport(data);
}
let scheduled=false;
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance();});}

document.addEventListener('click',event=>{
 const modeButton=event.target.closest('[data-stage-allocation-mode]');
 if(modeButton){const data=active();if(!data)return;setAllocationMode(data.project.id,modeButton.dataset.stageAllocationMode);const manager=document.querySelector('.work-stage-manager');if(manager)delete manager.dataset.percentageSignature;schedule();return;}
 const equalizeButton=event.target.closest('[data-stage-percent-equalize]');
 if(equalizeButton){const data=active();if(!data)return;commit(equalize(data.params.workStages));return;}
});

document.addEventListener('change',event=>{
 const percent=event.target.closest('[data-stage-percent]'),totalInput=event.target.closest('[data-stage-total-budget]');
 if(!percent&&!totalInput)return;
 const data=active();if(!data)return;
 if(percent){const index=Number(percent.dataset.stagePercent);if(!Number.isInteger(index)||!data.params.workStages[index])return;commit(rebalance(data.params.workStages,index,Number(percent.value)));}
 if(totalInput)commit(scaleTotal(data.params.workStages,Number(totalInput.value)));
});

const root=document.getElementById('app');if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
window.addEventListener('storage',schedule);schedule();
})();