/* Évora Viabilidade · Etapas da obra v1.0 */
(function(){
'use strict';
const E=window.EvoraEngine;
if(!E||E.__workStagesV1)return;
E.__workStagesV1=true;

const original={prepare:E.prepare,simulate:E.simulate,scenarios:E.scenarios};
E.defaults.workMode='single';
E.defaults.workStagesJson='[]';

const CURVES=['s','linear','early','late','custom'];
const curveLabels={s:'Curva S',linear:'Linear',early:'Concentrada no início',late:'Concentrada no fim',custom:'Manual'};
const clamp=(v,min,max)=>Math.min(max,Math.max(min,Number(v)||0));
const uid=()=>globalThis.crypto?.randomUUID?.()||'stage-'+Date.now().toString(36)+Math.random().toString(36).slice(2);
const clone=x=>JSON.parse(JSON.stringify(x));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=0)=>Number.isFinite(Number(v))?Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const money=v=>{const n=Number(v)||0,a=Math.abs(n),sign=n<0?'−':'';return sign+'R$ '+(a>=1e6?fmt(a/1e6,1)+' mi':a>=1e4?fmt(a/1e3,0)+' mil':fmt(a,0));};

function baseCurve(curve,duration){
 const n=Math.max(1,Math.round(duration)||1);
 let values=Array.from({length:n},(_,i)=>{
  if(curve==='linear')return 1;
  if(curve==='early')return n-i;
  if(curve==='late')return i+1;
  return Math.sin(Math.PI*(i+.5)/n);
 });
 const sum=values.reduce((a,b)=>a+b,0)||1;
 return values.map(v=>v/sum);
}
function resample(source,n){
 const target=Math.max(1,Math.round(n)||1),src=(Array.isArray(source)?source:[]).map(Number).filter(Number.isFinite);
 if(!src.length)return baseCurve('s',target);
 if(src.length===target){const sum=src.reduce((a,b)=>a+Math.max(0,b),0)||1;return src.map(v=>Math.max(0,v)/sum);}
 if(src.length===1)return Array(target).fill(1/target);
 const out=[];
 for(let i=0;i<target;i++){
  const pos=target===1?0:i*(src.length-1)/(target-1),lo=Math.floor(pos),hi=Math.min(src.length-1,Math.ceil(pos)),q=pos-lo;
  out.push(Math.max(0,src[lo]*(1-q)+src[hi]*q));
 }
 const sum=out.reduce((a,b)=>a+b,0)||1;
 return out.map(v=>v/sum);
}
function normalizeStage(raw,index,legacy){
 const duration=Math.max(1,Math.min(120,Math.round(Number(raw?.duration)||legacy.duration||12)));
 const start=Math.max(0,Math.min(119,Math.round(Number(raw?.start)??legacy.start??0)));
 if(start+duration-1>120)throw new Error('A etapa “'+String(raw?.name||index+1)+'” ultrapassa o limite de M120.');
 const curve=CURVES.includes(raw?.curve)?raw.curve:'s';
 const weights=curve==='custom'?resample(raw?.weights,duration):[];
 return {id:String(raw?.id||uid()),name:String(raw?.name||('Etapa '+(index+1))).slice(0,80),budget:clamp(raw?.budget,0,1e11),start,duration,contingency:clamp(raw?.contingency??legacy.contingency,0,100),curve,weights};
}
function parseStages(value,legacy){
 let raw=[];
 try{raw=Array.isArray(value)?value:JSON.parse(typeof value==='string'&&value?value:'[]');}catch{raw=[];}
 if(!Array.isArray(raw))raw=[];
 return raw.map((stage,index)=>normalizeStage(stage,index,legacy));
}
function serializable(stages){return stages.map(s=>({id:s.id,name:s.name,budget:s.budget,start:s.start,duration:s.duration,contingency:s.contingency,curve:s.curve,weights:s.curve==='custom'?s.weights:[]}));}
function legacyStage(p){return normalizeStage({name:'Etapa 1 — Implantação',budget:p.work,start:p.workStart,duration:p.duration,contingency:p.contingency,curve:p.curve,weights:p.workWeights},0,{start:p.workStart,duration:p.duration,contingency:p.contingency});}

function prepare(input){
 const source={...(input||{})};
 const stageMode=String(source.workMode||'single')==='stages';
 if(stageMode){source.work=Math.max(0,Number(source.work)||0);source.workStart=0;source.duration=1;source.contingency=0;source.curve='linear';source.workWeights=[];}
 const p=original.prepare(source);
 p.workMode=stageMode?'stages':'single';
 p.workStagesJson=typeof input?.workStagesJson==='string'?input.workStagesJson:(typeof p.workStagesJson==='string'?p.workStagesJson:'[]');
 const legacy={start:Number(input?.workStart??p.workStart)||0,duration:Number(input?.duration??p.duration)||1,contingency:Number(input?.contingency??p.contingency)||0};
 let stages=parseStages(p.workStagesJson,legacy);
 if(p.workMode==='stages'){
  if(!stages.length)stages=[legacyStage(original.prepare(input||{}))];
  const total=stages.reduce((a,s)=>a+s.budget,0);
  if(total<=0)throw new Error('Informe orçamento maior que zero em pelo menos uma etapa da obra.');
  const start=Math.min(...stages.map(s=>s.start)),end=Math.max(...stages.map(s=>s.start+s.duration-1));
  if(end-start+1>120)throw new Error('O cronograma consolidado das etapas não pode superar 120 meses.');
  p.work=total;p.workStart=start;p.duration=end-start+1;p.contingency=stages.reduce((a,s)=>a+s.budget*s.contingency,0)/total;p.curve='linear';p.workWeights=[];
 }
 p.workStages=stages;p.workStagesJson=JSON.stringify(serializable(stages));
 return p;
}

function stageSchedule(p){
 const stages=p.workStages.map(stage=>{
  const weights=stage.curve==='custom'?resample(stage.weights,stage.duration):baseCurve(stage.curve,stage.duration);
  const baseWithContingency=stage.budget*(1+stage.contingency/100),monthly=[];
  let nominalTotal=0;
  for(let k=0;k<stage.duration;k++){
   const t=stage.start+k,amount=baseWithContingency*weights[k]*Math.pow(1+p.workInflation/100,t/12);
   monthly.push({t,amount,weight:weights[k]});nominalTotal+=amount;
  }
  return {...stage,weights,monthly,baseWithContingency,nominalTotal,end:stage.start+stage.duration-1};
 });
 const monthly=Array(121).fill(0),byMonth=Array.from({length:121},()=>({})),aggregate=Array(p.duration).fill(0),totalBase=Math.max(1,p.work);
 stages.forEach(stage=>stage.monthly.forEach(item=>{monthly[item.t]+=item.amount;byMonth[item.t][stage.id]=item.amount;aggregate[item.t-p.workStart]+=stage.budget*item.weight;}));
 return {stages,monthly,byMonth,aggregateWeights:aggregate.map(v=>v/totalBase),totalNominal:stages.reduce((a,s)=>a+s.nominalTotal,0),withContingency:stages.reduce((a,s)=>a+s.baseWithContingency,0)};
}

function recomputeFunding(result,p,light,schedule){
 const rows=result.rows,workEnd=p.workStart+p.duration-1;
 rows.forEach(row=>{row.work=schedule.monthly[row.t]||0;row.stageWork=schedule.byMonth[row.t]||{};});
 let cumulative=0,cumWork=0,peak=0,peakMonth=0;
 for(const row of rows){
  row.net=row.cashForWork-row.work;cumulative+=row.net;cumWork+=row.work;row.cumulative=cumulative;row.cumWork=cumWork;row.coverage=cumWork>0?Math.max(0,row.cumCashForWork)/cumWork*100:0;
  if(-cumulative>peak){peak=-cumulative;peakMonth=row.t;}
 }
 let bank=p.equity,debt=0,totalDraw=0,extra=0,totalInterest=0,totalFee=0,totalRepay=0,totalDist=0;
 for(const row of rows){
  Object.assign(row,{draw:0,interest:0,fee:0,repay:0,debt:0,extraEquity:0,distribution:0,bank:0,equityCF:0});
  row.interest=debt*p.debtRate/100;bank+=row.net-row.interest;
  if(bank<0&&row.t<=p.drawEnd&&row.t<p.maturity){row.draw=Math.min(Math.max(0,p.credit-totalDraw),-bank/(1-p.debtFee/100));row.fee=row.draw*p.debtFee/100;debt+=row.draw;totalDraw+=row.draw;bank+=row.draw-row.fee;}
  if(row.t>=p.sweepStart&&bank>0&&debt>0){row.repay=Math.min(debt,bank);debt-=row.repay;bank-=row.repay;}
  if(row.t===p.maturity&&debt>0){row.repay+=debt;bank-=debt;debt=0;}
  if(bank<0){row.extraEquity=-bank;extra+=-bank;bank=0;}
  if(row.t>=workEnd+1&&debt<.001&&bank>0){row.distribution=bank;bank=0;}
  if(row.t===rows.length-1&&bank>0){row.distribution+=bank;bank=0;}
  row.debt=debt;row.bank=bank;row.equityCF=row.distribution-row.extraEquity-(row.t===0?p.equity:0);
  totalInterest+=row.interest;totalFee+=row.fee;totalRepay+=row.repay;totalDist+=row.distribution;
 }
 const sum=key=>rows.reduce((a,r)=>a+(Number(r[key])||0),0),flows=rows.map(r=>r.net),equityFlows=rows.map(r=>r.equityCF);
 let lastNegative=-1;rows.forEach(row=>{if(row.cumulative<-.01)lastNegative=row.t;});
 const payback=lastNegative===rows.length-1?null:lastNegative<0?0:lastNegative+1,completion=rows[workEnd],totalWork=sum('work'),receipts=sum('received'),coverage=totalWork>0?Math.max(0,completion.cumCashForWork)/totalWork*100:null,targetRow=rows.find(r=>r.t<=workEnd&&r.cumCashForWork>=totalWork*p.target/100);
 Object.assign(result.totals,{work:totalWork,workBase:p.work,workWithContingency:schedule.withContingency,stageCount:schedule.stages.length,profit:sum('net'),margin:receipts>0?sum('net')/receipts*100:null,vpl:E.npv(flows,p.tma),projectIRR:light?{annual:null}:E.irr(flows),equityIRR:light?{annual:null}:E.irr(equityFlows),peak,peakMonth,payback,workEnd,coverage,targetMonth:targetRow?.t??null,draw:totalDraw,extra,interest:totalInterest,fee:totalFee,repay:totalRepay,distribution:totalDist,equityTotal:p.equity+extra});
 result.p=p;result.workWeights=schedule.aggregateWeights;result.stages=schedule.stages;
 const replaceTitles=new Set(['Funding insuficiente','VPL negativo','Meta de cobertura não atingida']);
 result.warnings=(result.warnings||[]).filter(w=>!replaceTitles.has(w.title));
 if(extra>1)result.warnings.unshift({level:'danger',title:'Funding insuficiente',text:'O cronograma consolidado das etapas exige aportes adicionais além das fontes parametrizadas.'});
 if(result.totals.vpl<0)result.warnings.unshift({level:'danger',title:'VPL negativo',text:'O retorno projetado não remunera a taxa mínima de atratividade informada.'});
 if(coverage!==null&&coverage<p.target)result.warnings.push({level:'warning',title:'Meta de cobertura não atingida',text:'O caixa disponível até a entrega está abaixo da meta definida.'});
 return result;
}

E.prepare=prepare;
E.simulate=function(input,light=false){
 const p=prepare(input||{});
 if(p.workMode!=='stages')return original.simulate(p,light);
 const schedule=stageSchedule(p),transformed={...p,workMode:'single',workStagesJson:'[]',work:0,contingency:0,workStart:p.workStart,duration:p.duration,curve:'linear',workWeights:[]};
 return recomputeFunding(original.simulate(transformed,light),p,light,schedule);
};
E.scenarios=function(input){
 const p=prepare(input||{}),definitions=[
  {id:'base',name:'Base',description:'Suas premissas atuais.',p:{...p}},
  {id:'optimistic',name:'Expansão',description:'Preço +5%; vendas +25%; obra −5%.',p:{...p,price:p.price*1.05,speed:p.speed*1.25}},
  {id:'conservative',name:'Conservador',description:'Preço −5%; vendas −25%; obra +10%; início das etapas +3 meses; perdas +2 p.p.',p:{...p,price:p.price*.95,speed:p.speed*.75,loss:Math.min(100,p.loss+2)}},
  {id:'stress',name:'Estresse',description:'Preço −10%; vendas −40%; obra +20%; início das etapas +6 meses; perdas +5 p.p.',p:{...p,price:p.price*.9,speed:p.speed*.6,loss:Math.min(100,p.loss+5)}}
 ];
 return definitions.map(item=>{
  const q=clone(item.p);
  if(q.workMode==='stages'){
   let stages=parseStages(q.workStagesJson,{start:q.workStart,duration:q.duration,contingency:q.contingency});
   if(item.id==='optimistic')stages=stages.map(s=>({...s,budget:s.budget*.95}));
   if(item.id==='conservative')stages=stages.map(s=>({...s,budget:s.budget*1.10,start:Math.min(119,s.start+3)}));
   if(item.id==='stress')stages=stages.map(s=>({...s,budget:s.budget*1.20,start:Math.min(119,s.start+6)}));
   q.workStagesJson=JSON.stringify(serializable(stages));
  }else{
   if(item.id==='optimistic')q.work*=.95;
   if(item.id==='conservative'){q.work*=1.10;q.workStart+=3;}
   if(item.id==='stress'){q.work*=1.20;q.workStart+=6;}
  }
  try{return {...item,p:q,result:E.simulate(q)};}catch(error){return {...item,p:q,error:error.message};}
 });
};
E.workStageHelpers={parseStages,serializable,legacyStage,resample,baseCurve,curveLabels,stageSchedule};

const STORE='evora.viabilidade.v1';
function active(){
 try{const lib=JSON.parse(localStorage.getItem(STORE));if(!lib?.projects?.length)return null;const project=lib.projects.find(x=>x.id===lib.active)||lib.projects[0];return {lib,project,params:E.prepare(project.params),result:E.simulate(project.params,true)};}catch{return null;}
}
function bridge(){
 let box=document.getElementById('work-stage-bridge');
 if(!box){box=document.createElement('div');box.id='work-stage-bridge';box.hidden=true;box.innerHTML='<input data-param="workStagesJson"><input data-param="workMode">';document.body.appendChild(box);}
 return box;
}
function dispatch(key,value){const input=bridge().querySelector('[data-param="'+key+'"]');input.value=String(value);input.dispatchEvent(new Event('change',{bubbles:true}));}
function commitStages(stages){dispatch('workStagesJson',JSON.stringify(serializable(stages)));}
function enableStages(data){const stages=data.params.workStages.length?data.params.workStages:[legacyStage(data.params)];dispatch('workStagesJson',JSON.stringify(serializable(stages)));dispatch('workMode','stages');}
function stageSummary(data){
 const stages=data.result.stages||[],base=stages.reduce((a,s)=>a+s.budget,0),withCont=stages.reduce((a,s)=>a+s.baseWithContingency,0),nominal=stages.reduce((a,s)=>a+s.nominalTotal,0),start=Math.min(...stages.map(s=>s.start)),end=Math.max(...stages.map(s=>s.end));
 return {base,withCont,nominal,start,end};
}
function stageCard(stage,index,result){
 const calculated=(result.stages||[]).find(s=>s.id===stage.id),manual=stage.curve==='custom'?'<details class="stage-manual"><summary>Pesos mensais da etapa</summary><div class="stage-weight-grid">'+resample(stage.weights,stage.duration).map((v,i)=>'<label>M'+(stage.start+i)+'<input type="number" min="0" step="0.01" value="'+(v*100).toFixed(3)+'" data-stage-weight="'+index+'" data-weight-index="'+i+'"></label>').join('')+'</div><p>Os pesos são normalizados automaticamente para totalizar 100%.</p></details>':'';
 return '<article class="work-stage-card"><div class="work-stage-card-head"><div><span>ETAPA '+String(index+1).padStart(2,'0')+'</span><input class="stage-name" data-stage-field="name" data-stage-index="'+index+'" value="'+esc(stage.name)+'" aria-label="Nome da etapa"></div><div class="stage-actions"><button type="button" data-stage-action="up" data-stage-index="'+index+'" aria-label="Mover etapa para cima">↑</button><button type="button" data-stage-action="down" data-stage-index="'+index+'" aria-label="Mover etapa para baixo">↓</button><button type="button" data-stage-action="duplicate" data-stage-index="'+index+'">Duplicar</button><button type="button" data-stage-action="delete" data-stage-index="'+index+'" '+(result.stages.length<=1?'disabled':'')+'>Excluir</button></div></div><div class="stage-fields"><label>Orçamento-base <span>R$</span><input type="number" min="0" step="1000" data-stage-field="budget" data-stage-index="'+index+'" value="'+stage.budget+'"></label><label>Início <span>mês</span><input type="number" min="0" max="119" step="1" data-stage-field="start" data-stage-index="'+index+'" value="'+stage.start+'"></label><label>Duração <span>meses</span><input type="number" min="1" max="120" step="1" data-stage-field="duration" data-stage-index="'+index+'" value="'+stage.duration+'"></label><label>Contingência <span>%</span><input type="number" min="0" max="100" step="0.1" data-stage-field="contingency" data-stage-index="'+index+'" value="'+stage.contingency+'"></label><label>Distribuição<select data-stage-field="curve" data-stage-index="'+index+'">'+CURVES.map(v=>'<option value="'+v+'" '+(stage.curve===v?'selected':'')+'>'+curveLabels[v]+'</option>').join('')+'</select></label></div><div class="stage-result"><span>M'+stage.start+' a M'+(stage.start+stage.duration-1)+'</span><span>Com contingência: <b>'+money(stage.budget*(1+stage.contingency/100))+'</b></span><span>Desembolso nominal projetado: <b>'+money(calculated?.nominalTotal||0)+'</b></span></div>'+manual+'</article>';
}
function manager(data){
 const mode=data.params.workMode,stages=data.params.workStages,summary=mode==='stages'?stageSummary(data):null;
 const body=mode==='stages'?'<div class="work-stage-summary"><div><span>ETAPAS</span><b>'+stages.length+'</b></div><div><span>ORÇAMENTO-BASE</span><b>'+money(summary.base)+'</b></div><div><span>COM CONTINGÊNCIAS</span><b>'+money(summary.withCont)+'</b></div><div><span>DESEMBOLSO NOMINAL</span><b>'+money(summary.nominal)+'</b></div><div><span>CRONOGRAMA</span><b>M'+summary.start+'–M'+summary.end+'</b></div></div><div class="work-stage-list">'+stages.map((s,i)=>stageCard(s,i,data.result)).join('')+'</div><div class="stage-manager-actions"><button type="button" class="button" data-stage-action="preset">Modelo em 3 etapas</button><button type="button" class="button primary" data-stage-action="add">+ Adicionar etapa</button></div><p class="stage-manager-note">O total da obra, a curva consolidada, a exposição de caixa e o funding são recalculados pela soma mensal de todas as etapas. A inflação de custos continua sendo a premissa global do empreendimento.</p>':'<div class="stage-manager-empty"><strong>Obra única</strong><p>O orçamento e o cronograma continuam sendo controlados pelos campos atuais. Ao ativar etapas, a configuração existente será preservada como a primeira fase.</p></div>';
 const el=document.createElement('div');el.className='work-stage-manager';el.innerHTML='<div class="stage-mode-head"><div><span>ESTRUTURA DA IMPLANTAÇÃO</span><h3>Divisão da obra em etapas</h3></div><div class="stage-mode-switch"><button type="button" data-stage-action="mode-single" class="'+(mode==='single'?'active':'')+'">Obra única</button><button type="button" data-stage-action="mode-stages" class="'+(mode==='stages'?'active':'')+'">Por etapas</button></div></div>'+body;return el;
}
function applyDerivedState(section,mode){
 ['work','contingency','workStart','duration','curve'].forEach(key=>{const input=section.querySelector('[data-param="'+key+'"]'),field=input?.closest('.field');if(!input||!field)return;field.classList.toggle('stage-derived',mode==='stages');input.disabled=mode==='stages';});
 const inflation=section.querySelector('[data-param="workInflation"]')?.closest('.field');if(inflation&&mode==='stages')inflation.classList.add('stage-global');
}
function enhanceForms(data){
 document.querySelectorAll('.form-section').forEach(section=>{
  const title=section.querySelector('h2')?.textContent||'';if(!title.includes('Orçamento e implantação'))return;
  section.querySelector('.work-stage-manager')?.remove();const head=section.querySelector('.panel-head');head?.insertAdjacentElement('afterend',manager(data));applyDerivedState(section,data.params.workMode);
  if(data.params.workMode==='stages'){const note=section.querySelector('.form-note');if(note)note.textContent='Os campos consolidados ficam bloqueados porque são derivados das etapas. A inflação de custos é global; orçamento, início, duração, contingência e curva são definidos em cada etapa.';}
 });
}
function timeline(data){
 const stages=data.result.stages||[],start=Math.min(...stages.map(s=>s.start)),end=Math.max(...stages.map(s=>s.end)),span=Math.max(1,end-start+1),colors=['#497d58','#bb914a','#648693','#8b6f58','#78966c','#9a775f'];
 const rows=stages.map((s,i)=>'<div class="stage-timeline-row"><strong>'+esc(s.name)+'</strong><div class="stage-timeline-track"><i style="left:'+((s.start-start)/span*100)+'%;width:'+(s.duration/span*100)+'%;background:'+colors[i%colors.length]+'"><span>M'+s.start+'–M'+s.end+'</span></i></div><b>'+money(s.nominalTotal)+'</b></div>').join('');
 const table='<div class="table-wrap stage-table"><table><thead><tr><th>Etapa</th><th>Início</th><th>Fim</th><th>Orçamento-base</th><th>Contingência</th><th>Com contingência</th><th>Nominal projetado</th></tr></thead><tbody>'+stages.map(s=>'<tr><td>'+esc(s.name)+'</td><td>M'+s.start+'</td><td>M'+s.end+'</td><td>'+money(s.budget)+'</td><td>'+fmt(s.contingency,1)+'%</td><td>'+money(s.baseWithContingency)+'</td><td>'+money(s.nominalTotal)+'</td></tr>').join('')+'</tbody></table></div>';
 const wrap=document.createElement('div');wrap.className='stage-timeline';wrap.innerHTML='<div class="stage-timeline-axis"><span>M'+start+'</span><span>M'+end+'</span></div>'+rows+'<p>As barras mostram o período de execução; os valores à direita já incluem contingência e inflação no tempo.</p>'+table;return wrap;
}
function enhanceWorks(data){
 const panel=Array.from(document.querySelectorAll('.panel')).find(x=>x.querySelector('h2')?.textContent.trim()==='Modelador da distribuição física');
 if(!panel||data.params.workMode!=='stages')return;
 const head=panel.querySelector('.panel-head');if(head){head.querySelector('h2').textContent='Cronograma consolidado por etapas';const sub=head.querySelector('.panel-sub');if(sub)sub.textContent='Cada etapa possui orçamento, início, duração, contingência e curva próprios.';}
 Array.from(panel.children).forEach(child=>{if(child!==head)child.remove();});panel.appendChild(timeline(data));
 const cron=Array.from(document.querySelectorAll('.panel')).find(x=>x.querySelector('h2')?.textContent.trim()==='Cronograma detalhado');if(cron){const sub=cron.querySelector('.panel-sub');if(sub)sub.textContent='Desembolso mensal consolidado de todas as etapas. O detalhamento por etapa aparece acima.';}
}
function enhanceReport(data){
 if(data.params.workMode!=='stages')return;const report=document.querySelector('.report');if(!report||report.querySelector('.work-stages-report'))return;
 const block=document.createElement('div');block.className='report-block work-stages-report';block.innerHTML='<h3>03A · Etapas da implantação</h3><div class="report-stage-grid">'+data.result.stages.map(s=>'<div><span>'+esc(s.name)+'</span><b>M'+s.start+'–M'+s.end+'</b><small>'+money(s.budget)+' base · '+money(s.nominalTotal)+' nominal</small></div>').join('')+'</div>';
 const blocks=report.querySelectorAll('.report-block');const target=Array.from(blocks).find(x=>x.querySelector('h3')?.textContent.startsWith('04'));target?report.insertBefore(block,target):report.appendChild(block);
}
function enhance(){const data=active();if(!data)return;enhanceForms(data);enhanceWorks(data);enhanceReport(data);}
let scheduled=false;function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance();});}

