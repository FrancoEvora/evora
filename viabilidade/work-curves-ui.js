/* Évora Viabilidade · Prévia e restauração da curva de implantação. */
(function(){
'use strict';
const E=window.EvoraEngine,C=E&&E.workCurves,ROOT=document.getElementById('app');
if(!C||!ROOT||window.EvoraWorkCurvesUI)return;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(value,digits=2)=>Number.isFinite(value)?value.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
const money=value=>Number.isFinite(value)?value.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}):'—';
const models=()=>C.models.filter(model=>model.id!=='custom');
let contextKey='',target='all',selected='',durationDraft=null,manual=[],preview=null,message='',notice='',view='cumulative',revision=0,scheduled=false;

function state(){return window.EvoraApp?.getState?.()||null;}
function signature(data){return JSON.stringify(data.params);}
function key(data){return data.projectId+'|'+signature(data);}
function reset(){target='all';selected='';durationDraft=null;manual=[];preview=null;message='';notice='';revision++;}
function hasOriginal(data){
 try{return C.hasOriginal(data.params,target);}catch(error){message=error.message||'A referência original não está disponível.';return false;}
}
function getScope(result,scope=target){
 if(scope!=='all'&&result.p.workMode==='stages'){
  const stage=(result.stages||[]).find(item=>'stage:'+item.id===scope);
  if(!stage)throw new Error('A etapa selecionada não está mais disponível.');
  return {start:stage.start,weights:stage.weights,label:stage.name};
 }
 return {start:result.p.workStart,weights:result.workWeights,label:result.p.workMode==='stages'?'Todas as etapas':'Obra única'};
}
function manualScope(data){
 if(data.params.workMode==='stages'&&target==='all')return null;
 return getScope(data.result);
}
function durationLimit(data){
 return data.params.workMode==='stages'?Math.min(120,121-getScope(data.result).start):120;
}
function readDuration(data){
 const value=Number(durationDraft),limit=durationLimit(data);
 if(durationDraft===null||String(durationDraft).trim()===''||!Number.isInteger(value)||value<1||value>limit)throw new Error('Informe um prazo inteiro de 1 a '+limit+' meses para este escopo.');
 return value;
}
function durationEditor(data){
 const current=getScope(data.result),label=data.params.workMode==='stages'&&target!=='all'?'Prazo pretendido da etapa':'Prazo pretendido da obra';
 return '<div class="wc-duration-tools"><label class="wc-duration-field"><span>'+label+'</span><div class="wc-duration-input"><input type="number" min="1" max="'+durationLimit(data)+'" step="1" inputmode="numeric" value="'+esc(durationDraft)+'" data-wc-duration aria-label="'+label+'" aria-describedby="wc-duration-help"><span>meses</span></div><small id="wc-duration-help">Prazo atual: '+current.weights.length+' meses. O novo prazo só será salvo ao aplicar.</small></label><button type="button" class="button" data-wc-action="update-preview">Atualizar prévia</button></div>';
}
function scheduleContext(data){
 const scope=getScope(data.result,'all'),end=scope.start+scope.weights.length-1;
 const source=data.params.workMode==='stages'?'A conclusão vem do término da última etapa cadastrada.':'O período vem do início e da duração cadastrados para a obra.';
 return '<div class="wc-current-schedule" data-wc-current-schedule><div><span class="eyebrow">CRONOGRAMA VIGENTE</span><strong>Implantação total · M'+scope.start+' a M'+end+' · '+scope.weights.length+' meses</strong><p>'+source+' Teste outro prazo no campo “Prazo pretendido” abaixo, com a curva atual ou um novo modelo.</p></div><button type="button" class="button small" data-wc-action="edit-period">Editar prazos e orçamento</button></div>';
}
function miniature(id){
 let weights;
 try{weights=C.weightsFor(id,24);}catch{weights=C.weightsFor('s',24);}
 let total=0;const points=['3,43',...weights.map((weight,i)=>{total+=weight;return (3+(i+1)/weights.length*112).toFixed(2)+','+(43-total*36).toFixed(2);})];
 return '<svg viewBox="0 0 120 49" aria-hidden="true"><path d="M3 6V43H117" class="wc-mini-axis"/><polyline points="'+points.join(' ')+'" class="wc-mini-line"/></svg>';
}
function originalNote(data){
 let original;try{original=C.readOriginal(data.params);}catch(error){return error.message;}
 const available=hasOriginal(data);
 if(!available)return 'Antes da primeira alteração de curva ou prazo, a distribuição atual, o início e o prazo serão guardados como referência original deste empreendimento.';
 const date=original?.savedAt?new Date(original.savedAt):null;
 return 'Referência original preservada'+(date&&!Number.isNaN(date.valueOf())?' em '+date.toLocaleDateString('pt-BR'):'')+'. A restauração recupera a distribuição, o início e o prazo originais. Orçamento, contingência, inflação e entregáveis são mantidos.';
}
function manualEditor(data){
 if(selected!=='custom')return '';
 const scope=manualScope(data);
 if(!scope)return '<p class="wc-message" role="status">Selecione uma etapa acima para editar os seus pesos mensais. Cada etapa mantém seu próprio início e prazo de execução.</p>';
 return '<div class="wc-manual"><div class="wc-subhead"><div><h3>Ajuste os pesos mensais</h3><p>Use valores não negativos. A distribuição será normalizada para totalizar 100%.</p></div></div><div class="wc-weight-grid">'+manual.map((value,i)=>'<label><span>'+(scope.relative?'Mês '+(i+1):'M'+(scope.start+i))+'</span><input type="number" min="0" step="any" inputmode="decimal" value="'+esc(value)+'" data-wc-weight="'+i+'" aria-label="Peso '+(scope.relative?'do mês '+(i+1)+' de cada etapa':'da obra em M'+(scope.start+i))+'"></label>').join('')+'</div><div class="wc-manual-actions"><p data-wc-weight-total>'+manualTotal()+'</p><button type="button" class="button small" data-wc-action="update-manual">Atualizar prévia</button></div></div>';
}
function manualTotal(){
 const values=manual.map(value=>value===''?NaN:Number(value));
 return values.some(value=>!Number.isFinite(value)||value<0)?'Preencha todos os pesos com números não negativos.':'Soma dos pesos: '+number(values.reduce((sum,value)=>sum+value,0))+'. O total aplicado será 100%.';
}
function series(data){
 const result=[{id:'current',label:'Atual',color:'#6c8590',dash:'',scope:getScope(data.result)}];
 if(hasOriginal(data)){
  try{result.push({id:'original',label:'Original',color:'#b48b43',dash:'5 5',scope:getScope(E.simulate(C.restore(data.params,target),true))});}catch{}
 }
 if(preview)result.push({id:'proposal',label:preview.kind==='restore'?'Restauração proposta':'Proposta',color:'#245a42',dash:'',scope:getScope(preview.result)});
 return result;
}
function chartData(items){
 const start=Math.min(...items.map(item=>item.scope.start)),end=Math.max(...items.map(item=>item.scope.start+item.scope.weights.length-1));
 const first=view==='cumulative'?start-1:start,rows=[];
 for(let month=first;month<=end;month++){
  const row={month};
  for(const item of items){
   const index=month-item.scope.start;
   row[item.id]=100*(view==='monthly'?(item.scope.weights[index]||0):item.scope.weights.slice(0,Math.max(0,index+1)).reduce((sum,value)=>sum+value,0));
  }
  rows.push(row);
 }
 return rows;
}
function chartHTML(items){
 const rows=chartData(items),W=880,H=305,L=58,R=24,T=42,B=40;
 const first=rows[0].month,last=rows.at(-1).month,span=Math.max(1,last-first);
 const peak=Math.max(1,...rows.flatMap(row=>items.map(item=>row[item.id]))),top=view==='cumulative'?100:Math.ceil(peak/5)*5;
 const x=month=>L+(month-first)/span*(W-L-R),y=value=>T+(1-value/top)*(H-T-B);
 let drawing='';
 for(let i=0;i<=4;i++){
  const value=top*i/4,yy=y(value);drawing+='<line class="wc-chart-grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+yy+'" y2="'+yy+'"/><text x="'+(L-9)+'" y="'+(yy+4)+'" text-anchor="end">'+number(value,top<5?1:0)+'%</text>';
 }
 const ticks=[...new Set(Array.from({length:7},(_,i)=>Math.round(first+(last-first)*i/6)))];
 ticks.forEach(month=>{drawing+='<text x="'+x(month)+'" y="'+(H-14)+'" text-anchor="middle">'+(month<0?'Início':'M'+month)+'</text>';});
 items.forEach(item=>{
  const path=rows.map((row,i)=>(i?'L':'M')+x(row.month).toFixed(2)+','+y(row[item.id]).toFixed(2)).join(' ');
  drawing+='<path d="'+path+'" fill="none" stroke="'+item.color+'" stroke-width="'+(item.id==='proposal'?3:2)+'" '+(item.dash?'stroke-dasharray="'+item.dash+'"':'')+' stroke-linejoin="round"/>';
  if(rows.length===1)drawing+='<circle cx="'+x(rows[0].month)+'" cy="'+y(rows[0][item.id])+'" r="4" fill="'+item.color+'"/>';
 });
 const currentScope=items[0].scope,currentEnd=currentScope.start+currentScope.weights.length-1,proposal=items.find(item=>item.id==='proposal'),proposedEnd=proposal?proposal.scope.start+proposal.scope.weights.length-1:null;
 drawing+='<line class="wc-chart-end" data-wc-end="'+currentEnd+'" x1="'+x(currentEnd)+'" x2="'+x(currentEnd)+'" y1="'+T+'" y2="'+(H-B)+'"/><text class="wc-chart-end-label" x="'+Math.max(L+155,x(currentEnd)-5)+'" y="14" text-anchor="end">'+(proposedEnd===currentEnd?'Fim atual e proposto':'Fim atual')+' · M'+currentEnd+'</text>';
 if(proposedEnd!==null&&proposedEnd!==currentEnd)drawing+='<line class="wc-chart-proposed-end" data-wc-proposed-end="'+proposedEnd+'" x1="'+x(proposedEnd)+'" x2="'+x(proposedEnd)+'" y1="'+T+'" y2="'+(H-B)+'"/><text class="wc-chart-proposed-end-label" x="'+Math.max(L+120,x(proposedEnd)-5)+'" y="29" text-anchor="end">Fim proposto · M'+proposedEnd+'</text>';
 drawing+='<line class="wc-chart-cursor" data-wc-cursor x1="'+x(last)+'" x2="'+x(last)+'" y1="'+T+'" y2="'+(H-B)+'"/>';
 const title=view==='cumulative'?'Implantação acumulada':'Distribuição mensal da implantação';
 return '<div class="wc-chart-head"><div><h3>'+title+'</h3><p>Percentual do orçamento-base'+(target==='all'&&items[0].scope.label==='Todas as etapas'?' · etapas ponderadas pelo orçamento':'')+'.</p></div><div class="segmented" role="group" aria-label="Visualização da curva"><button type="button" data-wc-view="monthly" aria-pressed="'+(view==='monthly')+'" class="'+(view==='monthly'?'active':'')+'">Mensal</button><button type="button" data-wc-view="cumulative" aria-pressed="'+(view==='cumulative')+'" class="'+(view==='cumulative'?'active':'')+'">Acumulada</button></div></div><div class="wc-legend">'+items.map(item=>'<span><i style="border-color:'+item.color+';border-top-style:'+(item.dash?'dashed':'solid')+'"></i>'+esc(item.label)+'</span>').join('')+'</div><svg class="wc-chart" viewBox="0 0 '+W+' '+H+'" tabindex="0" role="img" aria-label="'+title+'. Use as setas para consultar os meses." data-wc-chart>'+drawing+'</svg><div class="wc-chart-readout" data-wc-readout role="status" aria-live="polite"></div><details class="wc-table-details"><summary>Consultar percentuais por mês</summary><div class="table-wrap"><table><caption class="wc-sr-only">'+title+' em percentuais</caption><thead><tr><th>Mês</th>'+items.map(item=>'<th>'+esc(item.label)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr><td>'+(row.month<0?'Antes de M0':'M'+row.month)+'</td>'+items.map(item=>'<td>'+number(row[item.id])+'%</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>';
}
function metrics(data){
 if(!preview)return '';
 const current=data.result.totals,proposed=preview.result.totals;
 const entries=[['Desembolso nominal da obra','work'],['Exposição máxima de caixa','peak'],['Aportes adicionais necessários','extra']];
 return '<div class="wc-financial"><h3>Impacto no empreendimento inteiro</h3><div class="wc-metrics">'+entries.map(([label,field])=>'<div><span>'+label+'</span><strong>'+money(proposed[field])+'</strong><small>Atual: '+money(current[field])+'</small><small>Variação: '+(proposed[field]-current[field]>0?'+':'')+money(proposed[field]-current[field])+'</small></div>').join('')+'</div><p>O orçamento-base é preservado. A distribuição dos pagamentos pode alterar a inflação acumulada, a exposição de caixa e a necessidade de capital.</p></div>';
}
function previewStatus(data){
 if(!preview)return '<div class="wc-preview-empty"><strong>Teste um prazo ou escolha um modelo para comparar.</strong><p>“Atualizar prévia” permite testar o prazo mantendo a curva atual. O estudo só muda quando você aplicar.</p></div>';
 const scope=getScope(preview.result),first=scope.start,last=first+scope.weights.length-1,current=getScope(data.result),currentEnd=current.start+current.weights.length-1;
 const label=preview.kind==='restore'?'Restauração da implantação original':selected?C.models.find(model=>model.id===selected)?.label||'Curva manual':'Prazo proposto · curvas atuais preservadas';
 return '<div class="wc-preview-status"><span class="pill green">PRÉVIA · AINDA NÃO APLICADA</span><p><strong>'+esc(label)+'</strong> · '+esc(scope.label)+' · M'+first+' a M'+last+' · distribuição total de '+number(scope.weights.reduce((sum,value)=>sum+value,0)*100)+'%.</p><div class="wc-period-comparison" data-wc-period-comparison><span>Prazo<strong>'+current.weights.length+' → '+scope.weights.length+' meses</strong></span><span>Conclusão<strong>M'+currentEnd+' → M'+last+'</strong></span></div>'+(preview.kind==='restore'?'<p>A aplicação recuperará o início, o prazo e a distribuição originais das etapas com referência salva. Orçamento e demais premissas permanecem como estão.</p>':'')+'</div>'+stagePeriods(data);
}
function stagePeriods(data){
 if(!preview||data.params.workMode!=='stages'||target!=='all')return '';
 const current=data.result.stages||[],proposed=preview.result.stages||[];
 if(!current.some(stage=>{const next=proposed.find(item=>item.id===stage.id);return next&&(next.start!==stage.start||next.duration!==stage.duration);} ))return '';
 return '<div class="wc-stage-periods" data-wc-stage-periods><h3>Períodos das etapas</h3><p>'+(preview.kind==='restore'?'A prévia recupera os períodos originais das etapas com referência salva.':'Os inícios e os prazos das etapas foram ajustados proporcionalmente ao prazo total, com arredondamento para meses inteiros. O ajuste não considera dependências entre atividades; revise a sequência antes de aplicar.')+'</p><div class="table-wrap"><table><thead><tr><th>Etapa</th><th>Período atual</th><th>Período proposto</th></tr></thead><tbody>'+current.map(stage=>{const next=proposed.find(item=>item.id===stage.id)||stage;return '<tr><td>'+esc(stage.name)+'</td><td>M'+stage.start+'–M'+(stage.start+stage.duration-1)+' · '+stage.duration+' meses</td><td>M'+next.start+'–M'+(next.start+next.duration-1)+' · '+next.duration+' meses</td></tr>';}).join('')+'</tbody></table></div></div>';
}
function applyLabel(data){
 if(preview?.kind==='restore')return 'Aplicar restauração';
 if(!selected)return 'Aplicar prazo';
 if(preview&&getScope(preview.result).weights.length!==getScope(data.result).weights.length)return 'Aplicar prazo e modelo';
 return data.params.workMode==='stages'&&target==='all'?'Aplicar modelo a todas as etapas':'Aplicar modelo';
}
function renderPanel(panel,data){
 const choices=C.scopes(data.params),scope=getScope(data.result),originalAvailable=hasOriginal(data);
 const items=series(data);
 panel.innerHTML='<div class="panel-head"><div><p class="eyebrow">PLANEJAMENTO DA IMPLANTAÇÃO</p><h2>Modelar curva de implantação</h2><p class="panel-sub">Compare ritmos de execução, aplique a distribuição desejada e volte à referência original quando precisar.</p></div></div>'+scheduleContext(data)+'<div class="wc-scope-row"><label class="wc-scope"><span>Modelar</span><select data-wc-scope aria-label="Selecionar obra ou etapa para modelar">'+choices.map(choice=>'<option value="'+esc(choice.id)+'" '+(choice.id===target?'selected':'')+'>'+esc(choice.label)+'</option>').join('')+'</select></label><div class="wc-scope-detail"><strong>'+esc(scope.label)+'</strong><span>M'+scope.start+' a M'+(scope.start+scope.weights.length-1)+' · '+scope.weights.length+' meses</span></div></div>'+durationEditor(data)+'<div class="wc-models" role="group" aria-label="Modelos de distribuição">'+models().map(model=>'<button type="button" class="wc-model '+(selected===model.id?'is-selected':'')+'" data-wc-model="'+esc(model.id)+'" aria-pressed="'+(selected===model.id)+'">'+miniature(model.id)+'<strong>'+esc(model.label)+'</strong><span>'+esc(model.description)+'</span></button>').join('')+'<button type="button" class="wc-model wc-model-manual '+(selected==='custom'?'is-selected':'')+'" data-wc-model="custom" aria-pressed="'+(selected==='custom')+'"><span class="wc-manual-icon" aria-hidden="true">↕</span><strong>Manual</strong><span>Defina o peso de cada mês e acompanhe a distribuição.</span></button></div>'+(data.params.workMode==='stages'&&target==='all'?'<p class="wc-all-note">Ao manter o prazo total, o modelo preserva o início e a duração de cada etapa. Ao alterar o prazo total, os inícios e as durações são ajustados proporcionalmente. Os orçamentos são mantidos.</p>':'')+manualEditor(data)+'<div class="wc-message '+(message?'':'wc-hidden')+'" data-wc-message role="alert">'+esc(message)+'</div><div class="wc-notice '+(notice?'':'wc-hidden')+'" role="status">'+esc(notice)+'</div><div class="wc-comparison">'+previewStatus(data)+chartHTML(items)+metrics(data)+'</div><div class="wc-actions"><button type="button" class="button primary" data-wc-action="apply" '+(!preview?'disabled':'')+'>'+applyLabel(data)+'</button><button type="button" class="button" data-wc-action="discard" '+(!preview&&!selected&&durationDraft===String(getScope(data.result).weights.length)?'disabled':'')+'>Descartar prévia</button></div><div class="wc-original"><div><strong>Implantação original</strong><p>'+esc(originalNote(data))+'</p></div><button type="button" class="button small" data-wc-action="restore" '+(!originalAvailable?'disabled':'')+'>Restaurar curva original</button></div>';
 bindChart(panel,items);
}
function bindChart(panel,items){
 const svg=panel.querySelector('[data-wc-chart]'),readout=panel.querySelector('[data-wc-readout]'),cursor=panel.querySelector('[data-wc-cursor]');
 const rows=chartData(items),first=rows[0].month,last=rows.at(-1).month,span=Math.max(1,last-first);let current=rows.length-1;
 function show(index){
  current=Math.max(0,Math.min(rows.length-1,index));const row=rows[current],x=58+(row.month-first)/span*(880-58-24);
  cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);
  readout.innerHTML='<strong>'+(row.month<0?'Antes de M0':'M'+row.month)+'</strong>'+items.map(item=>'<span>'+esc(item.label)+': <b>'+number(row[item.id])+'%</b></span>').join('');
 }
 svg.addEventListener('pointermove',event=>{const box=svg.getBoundingClientRect(),x=(event.clientX-box.left)/box.width*880,month=first+(x-58)/(880-58-24)*span;show(Math.round(month-first));});
 svg.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();show(event.key==='Home'?0:event.key==='End'?rows.length-1:current+(event.key==='ArrowRight'?1:-1));});
 show(current);
}
function sync(){
 const data=state();
 if(!data||data.tab!=='works'||(location.hash&&location.hash!=='#works')||data.error||data.params.blankDraft||!data.result){
  if(contextKey){contextKey='';reset();}
  ROOT.querySelector('[data-work-curves]')?.remove();return;
 }
 const nextKey=key(data);if(nextKey!==contextKey){contextKey=nextKey;reset();}
 const choices=C.scopes(data.params);if(!choices.some(choice=>choice.id===target)){target='all';selected='';durationDraft=null;manual=[];preview=null;revision++;}
 if(durationDraft===null)durationDraft=String(getScope(data.result).weights.length);
 let panel=ROOT.querySelector('[data-work-curves]');
 if(!panel){
  const main=ROOT.querySelector('main.content');if(!main)return;
  panel=document.createElement('section');panel.className='panel work-curves-panel';panel.dataset.workCurves='1';
  const kpis=main.querySelector(':scope > .kpis');
  if(kpis)kpis.after(panel);else main.querySelector('.form-section')?.before(panel);
  if(!panel.isConnected)return;
 }
 const renderKey=String(revision);if(panel.dataset.renderKey===renderKey)return;
 renderPanel(panel,data);panel.dataset.renderKey=renderKey;
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;sync();});}
function makePreview(kind){
 const data=state();if(!data||key(data)!==contextKey){schedule();return;}
 message='';notice='';preview=null;
 if(kind==='restore'){selected='';manual=[];}
 try{
  let next;
  if(kind==='restore'){
   next=C.restore(data.params,target);
   durationDraft=String(C.scopes(next).find(scope=>scope.id===target).duration);
  }
  else{
   const duration=readDuration(data);
   let resized=C.resizeDuration(data.params,duration,target),weights;
   if(selected==='custom'){
    if(!manualScope(data))throw new Error('Selecione uma etapa para editar os pesos de seu prazo.');
    if(manual.length){
     if(manual.some(value=>String(value).trim()===''))throw new Error('Informe um peso para cada mês. Use zero nos meses sem execução.');
     weights=manual.map(Number);
     if(weights.some(value=>!Number.isFinite(value)||value<0)||!Number.isFinite(weights.reduce((sum,value)=>sum+value,0))||weights.reduce((sum,value)=>sum+value,0)<=0)throw new Error('Use pesos não negativos, com soma maior que zero.');
     if(manual.length!==duration){
      const previousLength=manual.length;
      const edited=C.applyModel(C.resizeDuration(data.params,previousLength,target),'custom',target,weights);
      resized=C.resizeDuration(edited,duration,target);
      weights=C.currentWeights(resized,target);
      manual=weights.map(weight=>Number((weight*100).toFixed(8)).toString());
      notice='Os pesos manuais foram redistribuídos de '+previousLength+' para '+duration+' meses. Revise os novos valores antes de aplicar.';
     }
    }else{
     weights=C.currentWeights(resized,target);
     manual=weights.map(weight=>Number((weight*100).toFixed(8)).toString());
    }
   }
   next=selected?C.applyModel(resized,selected,target,weights):resized;
  }
  const result=E.simulate(next,true);
  preview={kind:kind==='restore'?'restore':selected?'model':'duration',params:next,result,projectId:data.projectId,signature:signature(data),target};
 }catch(error){message=error.message||'Não foi possível preparar esta curva.';}
 revision++;sync();
}
document.addEventListener('click',event=>{
 const model=event.target.closest?.('[data-wc-model]'),viewButton=event.target.closest?.('[data-wc-view]'),action=event.target.closest?.('[data-wc-action]');
 if(!model&&!viewButton&&!action)return;
 const data=state();if(!data||data.tab!=='works'||(location.hash&&location.hash!=='#works'))return;
 if(key(data)!==contextKey){sync();return;}
 if(viewButton){view=viewButton.dataset.wcView;revision++;sync();return;}
 if(model){
  const previousSelection=selected;selected=model.dataset.wcModel;preview=null;message='';notice='';
  if(selected==='custom'){
   const scope=manualScope(data);if(previousSelection!=='custom')manual=[];
   if(!scope){revision++;sync();return;}
  }
  makePreview('model');return;
 }
 const name=action.dataset.wcAction;
 if(name==='edit-period'){
  const input=data.params.workMode==='stages'?ROOT.querySelector('[data-stage-field="duration"]'):ROOT.querySelector('[data-param="duration"]');
  const section=input?.closest('.form-section');
  section?.scrollIntoView({behavior:'smooth',block:'start'});
  input?.focus({preventScroll:true});
  return;
 }
 if(name==='discard'){selected='';durationDraft=String(getScope(data.result).weights.length);manual=[];preview=null;message='';notice='';revision++;sync();return;}
 if(name==='restore'){makePreview('restore');return;}
 if(name==='update-manual'||name==='update-preview'){makePreview('model');return;}
 if(name==='apply'&&preview){
  const proposal=preview;
  if(proposal.projectId!==data.projectId||proposal.signature!==signature(data)){
   preview=null;message='O estudo mudou. Gere uma nova prévia antes de aplicar.';revision++;sync();return;
  }
  const outcome=window.EvoraApp.commitWorkCurve(proposal.params,proposal.projectId,proposal.signature);
  if(!outcome?.ok){message=outcome?.error||'Não foi possível aplicar a curva.';revision++;sync();return;}
  const latest=state();contextKey=key(latest);selected='';durationDraft=null;manual=[];preview=null;message='';
  notice=outcome.saved===false?'Implantação aplicada nesta sessão. O navegador não permitiu salvar; exporte o estudo em JSON.':proposal.kind==='restore'?'Implantação original restaurada e salva.':'Implantação aplicada e salva. A referência original continua disponível para restauração.';
  revision++;sync();
 }
});
document.addEventListener('change',event=>{
 const select=event.target.closest?.('[data-wc-scope]');if(!select)return;
 target=select.value;selected='';durationDraft=null;manual=[];preview=null;message='';notice='';revision++;sync();
});
document.addEventListener('input',event=>{
 const input=event.target.closest?.('[data-wc-weight], [data-wc-duration]');if(!input)return;
 const durationInput=input.hasAttribute('data-wc-duration');
 if(durationInput)durationDraft=input.value;else manual[Number(input.dataset.wcWeight)]=input.value;
 preview=null;message=(durationInput?'Prazo alterado.':'Pesos alterados.')+' Clique em “Atualizar prévia” para recalcular a comparação.';notice='';revision++;
 const panel=input.closest('[data-work-curves]');
 const total=panel.querySelector('[data-wc-weight-total]');if(total)total.textContent=manualTotal();
 const data=state(),apply=panel.querySelector('[data-wc-action="apply"]');apply.disabled=true;apply.textContent=applyLabel(data);
 panel.querySelector('[data-wc-action="discard"]').disabled=false;
 panel.querySelector('.wc-notice')?.classList.add('wc-hidden');
 const note=panel.querySelector('[data-wc-message]');note.textContent=message;note.classList.remove('wc-hidden');
 const items=series(data);
 panel.querySelector('.wc-comparison').innerHTML=previewStatus(data)+chartHTML(items);
 bindChart(panel,items);panel.dataset.renderKey=String(revision);
});
new MutationObserver(schedule).observe(ROOT,{childList:true});
window.addEventListener('hashchange',schedule);
window.addEventListener('storage',schedule);
window.EvoraWorkCurvesUI={refresh:schedule};
schedule();
})();
