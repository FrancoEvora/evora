/* Évora Viabilidade · Score de saúde e dupla leitura do terreno v1.0 */
(function(){
'use strict';
const STORE='evora.viabilidade.v1';
const E=window.EvoraEngine;
if(!E||window.__evoraHealthScoreV1)return;
window.__evoraHealthScoreV1=true;

const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,Number(value)||0));
const fmt=(value,digits=0)=>Number.isFinite(Number(value))?Number(value).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
const money=value=>{
 const n=Number(value)||0,a=Math.abs(n),sign=n<0?'−':'';
 const text=a>=1e6?fmt(a/1e6,1)+' mi':a>=1e4?fmt(a/1e3,0)+' mil':fmt(a,0);
 return sign+'R$ '+text;
};
const pct=(value,digits=1)=>Number.isFinite(Number(value))?fmt(Number(value),digits)+'%':'—';

function active(){
 try{
  const library=JSON.parse(localStorage.getItem(STORE));
  if(!library||!Array.isArray(library.projects)||!library.projects.length)return null;
  const project=library.projects.find(item=>item.id===library.active)||library.projects[0];
  if(!project?.params)return null;
  const result=E.simulate(project.params,true);
  return {project,result};
 }catch{return null;}
}

function health(project,result){
 const t=result.totals,rows=result.rows,work=Math.max(1,Number(t.work)||0),vgv=Math.max(1,Number(t.vgv)||0);
 const profitabilityRatio=(Number(t.vpl)||0)/vgv;
 const coverageRatio=clamp((Number(t.coverage)||0)/100);
 const peakFundingRatio=clamp((Number(t.peak)||0)/work);
 const soldRatio=clamp((Number(t.soldAtCompletion)||0)/Math.max(1,Number(t.qty)||0));
 const peakDebt=Math.max(0,...rows.map(row=>Number(row.debt)||0));
 const deliveryRow=rows[Math.min(Number(t.workEnd)||0,rows.length-1)]||{};
 const debtAtDelivery=Math.max(0,Number(deliveryRow.debt)||0);
 const debtRatio=peakDebt>0?clamp(debtAtDelivery/peakDebt):0;
 const extraRatio=clamp((Number(t.extra)||0)/(work*.25));

 const dimensions=[
  {id:'profit',label:'Rentabilidade',max:25,score:25*clamp(profitabilityRatio/.15),metric:'VPL / VGV '+pct(profitabilityRatio*100),explain:'Pontuação máxima quando o VPL alcança 15% do VGV.'},
  {id:'coverage',label:'Cobertura da obra',max:20,score:20*coverageRatio,metric:pct(Number(t.coverage)||0),explain:'Caixa acumulado disponível para obra até a entrega dividido pelo custo total da obra.'},
  {id:'liquidity',label:'Liquidez e exposição',max:20,score:20*(1-peakFundingRatio),metric:'Pico '+pct((Number(t.peak)||0)/work*100)+' da obra',explain:'Quanto menor a exposição máxima em relação à obra, maior a pontuação.'},
  {id:'sales',label:'Absorção comercial',max:15,score:15*soldRatio,metric:pct(soldRatio*100)+' vendido na entrega',explain:'Percentual do estoque vendido até a conclusão da implantação.'},
  {id:'debt',label:'Dívida na entrega',max:10,score:10*(1-debtRatio),metric:peakDebt>0?pct(debtRatio*100)+' do pico ainda aberto':'Sem dívida',explain:'Mede quanto da dívida máxima permanece em aberto na entrega.'},
  {id:'funding',label:'Funding não coberto',max:10,score:10*(1-extraRatio),metric:money(Number(t.extra)||0),explain:'Aportes adicionais não cobertos, com penalização total quando chegam a 25% da obra.'}
 ].map(item=>({...item,score:clamp(item.score,0,item.max)}));

 let raw=dimensions.reduce((sum,item)=>sum+item.score,0),score=Math.round(raw),guards=[];
 if((Number(t.vpl)||0)<0&&score>49){score=49;guards.push('VPL negativo limita a nota a 49.');}
 if((Number(t.extra)||0)>1&&score>69){score=69;guards.push('Funding adicional não coberto limita a nota a 69.');}
 const classification=score>=80?'Forte':score>=65?'Estável':score>=50?'Atenção':'Crítica';
 const tone=score>=80?'strong':score>=65?'stable':score>=50?'attention':'critical';
 const weakest=[...dimensions].sort((a,b)=>(a.score/a.max)-(b.score/b.max)).slice(0,2);
 return {score,classification,tone,dimensions,guards,weakest,profitabilityRatio,peakDebt,debtAtDelivery};
}

