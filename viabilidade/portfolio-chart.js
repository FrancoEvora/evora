(function(){
'use strict';
const STORE='evora.viabilidade.v1';
const RANGE_KEY='evora.portfolio.range.v2';
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
 const high=Math.max(1,maxValue),raw=high/4,magnitude=10**Math.floor(Math.log10(raw)),step=Math.max(1,Math.ceil(raw/magnitude)*magnitude);
 return {step,max:Math.ceil(high/step)*step};
}

function buildChart(rows,workEnd){
 // Mesmas proporções do gráfico executivo nativo.
 const W=window.innerWidth<720?480:720,H=270,L=57,RR=16,T=20,B=35,w=W-L-RR,h=H-T-B,maxT=Math.max(1,rows.at(-1)?.t||1);
 const values=rows.flatMap(row=>[Number(row.cumSigned)||0,Number(row.cumReceived)||0,Number(row.portfolioBalance)||0]);
 const scale=niceScale(Math.max(...values,1)),x=t=>L+t/maxT*w,y=v=>T+(scale.max-v)/scale.max*h;
 const svg=svgNode('svg',{class:'chart portfolio-corrected-chart',viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'VGV contratado, recebimentos acumulados e saldo principal da carteira'});
 const title=svgNode('title');title.textContent='Da venda à carteira: contratos, recebimentos e saldo principal';svg.appendChild(title);

 for(let v=0;v<=scale.max+scale.step/100;v+=scale.step){
  svg.appendChild(svgNode('line',{class:v===0?'zero':'grid',x1:L,x2:W-RR,y1:y(v),y2:y(v)}));
  const label=svgNode('text',{x:L-10,y:y(v)+3,'text-anchor':'end'});
  label.textContent=Math.abs(v)>=1e6?fmt(v/1e6,0)+' mi':Math.abs(v)>=1e3?fmt(v/1e3,0)+' mil':fmt(v,0);svg.appendChild(label);
 }
 for(let i=0;i<=4;i++){
  const t=Math.round(maxT*i/4),label=svgNode('text',{x:x(t),y:H-10,'text-anchor':'middle'});label.textContent='M'+t;svg.appendChild(label);
 }

 const series=[
  {key:'cumSigned',label:'VGV contratado acumulado',stroke:'#bb914a'},
  {key:'cumReceived',label:'Recebimentos acumulados',stroke:'#497d58'},
  {key:'portfolioBalance',label:'Saldo principal da carteira',stroke:'#648693',dash:'5 4'}
 ];
 for(const item of series){
  const d=rows.map((row,index)=>(index?'L':'M')+x(row.t).toFixed(2)+','+y(Number(row[item.key])||0).toFixed(2)).join(' ');
  const attrs={d,fill:'none',stroke:item.stroke,'stroke-width':2.2,'stroke-linejoin':'round','stroke-linecap':'round'};
  if(item.dash)attrs['stroke-dasharray']=item.dash;
  svg.appendChild(svgNode('path',attrs));
 }

 if(Number.isFinite(workEnd)&&workEnd<=maxT){
  const xx=x(workEnd);svg.appendChild(svgNode('line',{x1:xx,x2:xx,y1:T,y2:H-B,stroke:'#98a88f','stroke-dasharray':'3 4'}));
  const marker=svgNode('text',{x:Math.min(xx+5,W-102),y:12});marker.textContent='Entrega · M'+workEnd;svg.appendChild(marker);
 }

 const hoverWidth=Math.max(2,w/maxT);
 rows.forEach(row=>{
  const rect=svgNode('rect',{x:Math.max(L,x(row.t)-hoverWidth/2),y:T,width:hoverWidth,height:h,fill:'transparent'}),tip=svgNode('title');
  tip.textContent='M'+row.t+' — VGV contratado: '+money(row.cumSigned)+' | Recebimentos: '+money(row.cumReceived)+' | Saldo principal: '+money(row.portfolioBalance);
  rect.appendChild(tip);svg.appendChild(rect);
 });
 return {svg,series};
}

function installStyles(){
 if(document.getElementById('portfolio-corrected-style-v2'))return;
 const style=document.createElement('style');style.id='portfolio-corrected-style-v2';
 style.textContent=`
 .portfolio-compact-panel .panel-head{align-items:flex-start}
 .portfolio-range-controls{display:flex;border:1px solid var(--line);padding:3px;border-radius:5px;gap:2px;flex-wrap:wrap;flex-shrink:0}
 .portfolio-range-controls button{background:none;border:0;padding:5px 8px;font-size:9px;color:var(--muted);border-radius:3px}
 .portfolio-range-controls button.active{background:#eaf0e4;color:var(--green);font-weight:600}
 .portfolio-corrected-wrap{width:100%;max-width:760px;margin:0 auto}
 .portfolio-corrected-wrap .legend{margin-bottom:12px;gap:18px}
 .portfolio-corrected-wrap .legend span{display:flex;align-items:center;gap:6px}
 .portfolio-corrected-wrap .legend i{width:14px;height:2px;display:inline-block}
 .portfolio-corrected-chart{width:100%;height:auto;display:block;max-height:270px}
 .portfolio-period-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding-top:12px;margin-top:5px;border-top:1px solid var(--line)}
 .portfolio-period-strip>div{min-width:0}
 .portfolio-period-strip span{display:block;font-size:8px;letter-spacing:.65px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .portfolio-period-strip b{display:block;font-size:13px;margin-top:5px}
 .portfolio-period-strip small{display:block;font-size:8px;color:var(--muted);line-height:1.45;margin-top:3px}
 .portfolio-concept-details{margin-top:11px;border-top:1px solid var(--line);padding-top:9px}
 .portfolio-concept-details summary{cursor:pointer;font-size:9px;font-weight:600;color:var(--green)}
 .portfolio-concept-details p{font-size:8px;line-height:1.6;color:var(--muted);margin-top:7px}
 .portfolio-concept-details b{color:var(--ink)}
 @media(max-width:720px){
  .portfolio-range-controls{margin-top:10px}
  .portfolio-corrected-wrap{max-width:none}
  .portfolio-period-strip{grid-template-columns:1fr;gap:9px}
  .portfolio-corrected-chart{max-height:none}
  .portfolio-corrected-chart text{font-size:14px}
 }
 `;document.head.appendChild(style);
}

function enhance(){
 const target=panel(),data=activeResult();if(!target||!data)return;
 const range=currentRange(),signature=data.project.id+'|'+String(data.project.updated||'')+'|'+range+'|'+(window.innerWidth<720?'m':'d');
 if(target.dataset.portfolioCorrected===signature)return;
 target.dataset.portfolioCorrected=signature;target.classList.add('portfolio-compact-panel');

 const head=target.querySelector('.panel-head');if(!head)return;
 const sub=head.querySelector('.panel-sub');if(sub)sub.textContent='Contratos acumulados, caixa recebido e saldo principal ainda a receber · valores nominais';
 let controls=head.querySelector('.portfolio-range-controls');
 if(!controls){controls=document.createElement('div');controls.className='portfolio-range-controls';head.appendChild(controls);}
 controls.innerHTML=RANGES.map(([value,label])=>'<button type="button" data-portfolio-range="'+value+'" class="'+(range===value?'active':'')+'">'+label+'</button>').join('');
 controls.setAttribute('aria-label','Período do gráfico da carteira');
 Array.from(target.children).slice(1).forEach(child=>child.remove());

 const result=data.result,fullRows=result.rows.map(row=>({...row}));let cumSigned=0;
 fullRows.forEach(row=>{cumSigned+=Number(row.signed)||0;row.cumSigned=cumSigned;});
 const limit=range==='all'?result.totals.horizon:Math.min(Number(range),result.totals.horizon),rows=fullRows.filter(row=>row.t<=limit);
 if(!rows.length)return;
 const end=rows.at(-1),built=buildChart(rows,result.totals.workEnd),wrap=document.createElement('div');wrap.className='portfolio-corrected-wrap';
 const legend=document.createElement('div');legend.className='legend';legend.innerHTML=built.series.map(item=>'<span><i style="background:'+item.stroke+'"></i>'+item.label+'</span>').join('');
 wrap.append(legend,built.svg);

 const strip=document.createElement('div');strip.className='portfolio-period-strip';strip.innerHTML=
  '<div><span>VGV CONTRATADO · M'+end.t+'</span><b>'+money(end.cumSigned)+'</b><small>Vendas assinadas até o período.</small></div>'+
  '<div><span>RECEBIMENTOS · M'+end.t+'</span><b>'+money(end.cumReceived)+'</b><small>Caixa acumulado esperado.</small></div>'+
  '<div><span>SALDO DA CARTEIRA · M'+end.t+'</span><b>'+money(end.portfolioBalance)+'</b><small>Principal ainda a receber.</small></div>';
 wrap.appendChild(strip);

 const details=document.createElement('details');details.className='portfolio-concept-details';details.innerHTML='<summary>Como interpretar este gráfico</summary><p><b>VGV contratado</b> é o valor das vendas assinadas. <b>Recebimentos</b> são os valores já esperados em caixa e podem superar o VGV no ciclo completo por juros e correção. <b>Saldo da carteira</b> é o principal contratual ainda a receber e tende a zero com a amortização.</p>';
 wrap.appendChild(details);target.appendChild(wrap);
}

let scheduled=false;
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;installStyles();enhance();});}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-portfolio-range]');if(!button)return;
 sessionStorage.setItem(RANGE_KEY,String(button.dataset.portfolioRange));const target=panel();if(target)delete target.dataset.portfolioCorrected;schedule();
});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const target=panel();if(target)delete target.dataset.portfolioCorrected;schedule();},120);});
const root=document.getElementById('app');if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
window.addEventListener('storage',schedule);schedule();
})();