document.addEventListener('click',event=>{
 const button=event.target.closest('[data-stage-action]');if(!button)return;const data=active();if(!data)return;let stages=clone(data.params.workStages),index=Number(button.dataset.stageIndex),action=button.dataset.stageAction;
 if(action==='mode-stages'){enableStages(data);return;}if(action==='mode-single'){dispatch('workMode','single');return;}
 if(action==='add'){const last=stages.at(-1),start=last?Math.min(119,last.start+last.duration):data.params.workStart;stages.push(normalizeStage({name:'Etapa '+(stages.length+1),budget:0,start,duration:12,contingency:data.params.contingency,curve:'s'},stages.length,{start,duration:12,contingency:data.params.contingency}));commitStages(stages);return;}
 if(action==='preset'){
  const total=data.params.work||stages.reduce((a,s)=>a+s.budget,0),start=data.params.workStart||0,duration=Math.max(6,data.params.duration||24),d1=Math.max(3,Math.round(duration*.50)),d2=Math.max(3,Math.round(duration*.55)),d3=Math.max(3,Math.round(duration*.40));
  stages=[{id:uid(),name:'Etapa 1 — Infraestrutura essencial',budget:total*.45,start,duration:d1,contingency:data.params.contingency,curve:'early',weights:[]},{id:uid(),name:'Etapa 2 — Infraestrutura complementar',budget:total*.35,start:start+Math.round(duration*.25),duration:d2,contingency:data.params.contingency,curve:'s',weights:[]},{id:uid(),name:'Etapa 3 — Lazer e amenidades',budget:total*.20,start:start+Math.round(duration*.60),duration:d3,contingency:data.params.contingency,curve:'late',weights:[]}].map((s,i)=>normalizeStage(s,i,{start,duration,contingency:data.params.contingency}));commitStages(stages);return;
 }
 if(!Number.isInteger(index)||!stages[index])return;
 if(action==='delete'&&stages.length>1)stages.splice(index,1);
 if(action==='duplicate'){const copy=clone(stages[index]);copy.id=uid();copy.name=(copy.name+' · cópia').slice(0,80);copy.start=Math.min(119,copy.start+copy.duration);if(copy.start+copy.duration-1>120)copy.start=Math.max(0,120-copy.duration+1);stages.splice(index+1,0,copy);}
 if(action==='up'&&index>0)[stages[index-1],stages[index]]=[stages[index],stages[index-1]];
 if(action==='down'&&index<stages.length-1)[stages[index+1],stages[index]]=[stages[index],stages[index+1]];
 commitStages(stages);
});
document.addEventListener('change',event=>{
 const field=event.target.closest('[data-stage-field]'),weight=event.target.closest('[data-stage-weight]');if(!field&&!weight)return;const data=active();if(!data)return;const stages=clone(data.params.workStages);
 if(field){const index=Number(field.dataset.stageIndex),key=field.dataset.stageField;if(!stages[index])return;let value=field.value;if(['budget','start','duration','contingency'].includes(key))value=Number(value);if(key==='duration'){value=Math.max(1,Math.round(value));if(stages[index].curve==='custom')stages[index].weights=resample(stages[index].weights,value);}if(key==='start')value=Math.max(0,Math.round(value));if(key==='curve'&&value==='custom')stages[index].weights=baseCurve('s',stages[index].duration);stages[index][key]=value;}
 if(weight){const index=Number(weight.dataset.stageWeight),wi=Number(weight.dataset.weightIndex);if(!stages[index])return;const values=resample(stages[index].weights,stages[index].duration).map(v=>v*100);values[wi]=Math.max(0,Number(weight.value)||0);const sum=values.reduce((a,b)=>a+b,0)||1;stages[index].weights=values.map(v=>v/sum);}
 commitStages(stages);
});

document.addEventListener('DOMContentLoaded',()=>{bridge();schedule();});
const root=document.getElementById('app');if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
window.addEventListener('storage',schedule);schedule();
})();
