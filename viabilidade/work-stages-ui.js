/* Évora Viabilidade · Interface de etapas da obra v2.0 */
(function(){
'use strict';
const E=window.EvoraEngine,H=E&&E.workStageHelpers,STORE='evora.viabilidade.v1';
if(!E||!H||window.__workStagesUiV2)return;
window.__workStagesUiV2=true;

const clone=value=>JSON.parse(JSON.stringify(value));
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt=(value,digits=0)=>Number.isFinite(Number(value))?Number(value).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
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
function bridge(){
 let element=document.getElementById('work-stage-bridge-v2');
 if(!element){element=document.createElement('div');element.id='work-stage-bridge-v2';element.hidden=true;element.innerHTML='<input data-param="workStagesJson"><input data-param="workMode">';document.body.appendChild(element);}
 return element;
}
function dispatchParam(key,value){
 const input=bridge().querySelector('[data-param="'+key+'"]');
 input.value=String(value);
 input.dispatchEvent(new Event('change',{bubbles:true}));
}
function commitStages(stages){dispatchParam('workStagesJson',JSON.stringify(H.serializeStages(stages)));}
function createLegacyStage(params){return H.legacyStage(params);}
function enableStages(data){
 const stages=data.params.workStages.length?data.params.workStages:[createLegacyStage(data.params)];
 dispatchParam('workStagesJson',JSON.stringify(H.serializeStages(stages)));
 dispatchParam('workMode','stages');
}
function summary(data){
 const stages=data.result.stages||[];
 return {
  base:stages.reduce((sum,stage)=>sum+stage.budget,0),
  withContingency:stages.reduce((sum,stage)=>sum+stage.baseWithContingency,0),
  nominal:stages.reduce((sum,stage)=>sum+stage.nominalTotal,0),
  start:Math.min(...stages.map(stage=>stage.start)),
  end:Math.max(...stages.map(stage=>stage.end))
 };
}
function manualWeights(stage,index){
 if(stage.curve!=='custom')return '';
 const weights=H.resampleWeights(stage.weights,stage.duration);
 return '<details class="stage-manual"><summary>Ajustar pesos mensais</summary><div class="stage-weight-grid">'+weights.map((weight,weightIndex)=>'<label><span>M'+(stage.start+weightIndex)+'</span><input type="number" min="0" step="0.01" value="'+(weight*100).toFixed(3)+'" data-stage-weight="'+index+'" data-weight-index="'+weightIndex+'"></label>').join('')+'</div><p>Os valores são pesos relativos; a plataforma normaliza a soma para 100%.</p></details>';
}
function stageCard(stage,index,data){
 const calculated=(data.result.stages||[]).find(item=>item.id===stage.id);
 return '<article class="work-stage-card"><div class="work-stage-card-head"><div><span>ETAPA '+String(index+1).padStart(2,'0')+'</span><input class="stage-name" data-stage-field="name" data-stage-index="'+index+'" value="'+esc(stage.name)+'" aria-label="Nome da etapa"></div><div class="stage-actions"><button type="button" data-stage-action="up" data-stage-index="'+index+'" aria-label="Mover para cima">↑</button><button type="button" data-stage-action="down" data-stage-index="'+index+'" aria-label="Mover para baixo">↓</button><button type="button" data-stage-action="duplicate" data-stage-index="'+index+'">Duplicar</button><button type="button" data-stage-action="delete" data-stage-index="'+index+'" '+(data.params.workStages.length<=1?'disabled':'')+'>Excluir</button></div></div><div class="stage-fields"><label><span>Orçamento-base</span><small>R$</small><input type="number" min="0" step="1000" data-stage-field="budget" data-stage-index="'+index+'" value="'+stage.budget+'"></label><label><span>Início</span><small>mês</small><input type="number" min="0" max="119" step="1" data-stage-field="start" data-stage-index="'+index+'" value="'+stage.start+'"></label><label><span>Duração</span><small>meses</small><input type="number" min="1" max="120" step="1" data-stage-field="duration" data-stage-index="'+index+'" value="'+stage.duration+'"></label><label><span>Contingência</span><small>%</small><input type="number" min="0" max="100" step="0.1" data-stage-field="contingency" data-stage-index="'+index+'" value="'+stage.contingency+'"></label><label><span>Distribuição</span><small>curva</small><select data-stage-field="curve" data-stage-index="'+index+'">'+H.CURVES.map(curve=>'<option value="'+curve+'" '+(stage.curve===curve?'selected':'')+'>'+H.labels[curve]+'</option>').join('')+'</select></label></div><div class="stage-result"><span>M'+stage.start+' a M'+(stage.start+stage.duration-1)+'</span><span>Com contingência <b>'+money(stage.budget*(1+stage.contingency/100))+'</b></span><span>Nominal projetado <b>'+money(calculated&&calculated.nominalTotal||0)+'</b></span></div>'+manualWeights(stage,index)+'</article>';
}
function manager(data){
 const mode=data.params.workMode;
 const element=document.createElement('div');
 element.className='work-stage-manager';
 let content='<div class="stage-manager-empty"><strong>Obra única</strong><p>O orçamento e o cronograma são controlados pelos campos tradicionais. Ao ativar etapas, a configuração atual será preservada como a primeira fase.</p></div>';
 if(mode==='stages'){
  const s=summary(data);
  content='<div class="work-stage-summary"><div><span>ETAPAS</span><b>'+data.params.workStages.length+'</b></div><div><span>ORÇAMENTO-BASE</span><b>'+money(s.base)+'</b></div><div><span>COM CONTINGÊNCIAS</span><b>'+money(s.withContingency)+'</b></div><div><span>DESEMBOLSO NOMINAL</span><b>'+money(s.nominal)+'</b></div><div><span>CRONOGRAMA</span><b>M'+s.start+'–M'+s.end+'</b></div></div><div class="work-stage-list">'+data.params.workStages.map((stage,index)=>stageCard(stage,index,data)).join('')+'</div><div class="stage-manager-actions"><button type="button" class="button" data-stage-action="preset">Criar modelo em 3 etapas</button><button type="button" class="button primary" data-stage-action="add">+ Adicionar etapa</button></div><p class="stage-manager-note">O custo, o funding e a exposição são calculados pela soma mensal das etapas. A inflação da obra permanece global; orçamento, contingência, início, duração e curva são definidos por etapa.</p>';
 }
 element.innerHTML='<div class="stage-mode-head"><div><span>ESTRUTURA DA IMPLANTAÇÃO</span><h3>Divisão da obra em etapas</h3></div><div class="stage-mode-switch"><button type="button" data-stage-action="mode-single" class="'+(mode==='single'?'active':'')+'">Obra única</button><button type="button" data-stage-action="mode-stages" class="'+(mode==='stages'?'active':'')+'">Por etapas</button></div></div>'+content;
 return element;
}
function signature(data){return data.project.id+'|'+String(data.project.updated||'')+'|'+data.params.workMode+'|'+data.params.workStagesJson;}
function applyDerived(section,mode){
 ['work','contingency','workStart','duration','curve'].forEach(key=>{
  const input=section.querySelector('[data-param="'+key+'"]'),field=input&&input.closest('.field');
  if(!input||!field)return;
  field.classList.toggle('stage-derived',mode==='stages');
  input.disabled=mode==='stages';
 });
 const inflation=section.querySelector('[data-param="workInflation"]');
 if(inflation&&inflation.closest('.field'))inflation.closest('.field').classList.toggle('stage-global',mode==='stages');
}
function enhanceForms(data){
 const sig=signature(data);
 document.querySelectorAll('.form-section').forEach(section=>{
  const title=section.querySelector('h2')?.textContent||'';
  if(!title.includes('Orçamento e implantação'))return;
  if(section.dataset.stageSignature===sig)return;
  section.dataset.stageSignature=sig;
  section.querySelector('.work-stage-manager')?.remove();
  const head=section.querySelector('.panel-head');
  if(head)head.insertAdjacentElement('afterend',manager(data));
  applyDerived(section,data.params.workMode);
  if(data.params.workMode==='stages'){
   const note=section.querySelector('.form-note');
   if(note)note.textContent='Os campos consolidados ficam bloqueados porque são derivados das etapas. A inflação de custos continua global para todo o empreendimento.';
  }
 });
}
function timeline(data){
 const stages=data.result.stages||[];
 const start=Math.min(...stages.map(stage=>stage.start)),end=Math.max(...stages.map(stage=>stage.end)),span=Math.max(1,end-start+1);
 const colors=['#497d58','#bb914a','#648693','#8b6f58','#78966c','#9a775f'];
 const rows=stages.map((stage,index)=>'<div class="stage-timeline-row"><strong>'+esc(stage.name)+'</strong><div class="stage-timeline-track"><i style="left:'+((stage.start-start)/span*100)+'%;width:'+(stage.duration/span*100)+'%;background:'+colors[index%colors.length]+'"><span>M'+stage.start+'–M'+stage.end+'</span></i></div><b>'+money(stage.nominalTotal)+'</b></div>').join('');
 const table='<div class="table-wrap stage-table"><table><thead><tr><th>Etapa</th><th>Início</th><th>Fim</th><th>Orçamento-base</th><th>Contingência</th><th>Com contingência</th><th>Nominal projetado</th></tr></thead><tbody>'+stages.map(stage=>'<tr><td>'+esc(stage.name)+'</td><td>M'+stage.start+'</td><td>M'+stage.end+'</td><td>'+money(stage.budget)+'</td><td>'+fmt(stage.contingency,1)+'%</td><td>'+money(stage.baseWithContingency)+'</td><td>'+money(stage.nominalTotal)+'</td></tr>').join('')+'</tbody></table></div>';
 const element=document.createElement('div');
 element.className='stage-timeline';
 element.innerHTML='<div class="stage-timeline-axis"><span>M'+start+'</span><span>M'+end+'</span></div>'+rows+'<p>As barras mostram o período de execução. Os valores à direita incluem contingência e inflação conforme o mês do desembolso.</p>'+table;
 return element;
}
function enhanceWorks(data){
 if(data.params.workMode!=='stages')return;
 const panel=Array.from(document.querySelectorAll('.panel')).find(item=>item.querySelector('h2')?.textContent.trim()==='Modelador da distribuição física'||item.querySelector('h2')?.textContent.trim()==='Cronograma consolidado por etapas');
 if(!panel)return;
 const sig=signature(data);
 if(panel.dataset.stageTimelineSignature===sig)return;
 panel.dataset.stageTimelineSignature=sig;
 const head=panel.querySelector('.panel-head');
 if(head){head.querySelector('h2').textContent='Cronograma consolidado por etapas';const sub=head.querySelector('.panel-sub');if(sub)sub.textContent='Cada etapa possui orçamento, início, duração, contingência e curva próprios.';}
 Array.from(panel.children).forEach(child=>{if(child!==head)child.remove();});
 panel.appendChild(timeline(data));
 const detail=Array.from(document.querySelectorAll('.panel')).find(item=>item.querySelector('h2')?.textContent.trim()==='Cronograma detalhado');
 if(detail){const sub=detail.querySelector('.panel-sub');if(sub)sub.textContent='Desembolso mensal consolidado de todas as etapas. O detalhamento individual aparece acima.';}
}
function enhanceReport(data){
 if(data.params.workMode!=='stages')return;
 const report=document.querySelector('.report');
 if(!report||report.querySelector('.work-stages-report'))return;
 const block=document.createElement('div');
 block.className='report-block work-stages-report';
 block.innerHTML='<h3>03A · Etapas da implantação</h3><div class="report-stage-grid">'+data.result.stages.map(stage=>'<div><span>'+esc(stage.name)+'</span><b>M'+stage.start+'–M'+stage.end+'</b><small>'+money(stage.budget)+' base · '+money(stage.nominalTotal)+' nominal</small></div>').join('')+'</div>';
 const target=Array.from(report.querySelectorAll('.report-block')).find(item=>item.querySelector('h3')?.textContent.startsWith('04'));
 if(target)report.insertBefore(block,target);else report.appendChild(block);
}
function enhance(){const data=active();if(!data)return;enhanceForms(data);enhanceWorks(data);enhanceReport(data);}
let scheduled=false;
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance();});}
function safeStage(raw,index,data){return H.normalizeStage(raw,index,{start:data.params.workStart,duration:Math.max(1,data.params.duration),contingency:data.params.contingency});}

