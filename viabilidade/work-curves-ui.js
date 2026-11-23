/* Évora Viabilidade · Prévia e restauração da curva de implantação. */
(function(){
'use strict';
const E=window.EvoraEngine,C=E&&E.workCurves,ROOT=document.getElementById('app');
if(!C||!ROOT||window.EvoraWorkCurvesUI)return;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(value,digits=2)=>Number.isFinite(value)?value.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
const money=value=>Number.isFinite(value)?value.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}):'—';
const models=()=>C.models.filter(model=>model.id!=='custom');
let contextKey='',target='all',selected='',manual=[],preview=null,message='',notice='',view='cumulative',revision=0,scheduled=false;

function state(){return window.EvoraApp?.getState?.()||null;}
function signature(data){return JSON.stringify(data.params);}
function key(data){return data.projectId+'|'+signature(data);}
function reset(){target='all';selected='';manual=[];preview=null;message='';notice='';revision++;}
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
 const rows=chartData(items),W=880,H=285,L=58,R=24,T=22,B=40;
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
 if(!preview)return '<div class="wc-preview-empty"><strong>Escolha um modelo para comparar.</strong><p>A seleção prepara uma prévia. O estudo só muda quando você aplicar.</p></div>';
 const scope=getScope(preview.result),first=scope.start,last=first+scope.weights.length-1;
 return '<div class="wc-preview-status"><span class="pill green">PRÉVIA · AINDA NÃO APLICADA</span><p><strong>'+esc(preview.kind==='restore'?'Restauração da implantação original':C.models.find(model=>model.id===selected)?.label||'Curva manual')+'</strong> · '+esc(scope.label)+' · M'+first+' a M'+last+' · distribuição total de '+number(scope.weights.reduce((sum,value)=>sum+value,0)*100)+'%.</p>'+(preview.kind==='restore'?'<p>A aplicação recuperará o início, o prazo e a distribuição originais das etapas com referência salva. Orçamento e demais premissas permanecem como estão.</p>':'')+'</div>';
}
function renderPanel(panel,data){
 const choices=C.scopes(data.params),scope=getScope(data.result),originalAvailable=hasOriginal(data);
 const items=series(data);
 panel.innerHTML='<div class="panel-head"><div><p class="eyebrow">PLANEJAMENTO DA IMPLANTAÇÃO</p><h2>Modelar curva de implantação</h2><p class="panel-sub">Compare ritmos de execução, aplique a distribuição desejada e volte à referência original quando precisar.</p></div></div><div class="wc-scope-row"><label class="wc-scope"><span>Modelar</span><select data-wc-scope aria-label="Selecionar obra ou etapa para modelar">'+choices.map(choice=>'<option value="'+esc(choice.id)+'" '+(choice.id===target?'selected':'')+'>'+esc(choice.label)+'</option>').join('')+'</select></label><div class="wc-scope-detail"><strong>'+esc(scope.label)+'</strong><span>M'+scope.start+' a M'+(scope.start+scope.weights.length-1)+' · '+scope.weights.length+' meses</span></div></div><div class="wc-models" role="group" aria-label="Modelos de distribuição">'+models().map(model=>'<button type="button" class="wc-model '+(selected===model.id?'is-selected':'')+'" data-wc-model="'+esc(model.id)+'" aria-pressed="'+(selected===model.id)+'">'+miniature(model.id)+'<strong>'+esc(model.label)+'</strong><span>'+esc(model.description)+'</span></button>').join('')+'<button type="button" class="wc-model wc-model-manual '+(selected==='custom'?'is-selected':'')+'" data-wc-model="custom" aria-pressed="'+(selected==='custom')+'"><span class="wc-manual-icon" aria-hidden="true">↕</span><strong>Manual</strong><span>Defina o peso de cada mês e acompanhe a distribuição.</span></button></div>'+(data.params.workMode==='stages'&&target==='all'?'<p class="wc-all-note">O modelo é aplicado dentro do prazo de cada etapa, mantendo seus inícios e orçamentos. A curva consolidada resulta da soma das etapas.</p>':'')+manualEditor(data)+'<div class="wc-message '+(message?'':'wc-hidden')+'" data-wc-message role="alert">'+esc(message)+'</div><div class="wc-notice '+(notice?'':'wc-hidden')+'" role="status">'+esc(notice)+'</div><div class="wc-comparison">'+previewStatus(data)+chartHTML(items)+metrics(data)+'</div><div class="wc-actions"><button type="button" class="button primary" data-wc-action="apply" '+(!preview?'disabled':'')+'>'+(preview?.kind==='restore'?'Aplicar restauração':data.params.workMode==='stages'&&target==='all'?'Aplicar modelo a todas as etapas':'Aplicar modelo')+'</button><button type="button" class="button" data-wc-action="discard" '+(!preview&&!selected?'disabled':'')+'>Descartar prévia</button></div><div class="wc-original"><div><strong>Implantação original</strong><p>'+esc(originalNote(data))+'</p></div><button type="button" class="button small" data-wc-action="restore" '+(!originalAvailable?'disabled':'')+'>Restaurar curva original</button></div>';
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
 const choices=C.scopes(data.params);if(!choices.some(choice=>choice.id===target)){target='all';selected='';manual=[];preview=null;revision++;}
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
  if(kind==='restore')next=C.restore(data.params,target);
  else{
   let weights;
   if(selected==='custom'){
    if(!manualScope(data))throw new Error('Selecione uma etapa para editar os pesos de seu prazo.');
    if(manual.some(value=>value===''))throw new Error('Informe um peso para cada mês. Use zero nos meses sem execução.');
    weights=manual.map(Number);
   }
   next=C.applyModel(data.params,selected,target,weights);
  }
  const result=E.simulate(next,true);
  preview={kind,params:next,result,projectId:data.projectId,signature:signature(data),target};
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
  selected=model.dataset.wcModel;preview=null;message='';notice='';
  if(selected==='custom'){
   const scope=manualScope(data);manual=scope?scope.weights.map(weight=>Number((weight*100).toFixed(8)).toString()):[];
   if(!scope){revision++;sync();return;}
  }
  makePreview('model');return;
 }
 const name=action.dataset.wcAction;
 if(name==='discard'){selected='';manual=[];preview=null;message='';notice='';revision++;sync();return;}
 if(name==='restore'){makePreview('restore');return;}
 if(name==='update-manual'){makePreview('model');return;}
 if(name==='apply'&&preview){
  const proposal=preview;
  if(proposal.projectId!==data.projectId||proposal.signature!==signature(data)){
   preview=null;message='O estudo mudou. Gere uma nova prévia antes de aplicar.';revision++;sync();return;
  }
  const outcome=window.EvoraApp.commitWorkCurve(proposal.params,proposal.projectId,proposal.signature);
  if(!outcome?.ok){message=outcome?.error||'Não foi possível aplicar a curva.';revision++;sync();return;}
  const latest=state();contextKey=key(latest);selected='';manual=[];preview=null;message='';
  notice=outcome.saved===false?'Curva aplicada nesta sessão. O navegador não permitiu salvar; exporte o estudo em JSON.':proposal.kind==='restore'?'Implantação original restaurada e salva.':'Curva aplicada e salva. A implantação original continua disponível para restauração.';
  revision++;sync();
 }
});
document.addEventListener('change',event=>{
 const select=event.target.closest?.('[data-wc-scope]');if(!select)return;
 target=select.value;selected='';manual=[];preview=null;message='';notice='';revision++;sync();
});
document.addEventListener('input',event=>{
 const input=event.target.closest?.('[data-wc-weight]');if(!input)return;
 manual[Number(input.dataset.wcWeight)]=input.value;preview=null;message='Pesos alterados. Clique em “Atualizar prévia” para recalcular a comparação.';notice='';revision++;
 const panel=input.closest('[data-work-curves]');
 panel.querySelector('[data-wc-weight-total]').textContent=manualTotal();
 panel.querySelector('[data-wc-action="apply"]').disabled=true;
 const note=panel.querySelector('[data-wc-message]');note.textContent=message;note.classList.remove('wc-hidden');
 const data=state(),items=series(data);
 panel.querySelector('.wc-comparison').innerHTML=previewStatus(data)+chartHTML(items);
 bindChart(panel,items);panel.dataset.renderKey=String(revision);
});
new MutationObserver(schedule).observe(ROOT,{childList:true});
window.addEventListener('hashchange',schedule);
window.addEventListener('storage',schedule);
window.EvoraWorkCurvesUI={refresh:schedule};
schedule();
})();
