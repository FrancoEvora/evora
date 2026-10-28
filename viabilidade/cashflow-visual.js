/* Évora · Cash-flow visualization. Same monthly rows as the financial table. */
(function(){
'use strict';
const E=window.EvoraEngine,H=E?.performance,ROOT=document.getElementById('app');if(!H||!ROOT||window.EvoraFinanceChart)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v,exact=false)=>{if(!Number.isFinite(v))return '—';if(exact)return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const a=Math.abs(v),s=v<0?'−':'';return s+'R$ '+(a>=1e6?(a/1e6).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi':a>=1000?(a/1000).toLocaleString('pt-BR',{maximumFractionDigits:0})+' mil':a.toLocaleString('pt-BR',{maximumFractionDigits:0}));};
let nextId=0,chartMode='monthly',scheduled=false,cachedKey='',cached=null;
function chart(rows,series,{title='Fluxo de caixa projetado',start='',height=280}={}){
 const wrap=document.createElement('div');wrap.className='evora-finance-chart';if(!rows.length){wrap.textContent='Sem dados no período.';return wrap;}
 const W=800,L=90,R=24,T=28,B=42,w=W-L-R,h=height-T-B,minT=rows[0].t,maxT=Math.max(minT+1,rows.at(-1).t),spanT=maxT-minT;
 let low=0,high=0;for(const row of rows)for(const s of series){const v=Number(row[s.key]);if(Number.isFinite(v)){low=Math.min(low,v);high=Math.max(high,v);}}
 if(high===low)high=low+1;const padding=(high-low)*.08;high+=padding;low=low<0?low-padding:0;
 const x=t=>L+(t-minT)/spanT*w,y=v=>T+(high-v)/(high-low)*h,fmtDate=t=>{if(!/^\d{4}-\d{2}$/.test(start))return '';const [a,b]=start.split('-').map(Number);return new Date(Date.UTC(a,b-1+t,1)).toLocaleDateString('pt-BR',{month:'short',year:'2-digit',timeZone:'UTC'});};
 let marks='';for(let i=0;i<=4;i++){const v=low+(high-low)*i/4;marks+='<line class="finance-grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text x="'+(L-10)+'" y="'+(y(v)+4)+'" text-anchor="end">'+esc(money(v))+'</text>';}
 const ticks=[...new Set([minT,...Array.from({length:5},(_,i)=>Math.round(minT+(rows.at(-1).t-minT)*(i+1)/6)),rows.at(-1).t])];
 ticks.forEach(t=>{marks+='<text x="'+x(t)+'" y="'+(height-14)+'" text-anchor="middle">M'+t+'</text>';});
 marks+='<line class="finance-zero" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(0)+'" y2="'+y(0)+'"/>';
 series.forEach(s=>{const d=rows.map((r,i)=>(i?'L':'M')+x(r.t).toFixed(2)+','+y(Number(r[s.key])||0).toFixed(2)).join(' ');marks+='<path d="'+d+'" fill="none" stroke="'+s.color+'" stroke-width="2.3" '+(s.dash?'stroke-dasharray="'+s.dash+'"':'')+'/>';});
 const id='finance-tooltip-'+(++nextId);
 wrap.innerHTML='<div class="finance-legend">'+series.map(s=>'<span><i style="border-color:'+s.color+';border-top-style:'+(s.dash?'dashed':'solid')+'"></i>'+esc(s.label)+'</span>').join('')+'</div><div class="finance-svg-scroll"><svg viewBox="0 0 '+W+' '+height+'" role="img" tabindex="0" aria-label="'+esc(title)+'. Use as setas para consultar cada mês." aria-describedby="'+id+'">'+marks+'<line data-finance-cursor x1="'+L+'" x2="'+L+'" y1="'+T+'" y2="'+(height-B)+'"/><rect x="'+L+'" y="'+T+'" width="'+w+'" height="'+h+'" fill="transparent"/></svg></div><div id="'+id+'" class="finance-tooltip" role="status" aria-live="polite"></div>';
 const svg=wrap.querySelector('svg'),tip=wrap.querySelector('.finance-tooltip'),cursor=wrap.querySelector('[data-finance-cursor]');let selected=rows.length-1;
 function select(i){selected=Math.min(rows.length-1,Math.max(0,i));const r=rows[selected],xx=x(r.t);cursor.setAttribute('x1',xx);cursor.setAttribute('x2',xx);tip.innerHTML='<b>M'+r.t+' · '+esc(fmtDate(r.t))+'</b>'+series.map(s=>'<span>'+esc(s.label)+': <strong>'+esc(money(Number(r[s.key])||0,true))+'</strong></span>').join('');wrap.dataset.selectedMonth=r.t;}
 svg.addEventListener('pointermove',event=>{const r=svg.getBoundingClientRect(),pos=(event.clientX-r.left)*W/r.width;const m=minT+(pos-L)/w*spanT;let idx=0,diff=Infinity;rows.forEach((row,i)=>{const d=Math.abs(row.t-m);if(d<diff){idx=i;diff=d;}});select(idx);});
 svg.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();select(event.key==='Home'?0:event.key==='End'?rows.length-1:selected+(event.key==='ArrowRight'?1:-1));});select(selected);return wrap;
}
function activeResult(){const lib=JSON.parse(localStorage.getItem('evora.viabilidade.v1')||'null');if(!lib?.projects?.length)return null;const p=lib.projects.find(x=>x.id===lib.active)||lib.projects[0],key=p.id+'|'+JSON.stringify(p.params);if(key!==cachedKey){cached=E.simulate(p.params,true);cachedKey=key;}return cached;}
function seriesFor(rows,view,mode){const cum=mode==='cumulative';let upfront=0,regular=0,balloon=0;
 rows.forEach(r=>{r.upfront=r.cash+r.entry;upfront+=r.upfront;regular+=r.regular;balloon+=r.balloon;r.cumUpfront=upfront;r.cumRegular=regular;r.cumBalloon=balloon;r.totalIn=r.received+r.capitalIn;r.totalOut=r.operatingCost+r.capitalOut;});
 if(view==='portfolio')return [{key:cum?'cumReceived':'received',label:'Recebimentos totais',color:'#285b4c'},{key:cum?'cumUpfront':'upfront',label:'À vista e entradas',color:'#b18b48',dash:'7 4'},{key:cum?'cumRegular':'regular',label:'Parcelas regulares',color:'#648693'},{key:cum?'cumBalloon':'balloon',label:'Balões',color:'#9a6f86',dash:'3 4'}];
 if(view==='funding')return [{key:cum?'cumTotalIn':'totalIn',label:'Entradas, incluindo funding',color:'#285b4c'},{key:cum?'cumTotalOut':'totalOut',label:'Saídas, incluindo dívida e distribuições',color:'#b18b48',dash:'7 4'},{key:'bank',label:'Saldo de caixa após funding',color:'#648693'}];
 return [{key:cum?'cumReceived':'received',label:'Recebimentos',color:'#285b4c'},{key:cum?'cumOperatingCost':'operatingCost',label:'Desembolsos operacionais',color:'#b18b48',dash:'7 4'},{key:cum?'cumulative':'net',label:cum?'Saldo operacional acumulado':'Fluxo operacional do mês',color:'#648693'}];
}
function inject(){if(location.hash!=='#cashflow')return;const main=document.querySelector('main.content'),table=document.getElementById('cash-mode')?.closest('.panel');if(!main||!table)return;
 let result;try{result=activeResult();}catch{return;}if(!result)return;
 const view=document.getElementById('cash-mode').value,range=document.getElementById('cash-range').value,end=range==='works'?result.totals.workEnd:range==='60'?Math.min(60,result.totals.horizon):result.totals.horizon,signature=cachedKey+'|'+view+'|'+range+'|'+chartMode;
 let card=main.querySelector('[data-cash-visual]');if(card?.dataset.signature===signature)return;
 if(!card){card=document.createElement('section');card.className='panel cash-visual';card.dataset.cashVisual='1';table.before(card);}card.dataset.signature=signature;
 const rows=H.cashRows(result).filter(r=>r.t<=end),series=seriesFor(rows,view,chartMode);
 card.innerHTML='<div class="panel-head"><div><h2>Entradas, saídas e saldo</h2><p class="panel-sub">Projeção · M0 a M'+end+' · mesma visão e período selecionados na tabela abaixo.</p></div><div class="finance-mode"><button type="button" class="button small '+(chartMode==='monthly'?'primary':'')+'" data-cash-chart-mode="monthly">Mensal</button><button type="button" class="button small '+(chartMode==='cumulative'?'primary':'')+'" data-cash-chart-mode="cumulative">Acumulado</button></div></div><div data-cash-plot></div><p class="finance-note">'+(view==='funding'?'Entradas incluem recebimentos dos compradores, capital próprio, aportes adicionais necessários e saques de crédito. Saídas incluem custos operacionais, juros, tarifas, amortizações e distribuições. O saldo é o caixa final de cada mês; aportes adicionais simulados não são recursos contratados.':view==='portfolio'?'Recebimentos já consideram as perdas e os atrasos parametrizados. A linha total é a soma de à vista, entradas, parcelas e balões.':'Desembolsos incluem obra, terreno, pré-operação, despesas comerciais, tributos, gestão e administração. O fluxo operacional exclui aportes, crédito, juros do financiamento e distribuições.')+'</p>';
 card.querySelector('[data-cash-plot]').appendChild(chart(rows,series,{start:result.p.start,title:'Fluxo '+(chartMode==='monthly'?'mensal':'acumulado')}));card.dataset.endMonth=end;card.dataset.view=view;
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;inject();});}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-cash-chart-mode]');if(b){chartMode=b.dataset.cashChartMode;inject();}});
new MutationObserver(schedule).observe(ROOT,{childList:true});window.addEventListener('hashchange',schedule);
window.EvoraFinanceChart={chart,money,seriesFor};schedule();
})();
