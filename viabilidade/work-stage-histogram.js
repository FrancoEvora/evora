/* Évora Viabilidade · Desembolsos mensais do cronograma aplicado, por etapa. */
(function(){
'use strict';
const COLORS=Object.freeze(['#497d58','#bb914a','#648693','#8b6f58','#78966c','#9a775f','#8b7796','#6f8e8b']);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=value=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2});
const compact=value=>{
 const unit=value>=1e9?1e9:value>=1e6?1e6:value>=1e3?1e3:1,suffix=unit===1e9?' bi':unit===1e6?' mi':unit===1e3?' mil':'';
 return 'R$ '+(value/unit).toLocaleString('pt-BR',{maximumFractionDigits:unit===1?0:1})+suffix;
};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const bindings=new WeakMap();

/** Nominal amounts are read once from the stage schedule; no new allocation is made. */
function buildData(result){
 const source=Array.isArray(result?.stages)?result.stages:[],ids=new Set(),amounts=[];
 let start=Infinity,end=-Infinity;
 const stages=source.map((stage,index)=>{
  const id=String(stage.id??'stage-'+index);
  if(ids.has(id))throw new Error('As etapas precisam de identificadores únicos para exibir os desembolsos.');
  ids.add(id);
  const monthly=Array.isArray(stage.monthly)?stage.monthly:[],byMonth=Object.create(null);
  let first=Number.isInteger(stage.start)?stage.start:Infinity,last=Number.isInteger(stage.end)?stage.end:Number.isInteger(stage.start)&&Number.isInteger(stage.duration)?stage.start+stage.duration-1:-Infinity;
  for(const item of monthly){
   if(!Number.isInteger(item.month)||item.month<0||!finite(item.amount)||item.amount<0)throw new Error('O cronograma contém um desembolso mensal inválido.');
   byMonth[item.month]=(byMonth[item.month]||0)+item.amount;
   first=Math.min(first,item.month);last=Math.max(last,item.month);
  }
  if(first!==Infinity&&last>=first){start=Math.min(start,first);end=Math.max(end,last);}
  amounts.push(byMonth);
  return {id,name:String(stage.name||'Etapa '+(index+1)),color:COLORS[index%COLORS.length],start:first===Infinity?null:first,end:last===-Infinity?null:last,total:0,peak:null};
 });
 if(start===Infinity||end===-Infinity)return {start:null,end:null,stages,months:[],total:0,peak:null};
 let total=0,peak=null;const months=[],running=Object.create(null);
 stages.forEach(stage=>{running[stage.id]=0;});
 for(let month=start;month<=end;month++){
  const byStage=Object.create(null),cumulativeByStage=Object.create(null);let amount=0;
  stages.forEach((stage,index)=>{
   const value=amounts[index][month]||0;
   byStage[stage.id]=value;amount+=value;running[stage.id]+=value;
   cumulativeByStage[stage.id]=running[stage.id];stage.total+=value;
   if(value>0&&(!stage.peak||value>stage.peak.amount))stage.peak={month,amount:value};
  });
  total+=amount;
  if(amount>0&&(!peak||amount>peak.amount))peak={month,amount};
  months.push({month,total:amount,cumulative:total,byStage,cumulativeByStage});
 }
 return {start,end,stages,months,total,peak};
}
function viewFor(data,stageId){
 const rawId=typeof stageId==='string'&&stageId.startsWith('stage:')?stageId.slice(6):null;
 const stage=rawId===null?null:data.stages.find(item=>item.id===rawId),selected=stage?[stage]:data.stages;
 return {
  id:stage?'stage:'+stage.id:'all',label:stage?.name||'Todas as etapas',stages:selected,
  total:stage?stage.total:data.total,peak:stage?stage.peak:data.peak,
  months:data.months.map(row=>({month:row.month,total:stage?row.byStage[stage.id]:row.total,cumulative:stage?row.cumulativeByStage[stage.id]:row.cumulative,byStage:row.byStage,cumulativeByStage:row.cumulativeByStage}))
 };
}
function scaleFor(data,view){
 const W=Math.max(760,data.months.length*34+116),H=330,L=94,R=22,T=27,B=57,w=W-L-R,h=H-T-B;
 const maximum=view.peak?.amount||0,raw=maximum/4,power=raw>0?10**Math.floor(Math.log10(raw)):1,step=raw>0?Math.ceil(raw/power)*power:1,top=maximum>0?Math.ceil(maximum/step)*step:1;
 return {W,H,L,R,T,B,w,h,top,step,maximum,slot:w/Math.max(1,data.months.length)};
}
function chartHTML(data,view,month){
 if(!data.months.length)return '<div class="wh-empty">Não há meses de implantação para exibir.</div>';
 const s=scaleFor(data,view),x=index=>s.L+index*s.slot,y=value=>s.T+s.h*(1-value/s.top),barWidth=Math.min(38,s.slot*.72);
 let grid='',bars='',hits='';
 if(s.maximum>0){
  for(let value=0;value<=s.top+s.step/100;value+=s.step){const yy=y(value);grid+='<line class="wh-grid-line" x1="'+s.L+'" x2="'+(s.W-s.R)+'" y1="'+yy+'" y2="'+yy+'"/><text x="'+(s.L-10)+'" y="'+(yy+4)+'" text-anchor="end">'+esc(compact(value))+'</text>';}
 }else grid+='<line class="wh-grid-line" x1="'+s.L+'" x2="'+(s.W-s.R)+'" y1="'+y(0)+'" y2="'+y(0)+'"/><text x="'+(s.L-10)+'" y="'+(y(0)+4)+'" text-anchor="end">R$ 0</text>';
 grid+='<text class="wh-axis-label" x="'+s.L+'" y="14">R$ nominais · por mês</text>';
 view.months.forEach((row,index)=>{
  const xx=x(index),center=xx+s.slot/2;let bottom=0;
  view.stages.forEach(stage=>{
   const amount=row.byStage[stage.id],next=bottom+amount;
   bars+='<rect data-wh-bar data-stage-id="'+esc(stage.id)+'" data-month="'+row.month+'" data-amount="'+amount+'" x="'+(center-barWidth/2)+'" y="'+y(next)+'" width="'+barWidth+'" height="'+(amount/s.top*s.h)+'" fill="'+stage.color+'" aria-hidden="true"><title>'+esc(stage.name)+' · M'+row.month+' · '+esc(money(amount))+'</title></rect>';
   bottom=next;
  });
  grid+='<text class="wh-month-label" x="'+center+'" y="'+(s.H-s.B+21)+'" text-anchor="middle">M'+row.month+'</text>';
  hits+='<rect class="wh-month-hit" data-wh-month data-month="'+row.month+'" data-amount="'+row.total+'" x="'+xx+'" y="'+s.T+'" width="'+s.slot+'" height="'+s.h+'" fill="transparent" aria-hidden="true"><title>M'+row.month+' · '+esc(money(row.total))+' · acumulado '+esc(money(row.cumulative))+'</title></rect>';
 });
 const selected=Math.max(0,data.months.findIndex(row=>row.month===month)),highlight='<rect class="wh-selection" data-wh-highlight data-month="'+month+'" x="'+x(selected)+'" y="'+s.T+'" width="'+s.slot+'" height="'+s.h+'"/>';
 const empty=s.maximum===0?'<text class="wh-empty-label" x="'+(s.L+s.w/2)+'" y="'+(s.T+s.h/2)+'" text-anchor="middle">Sem desembolso previsto para esta seleção.</text>':'';
 return '<div class="wh-chart-scroll" data-wh-scroll><svg class="wh-chart" data-wh-chart viewBox="0 0 '+s.W+' '+s.H+'" style="width:'+s.W+'px" tabindex="0" role="img" aria-label="Desembolso mensal de '+esc(view.label)+', de M'+data.start+' a M'+data.end+'. Use as setas, Home ou End para consultar os meses."><title>Desembolsos nominais por mês</title>'+grid+highlight+bars+empty+hits+'</svg></div><p class="wh-chart-help">Passe sobre uma barra ou toque para consultar. Deslize horizontalmente para ver todos os meses. No teclado, use as setas; Home e End vão ao início e ao fim.</p>';
}
function readoutHTML(view,row){
 if(!row)return '<p>Sem desembolso previsto.</p>';
 return '<div class="wh-readout-head"><strong>M'+row.month+'</strong><span>Desembolso no mês <b>'+esc(money(row.total))+'</b></span><span>Acumulado até o mês <b>'+esc(money(row.cumulative))+'</b></span></div><div class="wh-composition" data-wh-composition>'+view.stages.map(stage=>'<div data-wh-component data-stage-id="'+esc(stage.id)+'" data-amount="'+row.byStage[stage.id]+'"><span><i style="background:'+stage.color+'"></i>'+esc(stage.name)+'</span><b>'+esc(money(row.byStage[stage.id]))+'</b></div>').join('')+'</div>';
}
function tableHTML(view){
 return '<details class="wh-table-details"><summary>Consultar tabela mensal</summary><div class="table-wrap wh-table-wrap"><table data-wh-table><caption>Desembolso nominal e acumulado · '+esc(view.label)+'</caption><thead><tr><th>Mês</th><th>Desembolso nominal</th><th>Acumulado</th></tr></thead><tbody>'+view.months.map(row=>'<tr data-wh-row data-month="'+row.month+'" data-amount="'+row.total+'" data-cumulative="'+row.cumulative+'"><td>M'+row.month+'</td><td data-wh-value="amount">'+esc(money(row.total))+'</td><td data-wh-value="cumulative">'+esc(money(row.cumulative))+'</td></tr>').join('')+'</tbody></table></div></details>';
}
function contents(data,stageId='all',selectedMonth){
 const view=viewFor(data,stageId),month=selectedMonth??view.peak?.month??data.start,row=view.months.find(item=>item.month===month)||view.months[0],peak=view.peak;
 return '<div class="wh-heading"><div><span class="eyebrow">CRONOGRAMA APLICADO</span><h3>Desembolso mensal por etapa</h3><p>Valores nominais em reais, incluindo a contingência e a inflação até cada pagamento.</p></div><label class="wh-filter"><span>Visualizar</span><select data-wh-stage aria-label="Filtrar desembolso por etapa"><option value="all" '+(view.id==='all'?'selected':'')+'>Todas as etapas</option>'+data.stages.map(stage=>'<option value="'+esc('stage:'+stage.id)+'" '+(view.id==='stage:'+stage.id?'selected':'')+'>'+esc(stage.name)+'</option>').join('')+'</select></label></div><div class="wh-summary"><div data-wh-total data-amount="'+view.total+'"><span>Desembolso total da seleção</span><strong>'+esc(money(view.total))+'</strong></div><div data-wh-peak data-month="'+(peak?peak.month:'')+'" data-amount="'+(peak?peak.amount:0)+'"><span>Pico de desembolso mensal</span><strong>'+esc(peak?money(peak.amount):'Sem desembolso previsto')+'</strong>'+(peak?'<small>M'+peak.month+'</small>':'')+'</div><div><span>Período do empreendimento</span><strong>'+(data.months.length?'M'+data.start+' a M'+data.end:'Sem cronograma')+'</strong><small>'+data.months.length+' meses na consulta</small></div></div><div class="wh-legend" aria-label="Etapas exibidas">'+view.stages.map(stage=>'<span><i style="background:'+stage.color+'"></i>'+esc(stage.name)+'</span>').join('')+'</div>'+chartHTML(data,view,row?.month)+'<div class="wh-readout" data-wh-readout data-month="'+(row?row.month:'')+'" data-amount="'+(row?row.total:0)+'" data-cumulative="'+(row?row.cumulative:0)+'" role="status" aria-live="polite" aria-atomic="true">'+readoutHTML(view,row)+'</div>'+tableHTML(view)+'<p class="wh-note">Este histograma mostra a implantação aplicada ao estudo. As prévias de prazo e curva passam a compor este cronograma depois de aplicar. O filtro serve apenas para consulta.</p>';
}
function render(result){
 const data=buildData(result);
 return '<section class="work-stage-histogram" data-work-histogram aria-label="Desembolsos mensais da implantação por etapa">'+contents(data)+'</section>';
}
function bind(rootElement,result){
 const section=rootElement?.matches?.('[data-work-histogram]')?rootElement:rootElement?.querySelector?.('[data-work-histogram]');
 if(!section)return;
 bindings.get(section)?.();
 const data=buildData(result);let filter=section.querySelector('[data-wh-stage]')?.value||'all',view=viewFor(data,filter),selected=view.peak?.month??data.start;
 function select(month,scroll=false,force=false){
  const index=Math.max(0,Math.min(data.months.length-1,month-data.start)),row=view.months[index];if(!row)return;
  if(!force&&!scroll&&selected===row.month)return;
  selected=row.month;const s=scaleFor(data,view),highlight=section.querySelector('[data-wh-highlight]'),readout=section.querySelector('[data-wh-readout]');
  if(highlight){highlight.setAttribute('x',s.L+index*s.slot);highlight.dataset.month=String(row.month);}
  if(readout){readout.dataset.month=String(row.month);readout.dataset.amount=String(row.total);readout.dataset.cumulative=String(row.cumulative);readout.innerHTML=readoutHTML(view,row);}
  if(scroll){
   const container=section.querySelector('[data-wh-scroll]'),svg=section.querySelector('[data-wh-chart]');
   if(container&&svg){const factor=svg.getBoundingClientRect().width/s.W,left=(s.L+index*s.slot)*factor,right=left+s.slot*factor;if(left<container.scrollLeft+10)container.scrollLeft=Math.max(0,left-10);else if(right>container.scrollLeft+container.clientWidth-10)container.scrollLeft=right-container.clientWidth+10;}
  }
 }
 function pointer(event){const hit=event.target.closest?.('[data-wh-month]');if(hit&&section.contains(hit))select(Number(hit.dataset.month));}
 function keydown(event){
  if(!event.target.closest?.('[data-wh-chart]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||!data.months.length)return;
  event.preventDefault();select(event.key==='Home'?data.start:event.key==='End'?data.end:Math.max(data.start,Math.min(data.end,selected+(event.key==='ArrowRight'?1:-1))),true);
 }
 function change(event){
  if(!event.target.matches?.('[data-wh-stage]'))return;
  const focused=section.ownerDocument.activeElement===event.target;
  filter=event.target.value;view=viewFor(data,filter);
  section.innerHTML=contents(data,view.id,selected);
  select(selected,false,true);
  if(focused)section.querySelector('[data-wh-stage]')?.focus({preventScroll:true});
 }
 section.addEventListener('pointermove',pointer);section.addEventListener('click',pointer);section.addEventListener('keydown',keydown);section.addEventListener('change',change);
 bindings.set(section,()=>{section.removeEventListener('pointermove',pointer);section.removeEventListener('click',pointer);section.removeEventListener('keydown',keydown);section.removeEventListener('change',change);});
 select(selected,false,true);
}

window.EvoraWorkHistogram={COLORS,buildData,render,bind};
})();