document.addEventListener('click',event=>{
 const button=event.target.closest('[data-stage-action]');
 if(!button)return;
 const data=active();if(!data)return;
 let stages=clone(data.params.workStages),index=Number(button.dataset.stageIndex),action=button.dataset.stageAction;
 if(action==='mode-stages'){enableStages(data);return;}
 if(action==='mode-single'){dispatchParam('workMode','single');return;}
 if(action==='add'){
  const last=stages.at(-1),start=last?Math.min(119,last.start+last.duration):data.params.workStart,duration=Math.min(12,121-start);
  stages.push(safeStage({name:'Etapa '+(stages.length+1),budget:0,start,duration,contingency:data.params.contingency,curve:'s'},stages.length,data));
  commitStages(stages);return;
 }
 if(action==='preset'){
  const total=data.params.work||stages.reduce((sum,stage)=>sum+stage.budget,0),start=data.params.workStart||0,duration=Math.max(6,data.params.duration||24),end=Math.min(120,start+duration-1);
  const stageDefs=[
   {name:'Etapa 1 — Infraestrutura essencial',budget:total*.45,start,duration:Math.max(2,Math.round((end-start+1)*.50)),curve:'early'},
   {name:'Etapa 2 — Infraestrutura complementar',budget:total*.35,start:start+Math.round((end-start+1)*.25),duration:Math.max(2,Math.round((end-start+1)*.55)),curve:'s'},
   {name:'Etapa 3 — Lazer e amenidades',budget:total*.20,start:start+Math.round((end-start+1)*.60),duration:Math.max(2,Math.round((end-start+1)*.40)),curve:'late'}
  ];
  stages=stageDefs.map((definition,i)=>{
   definition.start=Math.min(119,definition.start);definition.duration=Math.min(definition.duration,121-definition.start);definition.contingency=data.params.contingency;
   return safeStage({...definition,id:H.uid()},i,data);
  });
  commitStages(stages);return;
 }
 if(!Number.isInteger(index)||!stages[index])return;
 if(action==='delete'&&stages.length>1)stages.splice(index,1);
 if(action==='duplicate'){
  const copy=clone(stages[index]);copy.id=H.uid();copy.name=(copy.name+' · cópia').slice(0,80);copy.start=Math.min(119,copy.start+copy.duration);copy.duration=Math.min(copy.duration,121-copy.start);stages.splice(index+1,0,copy);
 }
 if(action==='up'&&index>0)[stages[index-1],stages[index]]=[stages[index],stages[index-1]];
 if(action==='down'&&index<stages.length-1)[stages[index+1],stages[index]]=[stages[index],stages[index+1]];
 commitStages(stages);
});
document.addEventListener('change',event=>{
 const field=event.target.closest('[data-stage-field]'),weight=event.target.closest('[data-stage-weight]');
 if(!field&&!weight)return;
 const data=active();if(!data)return;
 const stages=clone(data.params.workStages);
 if(field){
  const index=Number(field.dataset.stageIndex),key=field.dataset.stageField;if(!stages[index])return;
  let value=field.value;
  if(['budget','start','duration','contingency'].includes(key))value=Number(value);
  if(key==='duration'){value=Math.max(1,Math.round(value));value=Math.min(value,121-stages[index].start);if(stages[index].curve==='custom')stages[index].weights=H.resampleWeights(stages[index].weights,value);}
  if(key==='start'){value=Math.max(0,Math.min(119,Math.round(value)));stages[index].duration=Math.min(stages[index].duration,121-value);}
  if(key==='curve'&&value==='custom')stages[index].weights=H.standardWeights('s',stages[index].duration);
  stages[index][key]=value;
 }
 if(weight){
  const index=Number(weight.dataset.stageWeight),weightIndex=Number(weight.dataset.weightIndex);if(!stages[index])return;
  const values=H.resampleWeights(stages[index].weights,stages[index].duration).map(value=>value*100);values[weightIndex]=Math.max(0,Number(weight.value)||0);const sum=values.reduce((a,b)=>a+b,0)||1;stages[index].weights=values.map(value=>value/sum);
 }
 commitStages(stages);
});

document.addEventListener('DOMContentLoaded',()=>{bridge();schedule();});
const root=document.getElementById('app');
if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
window.addEventListener('storage',schedule);
schedule();
})();
