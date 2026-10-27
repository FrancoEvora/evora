(function(){
'use strict';
const STORE='evora.viabilidade.v1';
const RANGE_KEY='evora.executive.range.v1';

const money=v=>{
 const n=Number(v)||0,a=Math.abs(n),sign=n<0?'−':'';
 const value=a>=1e6?(a/1e6).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' mi':a>=1e4?(a/1e3).toLocaleString('pt-BR',{maximumFractionDigits:0})+' mil':a.toLocaleString('pt-BR',{maximumFractionDigits:0});
 return sign+'R$ '+value;
};
const pct=v=>(Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';

function activeResult(){
 try{
  const library=JSON.parse(localStorage.getItem(STORE));
  if(!library||!Array.isArray(library.projects)||!library.projects.length||!window.EvoraEngine)return null;
  const project=library.projects.find(item=>item.id===library.active)||library.projects[0];
  if(!project||!project.params)return null;
  return {project,result:window.EvoraEngine.simulate(project.params,true)};
 }catch{return null;}
}

function panelByTitle(title){
 return Array.from(document.querySelectorAll('.panel')).find(panel=>panel.querySelector('h2')?.textContent.trim()===title)||null;
}

function enhanceExecutiveRanges(){
 const panel=panelByTitle('Caixa disponível para obra × implantação')||panelByTitle('Carteira × implantação');
 const segmented=panel?.querySelector('.segmented');
 if(!segmented||segmented.dataset.shortHorizons==='1')return;
 let active=sessionStorage.getItem(RANGE_KEY);
 if(!active)active=segmented.querySelector('.active')?.dataset.value||'36';
 const ranges=[['6','6m'],['12','12m'],['24','24m'],['36','36m'],['60','60m'],['all','Ciclo']];
 segmented.innerHTML=ranges.map(([value,label])=>'<button data-action="range" data-value="'+value+'" class="'+(String(active)===value?'active':'')+'">'+label+'</button>').join('');
 segmented.dataset.shortHorizons='1';
 segmented.setAttribute('aria-label','Horizonte da projeção executiva');
}

function fundingDiagnostics(project,result){
 const params=project.params,rows=result.rows;
 let cumulativeExtra=0,cumulativeDistributions=0,cumulativeInterest=0,cumulativeFees=0;
 let peak={value:0,month:0,equityOutstanding:0,debt:0,cashReserve:0,operatingGap:0,financeCost:0,work:0,cashForWork:0};
 let peakDebt=0,peakDebtMonth=0;
 for(const row of rows){
  cumulativeExtra+=Number(row.extraEquity)||0;
  cumulativeDistributions+=Number(row.distribution)||0;
  cumulativeInterest+=Number(row.interest)||0;
  cumulativeFees+=Number(row.fee)||0;
  const equityOutstanding=Math.max(0,(Number(params.equity)||0)+cumulativeExtra-cumulativeDistributions);
  const debt=Math.max(0,Number(row.debt)||0);
  const cashReserve=Math.max(0,Number(row.bank)||0);
  const utilized=Math.max(0,equityOutstanding+debt-cashReserve);
  if(debt>peakDebt){peakDebt=debt;peakDebtMonth=Number(row.t)||0;}
  if(utilized>peak.value){
   peak={
    value:utilized,
    month:Number(row.t)||0,
    equityOutstanding,
    debt,
    cashReserve,
    operatingGap:Math.max(0,-(Number(row.cumulative)||0)),
    financeCost:cumulativeInterest+cumulativeFees,
    work:Number(row.cumWork)||0,
    cashForWork:Number(row.cumCashForWork)||0
   };
  }
 }
 return {
  peak,
  peakDebt,
  peakDebtMonth,
  totalDraw:Number(result.totals.draw)||0,
  totalRepay:Number(result.totals.repay)||0,
  endingDebt:Math.max(0,Number(rows.at(-1)?.debt)||0),
  totalInterest:Number(result.totals.interest)||0,
  totalFees:Number(result.totals.fee)||0
 };
}

function enhanceCapitalStructure(){
 const panel=panelByTitle('Estrutura de capital');
 if(!panel)return;
 const data=activeResult();
 if(!data)return;
 const signature=data.project.id+'|'+String(data.project.updated||'')+'|'+JSON.stringify(data.project.params);
 if(panel.dataset.fundingReconciled===signature)return;
 panel.dataset.fundingReconciled=signature;

 const params=data.project.params,result=data.result,totals=result.totals,diag=fundingDiagnostics(data.project,result),peak=diag.peak;
 const work=Math.max(0,Number(totals.work)||0);
 const rawCash=Number(totals.cashForWorkAtCompletion)||0;
 const contributionCapacity=Math.max(0,rawCash);
 const contribution=Math.min(work,contributionCapacity);
 const contributionPct=work>0?Math.min(100,contribution/work*100):0;
 const portfolioNet=Math.max(0,Number(totals.portfolioNetAtCompletion)||0);
 const uncovered=Math.max(0,work-contribution);
 const surplus=Math.max(0,contributionCapacity-work);
 const workEnd=Number(totals.workEnd)||0;
 const grossSources=peak.equityOutstanding+peak.debt;
 const equityPct=grossSources>0?peak.equityOutstanding/grossSources*100:0;
 const debtPct=grossSources>0?peak.debt/grossSources*100:0;
 const reconciliationDifference=peak.value-(peak.operatingGap+peak.financeCost);

 const head=panel.querySelector('.panel-head');
 Array.from(panel.children).forEach(child=>{if(child!==head)child.remove();});

 const content=document.createElement('div');
 content.className='funding-reconciliation';
 content.dataset.portfolioContribution='1';
 content.innerHTML=
  '<div class="funding-need">'+
   '<div><span>NECESSIDADE MÁXIMA SIMULTÂNEA DE FUNDING</span><strong>'+money(peak.value)+'</strong><small>Pico em M'+peak.month+'. Já desconta os recebíveis, a geração própria acumulada e o caixa não utilizado.</small></div>'+
   '<div class="funding-need-rate"><span>EXPOSIÇÃO OPERACIONAL NO PICO</span><strong>'+money(peak.operatingGap)+'</strong><small>Antes dos custos financeiros.</small></div>'+
  '</div>'+
  '<div class="funding-formula"><span>Obra e demais saídas acumuladas</span><b>'+money(peak.work)+'</b><i>−</i><span>Caixa disponível gerado pelos recebíveis</span><b>'+money(peak.cashForWork)+'</b><i>+</i><span>Juros e tarifas até o pico</span><b>'+money(peak.financeCost)+'</b><i>=</i><span>Funding máximo necessário</span><b>'+money(peak.value)+'</b></div>'+
  (Math.abs(reconciliationDifference)>1000?'<p class="funding-difference">A diferença residual de '+money(reconciliationDifference)+' decorre da posição de caixa e da ordem mensal de saques, amortizações e aportes.</p>':'')+
  '<div class="funding-sources-title"><span>FONTES EM ABERTO NO MÊS DO PICO</span><strong>'+money(grossSources)+'</strong></div>'+
  '<div class="funding-source-bar"><i class="equity" style="width:'+equityPct+'%"></i><i class="debt" style="width:'+debtPct+'%"></i></div>'+
  '<div class="funding-source-row"><div><span class="funding-dot equity"></span><strong>Capital próprio e aportes acumulados</strong></div><div><b>'+money(peak.equityOutstanding)+'</b><small>'+pct(equityPct)+' das fontes em aberto</small></div></div>'+
  '<div class="funding-source-row"><div><span class="funding-dot debt"></span><strong>Dívida em aberto</strong></div><div><b>'+money(peak.debt)+'</b><small>'+pct(debtPct)+' das fontes em aberto</small></div></div>'+
  '<div class="funding-source-row cash"><div><span class="funding-dot cash"></span><strong>Caixa ainda não utilizado</strong></div><div><b>− '+money(peak.cashReserve)+'</b><small>Deduzido para chegar ao funding efetivamente empregado</small></div></div>'+
  '<div class="funding-flow"><div><span>Saques brutos no ciclo</span><b>'+money(diag.totalDraw)+'</b></div><div><span>Amortizações no ciclo</span><b>'+money(diag.totalRepay)+'</b></div><div><span>Pico da dívida</span><b>'+money(diag.peakDebt)+' · M'+diag.peakDebtMonth+'</b></div><div><span>Saldo final da dívida</span><b>'+money(diag.endingDebt)+'</b></div></div>'+
  '<div class="portfolio-contribution">'+
   '<div class="portfolio-contribution-head"><div><span>CONTRIBUIÇÃO ESPERADA DA CARTEIRA À OBRA</span><strong>'+money(contribution)+'</strong><small>Valor absorvível pela obra, limitado ao custo projetado de '+money(work)+'.</small></div><div class="portfolio-contribution-rate"><strong>'+pct(contributionPct)+'</strong><small>da obra total</small></div></div>'+
   '<div class="portfolio-contribution-track"><i style="width:'+contributionPct+'%"></i></div>'+
   '<div class="portfolio-contribution-detail"><span>Capacidade de caixa para obra até a entrega em M'+workEnd+'</span><b>'+money(contributionCapacity)+'</b></div>'+
   '<div class="portfolio-contribution-detail"><span>Carteira líquida acumulada até a entrega</span><b>'+money(portfolioNet)+'</b></div>'+
   '<div class="portfolio-contribution-detail"><span>'+(surplus>0?'Excedente depois de cobrir a obra':'Obra ainda não coberta')+'</span><b>'+money(surplus>0?surplus:uncovered)+'</b></div>'+
   '<p>Esta contribuição já está incorporada ao cálculo da necessidade de funding acima. Aumentar recebimentos ou antecipá-los eleva o caixa disponível e reduz diretamente o funding necessário; não se soma a carteira novamente às fontes de capital.</p>'+
  '</div>'+
  '<div class="funding-rule"><strong>Regra de leitura:</strong> funding é o déficit máximo líquido depois dos recebíveis, acrescido dos custos financeiros até o pico. Saques brutos e aportes feitos em meses diferentes não devem ser simplesmente somados para representar necessidade de capital.</div>';
 panel.appendChild(content);
}

function installStyles(){
 if(document.getElementById('executive-enhancements-style'))return;
 const style=document.createElement('style');
 style.id='executive-enhancements-style';
 style.textContent=`
 .funding-reconciliation{display:grid;gap:15px}
 .funding-need{display:flex;justify-content:space-between;gap:20px;padding:17px;border:1px solid #d8e4d2;border-radius:8px;background:#f3f7ef}
 .funding-need span,.funding-sources-title span{display:block;font-size:8px;letter-spacing:1px;color:#6a7772}
 .funding-need strong{display:block;font-size:27px;letter-spacing:-.8px;margin:7px 0 4px}
 .funding-need small{display:block;font-size:8px;line-height:1.5;color:#6a7772;max-width:350px}
 .funding-need-rate{text-align:right;min-width:150px}
 .funding-need-rate strong{font-size:20px;color:#9a5947}
 .funding-formula{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px 14px;padding:14px 15px;border:1px solid #e3e8de;border-radius:7px;background:#fff}
 .funding-formula span{font-size:9px;color:#6a7772}.funding-formula b{text-align:right;font-size:10px}.funding-formula i{grid-column:1/-1;height:1px;background:#edf0e9;font-size:0}
 .funding-difference{font-size:8px;line-height:1.5;color:#8b6b50;margin:-8px 0 0}
 .funding-sources-title{display:flex;justify-content:space-between;align-items:flex-end;gap:12px}.funding-sources-title strong{font-size:17px}
 .funding-source-bar{height:14px;border-radius:4px;overflow:hidden;background:#edf1e9;display:flex}.funding-source-bar i{display:block;height:100%}.funding-source-bar .equity{background:#426d59}.funding-source-bar .debt{background:#93b27f}
 .funding-source-row{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:9px 0;border-bottom:1px solid #e7ebe3}.funding-source-row>div:first-child{display:flex;align-items:center;gap:8px}.funding-source-row strong{font-size:10px}.funding-source-row>div:last-child{text-align:right}.funding-source-row b{display:block;font-size:11px}.funding-source-row small{display:block;font-size:8px;color:#6a7772;margin-top:3px}
 .funding-dot{width:8px;height:8px;border-radius:2px;flex:0 0 auto}.funding-dot.equity{background:#426d59}.funding-dot.debt{background:#93b27f}.funding-dot.cash{background:#78919a}.funding-source-row.cash{background:#f8faf7;padding:9px 8px;border-radius:5px}
 .funding-flow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:#e5e9e1;border:1px solid #e5e9e1;border-radius:7px;overflow:hidden}.funding-flow>div{background:#fafbf8;padding:11px 13px}.funding-flow span{display:block;font-size:8px;color:#6a7772}.funding-flow b{display:block;font-size:11px;margin-top:5px}
 .portfolio-contribution{padding:16px;border:1px solid #dce6d4;border-radius:8px;background:#f5f8f1}.portfolio-contribution-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.portfolio-contribution-head span{display:block;font-size:8px;letter-spacing:1px;color:#6a7772}.portfolio-contribution-head>div>strong{display:block;font-size:22px;letter-spacing:-.7px;margin:7px 0 4px}.portfolio-contribution-head small{display:block;font-size:8px;line-height:1.5;color:#6a7772}.portfolio-contribution-rate{text-align:right;min-width:100px}.portfolio-contribution-rate strong{font-size:20px!important;color:#315f43}.portfolio-contribution-track{height:8px;margin:14px 0 12px;border-radius:5px;background:#e2eadc;overflow:hidden}.portfolio-contribution-track i{display:block;height:100%;background:#497d58}.portfolio-contribution-detail{display:flex;justify-content:space-between;gap:12px;font-size:9px;padding:6px 0;border-top:1px solid #e4eadf}.portfolio-contribution-detail span{color:#6a7772}.portfolio-contribution-detail b{font-size:10px}.portfolio-contribution p,.funding-rule{font-size:8px;line-height:1.6;color:#6a7772;margin-top:8px}.funding-rule{padding:11px 13px;background:#eef3ea;border-left:3px solid #698563;border-radius:0 5px 5px 0}.funding-rule strong{color:#24382e}
 .panel .segmented[data-short-horizons="1"]{flex-wrap:wrap}.panel .segmented[data-short-horizons="1"] button{min-width:34px}
 @media(max-width:720px){.funding-need,.portfolio-contribution-head{display:block}.funding-need-rate,.portfolio-contribution-rate{text-align:left;margin-top:12px}.funding-flow{grid-template-columns:1fr}.portfolio-contribution-detail{display:block}.portfolio-contribution-detail b{display:block;margin-top:4px}}
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
  enhanceExecutiveRanges();
  enhanceCapitalStructure();
 });
}

document.addEventListener('click',event=>{
 const button=event.target.closest('[data-action="range"]');
 if(button)sessionStorage.setItem(RANGE_KEY,String(button.dataset.value));
},true);

const root=document.getElementById('app');
if(root)new MutationObserver(enhance).observe(root,{childList:true,subtree:true});
window.addEventListener('storage',enhance);
enhance();
})();
