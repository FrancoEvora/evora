(function(){
'use strict';
const STORE='evora.viabilidade.v1';
const RANGE_KEY='evora.portfolio.range.v1';
const NS='http://www.w3.org/2000/svg';
const RANGES=[['6','6m'],['12','12m'],['24','24m'],['36','36m'],['all','Ciclo']];

const fmt=(v,d=0)=>Number.isFinite(Number(v))?Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const money=v=>{
 const n=Number(v)||0,a=Math.abs(n),sign=n<0?'−':'';
 const value=a>=1e6?(a/1e6).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' mi':
   a>=1e4?(a/1e3).toLocaleString('pt-BR',{maximumFractionDigits:0})+' mil':
   a.toLocaleString('pt-BR',{maximumFractionDigits:0});
 return sign+'R$ '+value;
};

function activeResult(){
 try{
  const library=JSON.parse(localStorage.getItem(STORE));
  if(!library||!Array.isArray(library.projects)||!library.projects.length||!window.EvoraEngine)return null;
  const project=library.projects.find(item=>item.id===library.active)||library.projects[0];
  if(!project?.params)return null;
  return {project,result:window.EvoraEngine.simulate(project.params,true)};
 }catch{return null;}
}

function panel(){
 return Array.from(document.querySelectorAll('.panel')).find(item=>item.querySelector('h2')?.textContent.trim()==='Da venda à carteira')||null;
}

function currentRange(){
 const stored=sessionStorage.getItem(RANGE_KEY);
 return RANGES.some(([value])=>value===stored)?stored:'36';
}

function svgNode(name,attrs={}){
 const node=document.createElementNS(NS,name);
 for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
 return node;
}

function niceScale(maxValue){
 const high=Math.max(1,maxValue);
 const raw=high/4;
 const magnitude=10**Math.floor(Math.log10(raw));
 const step=Math.max(1,Math.ceil(raw/magnitude)*magnitude);
 return {step,max:Math.ceil(high/step)*step};
}

function buildChart(rows,workEnd){
 const W=760,H=282,L=67,RR=18,T=21,B=38,w=W-L-RR,h=H-T-B,maxT=Math.max(1,rows.at(-1)?.t||1);
 const values=rows.flatMap(row=>[Number(row.cumSigned)||0,Number(row.cumReceived)||0,Number(row.portfolioBalance)||0]);
 const scale=niceScale(Math.max(...values,1));
 const x=t=>L+t/maxT*w;
 const y=v=>T+(scale.max-v)/scale.max*h;
 const svg=svgNode('svg',{class:'chart portfolio-corrected-chart',viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'VGV contratado, recebimentos acumulados e saldo principal da carteira'});
 const title=svgNode('title');title.textContent='Da venda à carteira: valores contratados, caixa recebido e saldo principal ainda a receber';svg.appendChild(title);

 for(let v=0;v<=scale.max+scale.step/100;v+=scale.step){
  svg.appendChild(svgNode('line',{class:v===0?'zero':'grid',x1:L,x2:W-RR,y1:y(v),y2:y(v)}));
  const label=svgNode('text',{x:L-10,y:y(v)+3,'text-anchor':'end'});
  label.textContent=Math.abs(v)>=1e6?fmt(v/1e6,0)+' mi':Math.abs(v)>=1e3?fmt(v/1e3,0)+' mil':fmt(v,0);
  svg.appendChild(label);
 }
 for(let i=0;i<=4;i++){
  const t=Math.round(maxT*i/4),label=svgNode('text',{x:x(t),y:H-10,'text-anchor':'middle'});
  label.textContent='M'+t;svg.appendChild(label);
 }

 const series=[
  {key:'cumSigned',label:'VGV contratado acumulado',stroke:'#bb914a'},
  {key:'cumReceived',label:'Recebimentos acumulados',stroke:'#497d58'},
  {key:'portfolioBalance',label:'Saldo principal da carteira',stroke:'#648693'}
 ];
 for(const item of series){
  const d=rows.map((row,index)=>(index?'L':'M')+x(row.t).toFixed(2)+','+y(Number(row[item.key])||0).toFixed(2)).join(' ');
  svg.appendChild(svgNode('path',{d,fill:'none',stroke:item.stroke,'stroke-width':2.35,'stroke-linejoin':'round','stroke-linecap':'round'}));
  const last=rows.at(-1);
  if(last)svg.appendChild(svgNode('circle',{cx:x(last.t),cy:y(Number(last[item.key])||0),r:3.2,fill:'#fff',stroke:item.stroke,'stroke-width':2}));
 }

 if(Number.isFinite(workEnd)&&workEnd<=maxT){
  const xx=x(workEnd);
  svg.appendChild(svgNode('line',{x1:xx,x2:xx,y1:T,y2:H-B,stroke:'#98a88f','stroke-dasharray':'3 4'}));
  const marker=svgNode('text',{x:Math.min(xx+5,W-112),y:13});marker.textContent='Entrega · M'+workEnd;svg.appendChild(marker);
 }

 const barWidth=Math.max(2,w/maxT);
 rows.forEach(row=>{
  const rect=svgNode('rect',{x:Math.max(L,x(row.t)-barWidth/2),y:T,width:barWidth,height:h,fill:'transparent'});
  const tip=svgNode('title');
  tip.textContent='M'+row.t+' — VGV contratado: '+money(row.cumSigned)+' | Recebimentos: '+money(row.cumReceived)+' | Saldo principal: '+money(row.portfolioBalance);
  rect.appendChild(tip);svg.appendChild(rect);
 });
 return {svg,series};
}

function installStyles(){
 if(document.getElementById('portfolio-corrected-style'))return;
 const style=document.createElement('style');
 style.id='portfolio-corrected-style';
 style.textContent=`
 .portfolio-range-controls{display:flex;border:1px solid var(--line);padding:3px;border-radius:5px;gap:2px;flex-wrap:wrap}
 .portfolio-range-controls button{background:none;border:0;padding:5px 8px;font-size:9px;color:var(--muted);border-radius:3px}
 .portfolio-range-controls button.active{background:#eaf0e4;color:var(--green);font-weight:650}
 .portfolio-corrected-wrap .legend{margin-bottom:12px}
 .portfolio-corrected-wrap .legend span{display:flex;align-items:center;gap:6px}
 .portfolio-corrected-wrap .legend i{width:14px;height:2px;display:inline-block}
 .portfolio-period-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:7px;overflow:hidden;margin-top:14px}
 .portfolio-period-summary>div{background:#fafbf8;padding:12px 14px}
 .portfolio-period-summary span{display:block;font-size:8px;letter-spacing:.7px;color:var(--muted)}
 .portfolio-period-summary b{display:block;font-size:15px;margin-top:6px}
 .portfolio-period-summary small{display:block;font-size:8px;color:var(--muted);line-height:1.5;margin-top:4px}
 .portfolio-concept-note{margin-top:13px;padding:12px 14px;background:#f3f6ee;border-left:3px solid #78906e;border-radius:0 6px 6px 0;font-size:9px;line-height:1.65;color:var(--muted)}
 .portfolio-concept-note b{color:var(--ink)}
 @media(max-width:720px){.portfolio-period-summary{grid-template-columns:1fr}.portfolio-range-controls{margin-top:10px}.portfolio-corrected-chart text{font-size:13px}}
 `;
 document.head.appendChild(style);
}

function enhance(){
 const target=panel(),data=activeResult();
 if(!target||!data)return;
 const range=currentRange(),signature=data.project.id+'|'+String(data.project.updated||'')+'|'+range;
 if(target.dataset.portfolioCorrected===signature)return;
 target.dataset.portfolioCorrected=signature;

 const head=target.querySelector('.panel-head');
 if(!head)return;
 const sub=head.querySelector('.panel-sub');
 if(sub)sub.textContent='Vendas contratadas, caixa já recebido e saldo principal ainda a receber · valores nominais';

 let controls=head.querySelector('.portfolio-range-controls');
 if(!controls){controls=document.createElement('div');controls.className='portfolio-range-controls';head.appendChild(controls);}
 controls.innerHTML=RANGES.map(([value,label])=>'<button type="button" data-portfolio-range="'+value+'" class="'+(range===value?'active':'')+'">'+label+'</button>').join('');
 controls.setAttribute('aria-label','Período do gráfico da carteira');

 Array.from(target.children).slice(1).forEach(child=>child.remove());

 const result=data.result,fullRows=result.rows.map(row=>({...row}));let cumSigned=0;
 fullRows.forEach(row=>{cumSigned+=Number(row.signed)||0;row.cumSigned=cumSigned;});
 const limit=range==='all'?result.totals.horizon:Math.min(Number(range),result.totals.horizon);
 const rows=fullRows.filter(row=>row.t<=limit);
 if(!rows.length)return;
 const end=rows.at(-1),built=buildChart(rows,result.totals.workEnd),wrap=document.createElement('div');
 wrap.className='portfolio-corrected-wrap';
 const legend=document.createElement('div');legend.className='legend';
 legend.innerHTML=built.series.map(item=>'<span><i style="background:'+item.stroke+'"></i>'+item.label+'</span>').join('');
 wrap.appendChild(legend);wrap.appendChild(built.svg);

 const summary=document.createElement('div');summary.className='portfolio-period-summary';
 summary.innerHTML=
  '<div><span>VGV CONTRATADO ATÉ M'+end.t+'</span><b>'+money(end.cumSigned)+'</b><small>Valor das vendas assinadas, antes dos juros futuros.</small></div>'+
  '<div><span>RECEBIMENTOS ATÉ M'+end.t+'</span><b>'+money(end.cumReceived)+'</b><small>Caixa esperado já recebido, incluindo juros e correção.</small></div>'+
  '<div><span>SALDO DA CARTEIRA EM M'+end.t+'</span><b>'+money(end.portfolioBalance)+'</b><small>Principal contratual ainda a receber; não é valor acumulado.</small></div>';
 wrap.appendChild(summary);

 const note=document.createElement('div');note.className='portfolio-concept-note';
 note.innerHTML='<b>Correção conceitual:</b> o gráfico anterior comparava apenas VGV contratado acumulado com recebimentos acumulados e, por isso, podia sugerir uma formação incorreta da carteira. Agora o saldo da carteira é mostrado como estoque de principal ainda a receber. No ciclo completo, os recebimentos podem superar o VGV por causa de juros e correção, enquanto o saldo principal tende a zero.';
 wrap.appendChild(note);target.appendChild(wrap);
}

let scheduled=false;
function schedule(){
 if(scheduled)return;
 scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;installStyles();enhance();});
}

document.addEventListener('click',event=>{
 const button=event.target.closest('[data-portfolio-range]');
 if(!button)return;
 sessionStorage.setItem(RANGE_KEY,String(button.dataset.portfolioRange));
 const target=panel();if(target)delete target.dataset.portfolioCorrected;
 schedule();
});

const root=document.getElementById('app');
if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
window.addEventListener('storage',schedule);
schedule();
})();