function landValues(project,result){
 const t=result.totals,nominal=Math.max(0,Number(t.land)||0),discounted=Math.max(0,Number(t.landVpl)||0),vgv=Math.max(1,Number(t.vgv)||0),tma=Number(project.params.tma)||0;
 const nominalPct=nominal/vgv*100,discountedPct=discounted/vgv*100,difference=Math.max(0,nominal-discounted);
 const model=project.params.landMode==='share'?'Permuta financeira · '+pct(project.params.landShare)+' dos recebimentos':'Compra do terreno · '+money(project.params.landPrice);
 return {nominal,discounted,nominalPct,discountedPct,difference,tma,model};
}

function dimensionRows(data){
 return data.dimensions.map(item=>{
  const ratio=item.max>0?item.score/item.max*100:0;
  return '<div class="health-dimension"><div class="health-dimension-head"><div><strong>'+item.label+'</strong><span>'+item.metric+'</span></div><b>'+fmt(item.score,1)+' / '+item.max+'</b></div><div class="health-track"><i style="width:'+clamp(ratio,0,100)+'%"></i></div><small>'+item.explain+'</small></div>';
 }).join('');
}

function enhanceDashboard(data){
 const heading=Array.from(document.querySelectorAll('.page-heading h1')).find(node=>node.textContent.trim()==='Viabilidade, antes de tudo.');
 if(!heading)return;
 const land=document.querySelector('.executive-land');
 if(!land)return;
 const signature=data.project.id+'|'+JSON.stringify(data.project.params)+'|'+String(data.project.updated||'');
 if(land.dataset.healthSignature===signature)return;
 land.dataset.healthSignature=signature;
 const values=landValues(data.project,data.result),score=health(data.project,data.result);
 land.innerHTML=
  '<div class="land-dual-card"><span>VALOR NOMINAL DO TERRENO · SEM TMA</span><strong>'+money(values.nominal)+'</strong><b>'+pct(values.nominalPct)+' do VGV</b><small>Soma dos repasses sem desconto a valor presente.</small></div>'+ 
  '<div class="land-dual-card vpl"><span>VPL DO TERRENO · TMA '+pct(values.tma)+' A.A.</span><strong>'+money(values.discounted)+'</strong><b>'+pct(values.discountedPct)+' do VGV</b><small>Repasses descontados à taxa mínima de atratividade do empreendimento.</small></div>'+ 
  '<div class="executive-land-note"><span>'+values.model+'</span><b>Efeito do desconto temporal: '+money(values.difference)+'</b></div>';

 let card=document.querySelector('[data-health-score-card]');
 if(card)card.remove();
 card=document.createElement('section');
 card.className='health-score-card '+score.tone;
 card.dataset.healthScoreCard='1';
 card.innerHTML=
  '<div class="health-score-summary"><div class="health-ring" style="--score:'+score.score+'"><div><strong>'+score.score+'</strong><span>/ 100</span></div></div><div class="health-score-title"><span>SCORE DE SAÚDE DO EMPREENDIMENTO</span><h2>'+score.classification+'</h2><p>Leitura composta de rentabilidade, cobertura, liquidez, vendas, dívida e funding.</p></div><div class="health-score-focus"><span>PRINCIPAIS PONTOS DE ATENÇÃO</span>'+score.weakest.map(item=>'<b>'+item.label+' · '+fmt(item.score,1)+'/'+item.max+'</b>').join('')+'</div></div>'+ 
  '<div class="health-dimensions">'+dimensionRows(score)+'</div>'+ 
  '<details class="health-method"><summary>Como a nota é calculada</summary><p>Pesos: rentabilidade 25, cobertura da obra 20, liquidez e exposição 20, absorção comercial 15, dívida na entrega 10 e funding não coberto 10. A nota é um indicador de triagem, não uma aprovação de investimento.</p>'+(score.guards.length?'<p><b>Guardrails aplicados:</b> '+score.guards.join(' ')+'</p>':'')+'</details>';
 land.insertAdjacentElement('afterend',card);
}

function enhanceReport(data){
 const report=document.querySelector('.report');
 if(!report)return;
 const signature=data.project.id+'|'+JSON.stringify(data.project.params)+'|'+String(data.project.updated||'');
 const old=report.querySelector('.health-score-report');
 if(old?.dataset.signature===signature)return;
 if(old)old.remove();
 const values=landValues(data.project,data.result),score=health(data.project,data.result),block=document.createElement('div');
 block.className='report-block health-score-report';
 block.dataset.signature=signature;
 block.innerHTML='<h3>01A · Saúde do empreendimento e valor econômico do terreno</h3><div class="report-health-grid"><div><span>Score de saúde</span><b>'+score.score+' / 100 · '+score.classification+'</b><small>Indicador composto de triagem.</small></div><div><span>Terreno sem TMA</span><b>'+money(values.nominal)+' · '+pct(values.nominalPct)+' do VGV</b><small>Valor nominal dos repasses.</small></div><div><span>Terreno com TMA '+pct(values.tma)+' a.a.</span><b>'+money(values.discounted)+' · '+pct(values.discountedPct)+' do VGV</b><small>Valor presente dos repasses.</small></div></div><p class="panel-sub">O score não substitui diligência jurídica, urbanística, comercial, de engenharia ou de crédito. Os pesos e faixas são referências internas da plataforma e devem ser calibrados com o histórico da Évora.</p>';
 const target=Array.from(report.querySelectorAll('.report-block')).find(item=>item.querySelector('h3')?.textContent.startsWith('02'));
 if(target)report.insertBefore(block,target);else report.appendChild(block);
}

