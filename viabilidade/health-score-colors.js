/* Évora Viabilidade · Cores semânticas do score de saúde v1.0 */
(function(){
'use strict';
if(window.__evoraHealthScoreColorsV1)return;
window.__evoraHealthScoreColorsV1=true;

const bands=[
 {min:80,tone:'strong',label:'Forte',color:'#497d58',soft:'#f4f8f0',border:'#a9c69d'},
 {min:65,tone:'stable',label:'Estável',color:'#648693',soft:'#f3f7f8',border:'#b8ccd2'},
 {min:50,tone:'attention',label:'Atenção',color:'#bb914a',soft:'#fffaf0',border:'#e2c98e'},
 {min:0,tone:'critical',label:'Crítica',color:'#b55742',soft:'#fff7f4',border:'#dca294'}
];

function band(score){return bands.find(item=>score>=item.min)||bands.at(-1);}
function installStyles(){
 if(document.getElementById('health-score-semantic-colors'))return;
 const style=document.createElement('style');
 style.id='health-score-semantic-colors';
 style.textContent=`
 .health-score-card{--health-color:#497d58;--health-soft:#f4f8f0;--health-border:#a9c69d;border-color:var(--health-border)!important;background:linear-gradient(180deg,var(--health-soft),#fff 42%)!important}
 .health-score-card .health-ring{background:conic-gradient(var(--health-color) calc(var(--score)*1%),#e8eee4 0)!important;box-shadow:0 0 0 1px color-mix(in srgb,var(--health-color) 20%,transparent)}
 .health-score-card .health-ring:before{background:#fff!important}
 .health-score-card .health-ring strong,.health-score-card .health-score-title h2{color:var(--health-color)!important}
 .health-score-card .health-method summary{color:var(--health-color)!important}
 .health-score-card.critical{--health-color:#b55742;--health-soft:#fff4f0;--health-border:#d98f7f}
 .health-score-card.attention{--health-color:#bb914a;--health-soft:#fff9ed;--health-border:#dfc17f}
 .health-score-card.stable{--health-color:#648693;--health-soft:#f2f7f8;--health-border:#adc6cf}
 .health-score-card.strong{--health-color:#497d58;--health-soft:#f1f7ed;--health-border:#a7c49b}
 .health-score-card.critical .health-score-focus{border-color:#e8c5bc}
 .health-score-card.critical .health-score-focus b{color:#8f3f2f}
 .report-health-grid [data-health-report-score]{color:var(--health-report-color,#1b302b)}
 `;
 document.head.appendChild(style);
}

function applyCard(card){
 const value=Number(card.querySelector('.health-ring strong')?.textContent.trim());
 if(!Number.isFinite(value))return;
 const selected=band(value);
 bands.forEach(item=>card.classList.remove(item.tone));
 card.classList.add(selected.tone);
 card.style.setProperty('--health-color',selected.color);
 card.style.setProperty('--health-soft',selected.soft);
 card.style.setProperty('--health-border',selected.border);
 card.dataset.healthColorBand=selected.tone;
 card.setAttribute('aria-label','Score de saúde '+value+' de 100, classificação '+selected.label);
 const heading=card.querySelector('.health-score-title h2');
 if(heading)heading.textContent=selected.label;
}

function applyReport(){
 document.querySelectorAll('.health-score-report .report-health-grid>div:first-child b').forEach(node=>{
  const value=Number((node.textContent.match(/\d+/)||[])[0]);
  if(!Number.isFinite(value))return;
  const selected=band(value);
  node.dataset.healthReportScore='1';
  node.style.setProperty('--health-report-color',selected.color);
  node.style.color=selected.color;
 });
}

function apply(){
 installStyles();
 document.querySelectorAll('.health-score-card').forEach(applyCard);
 applyReport();
}

let scheduled=false;
function schedule(){
 if(scheduled)return;
 scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;apply();});
}

const root=document.getElementById('app');
if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
window.addEventListener('storage',schedule);
schedule();
})();