function installStyles(){
 if(document.getElementById('health-score-style'))return;
 const style=document.createElement('style');
 style.id='health-score-style';
 style.textContent=`
 .executive-land .land-dual-card{background:#fff;padding:16px 18px}.executive-land .land-dual-card.vpl{background:#f4f8f0}.land-dual-card>span{display:block;font-size:8px;letter-spacing:1px;color:var(--muted)}.land-dual-card>strong{display:block;font-size:21px;letter-spacing:-.5px;margin:7px 0 3px}.land-dual-card>b{display:block;font-size:11px;color:#476a4d}.land-dual-card>small{display:block;font-size:8px;color:var(--muted);margin-top:5px;line-height:1.5}
 .health-score-card{background:#fff;border:1px solid var(--line);border-radius:9px;padding:20px;margin-bottom:20px}.health-score-card.strong{border-color:#b9d0ad}.health-score-card.stable{border-color:#d5dfc9}.health-score-card.attention{border-color:#ead8b5}.health-score-card.critical{border-color:#e5c3b9}.health-score-summary{display:grid;grid-template-columns:auto minmax(0,1fr) minmax(220px,.65fr);gap:18px;align-items:center}.health-ring{--score:0;width:92px;height:92px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#497d58 calc(var(--score)*1%),#e8eee4 0);position:relative}.health-ring:before{content:'';position:absolute;inset:8px;background:#fff;border-radius:50%}.health-ring>div{position:relative;text-align:center}.health-ring strong{display:block;font-size:28px;line-height:1}.health-ring span{display:block;font-size:8px;color:var(--muted);margin-top:3px}.health-score-title>span,.health-score-focus>span{display:block;font-size:8px;letter-spacing:1px;color:var(--muted)}.health-score-title h2{font-size:24px;margin-top:5px}.health-score-title p{font-size:9px;color:var(--muted);margin-top:5px}.health-score-focus{border-left:1px solid var(--line);padding-left:18px}.health-score-focus b{display:block;font-size:10px;margin-top:8px}.health-dimensions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:20px;padding-top:18px;border-top:1px solid var(--line)}.health-dimension-head{display:flex;justify-content:space-between;gap:10px}.health-dimension-head strong{display:block;font-size:10px}.health-dimension-head span{display:block;font-size:8px;color:var(--muted);margin-top:3px}.health-dimension-head>b{font-size:9px}.health-track{height:5px;border-radius:4px;background:#e9eee5;overflow:hidden;margin:8px 0 6px}.health-track i{display:block;height:100%;background:#648693}.health-dimension small{font-size:8px;color:var(--muted);line-height:1.45}.health-method{margin-top:16px;border-top:1px solid var(--line);padding-top:12px}.health-method summary{cursor:pointer;font-size:9px;font-weight:600;color:var(--green)}.health-method p{font-size:8px;color:var(--muted);line-height:1.6;margin-top:8px}.report-health-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:7px;overflow:hidden}.report-health-grid>div{background:#fafbf8;padding:12px 14px}.report-health-grid span{display:block;font-size:8px;color:var(--muted)}.report-health-grid b{display:block;font-size:11px;margin-top:5px}.report-health-grid small{display:block;font-size:8px;color:var(--muted);margin-top:4px}
 @media(max-width:980px){.health-score-summary{grid-template-columns:auto 1fr}.health-score-focus{grid-column:2;border-left:0;border-top:1px solid var(--line);padding:12px 0 0}.health-dimensions{grid-template-columns:repeat(2,minmax(0,1fr))}}
 @media(max-width:720px){.health-score-summary{grid-template-columns:1fr}.health-ring{width:78px;height:78px}.health-score-focus{grid-column:auto}.health-dimensions,.report-health-grid{grid-template-columns:1fr}.executive-land .land-dual-card{padding:14px}.land-dual-card>strong{font-size:18px}}
 @media print{.health-score-card{break-inside:avoid}.health-method{display:none}}
 `;
 document.head.appendChild(style);
}

let scheduled=false;
function enhance(){
 if(scheduled)return;
 scheduled=true;
 requestAnimationFrame(()=>{
  scheduled=false;
  installStyles();
  const data=active();
  if(!data)return;
  enhanceDashboard(data);
  enhanceReport(data);
 });
}

const root=document.getElementById('app');
if(root)new MutationObserver(enhance).observe(root,{childList:true,subtree:true});
window.addEventListener('storage',enhance);
enhance();
})();
