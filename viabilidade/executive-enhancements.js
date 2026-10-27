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

function enhanceCapitalStructure(){
 const panel=panelByTitle('Estrutura de capital');
 if(!panel||panel.querySelector('[data-portfolio-contribution]'))return;
 const data=activeResult();
 if(!data)return;
 const totals=data.result.totals;
 const work=Math.max(0,Number(totals.work)||0);
 const rawCash=Number(totals.cashForWorkAtCompletion)||0;
 const contribution=Math.max(0,rawCash);
 const contributionPct=work>0?contribution/work*100:0;
 const portfolioNet=Math.max(0,Number(totals.portfolioNetAtCompletion)||0);
 const uncovered=Math.max(0,work-contribution);
 const workEnd=Number(totals.workEnd)||0;
 const status=rawCash<0?'O caixa acumulado disponível ainda é negativo na entrega; por isso a contribuição líquida considerada é zero.':contributionPct>=100?'A geração própria projetada supera o custo total da obra.':'Parcela da obra ainda não coberta por essa contribuição: '+money(uncovered)+'.';
 const block=document.createElement('div');
 block.className='portfolio-contribution';
 block.dataset.portfolioContribution='1';
 block.innerHTML='<div class="portfolio-contribution-head"><div><span>CONTRIBUIÇÃO ESPERADA DA CARTEIRA À OBRA</span><strong>'+money(contribution)+'</strong><small>Caixa acumulado disponível para obra até a entrega em M'+workEnd+'.</small></div><div class="portfolio-contribution-rate"><strong>'+pct(contributionPct)+'</strong><small>do custo total projetado da obra</small></div></div><div class="portfolio-contribution-track"><i style="width:'+Math.min(100,Math.max(0,contributionPct))+'%"></i></div><div class="portfolio-contribution-detail"><span>Carteira líquida acumulada até a entrega</span><b>'+money(portfolioNet)+'</b></div><p>'+status+'</p>';
 const head=panel.querySelector('.panel-head');
 if(head)head.insertAdjacentElement('afterend',block);else panel.prepend(block);
}

function installStyles(){
 if(document.getElementById('executive-enhancements-style'))return;
 const style=document.createElement('style');
 style.id='executive-enhancements-style';
 style.textContent='.portfolio-contribution{margin:0 0 18px;padding:16px;border:1px solid #dce6d4;border-radius:8px;background:#f5f8f1}.portfolio-contribution-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.portfolio-contribution-head span{display:block;font-size:8px;letter-spacing:1px;color:#6a7772}.portfolio-contribution-head>div>strong{display:block;font-size:24px;letter-spacing:-.7px;margin:7px 0 4px}.portfolio-contribution-head small{display:block;font-size:8px;line-height:1.5;color:#6a7772}.portfolio-contribution-rate{text-align:right;min-width:110px}.portfolio-contribution-rate strong{font-size:22px!important;color:#315f43}.portfolio-contribution-track{height:8px;margin:14px 0 12px;border-radius:5px;background:#e2eadc;overflow:hidden}.portfolio-contribution-track i{display:block;height:100%;background:#497d58}.portfolio-contribution-detail{display:flex;justify-content:space-between;gap:12px;font-size:9px;padding-top:2px}.portfolio-contribution-detail span{color:#6a7772}.portfolio-contribution-detail b{font-size:10px}.portfolio-contribution p{font-size:8px;line-height:1.55;color:#6a7772;margin-top:8px}.panel .segmented[data-short-horizons="1"]{flex-wrap:wrap}.panel .segmented[data-short-horizons="1"] button{min-width:34px}@media(max-width:720px){.portfolio-contribution-head{display:block}.portfolio-contribution-rate{text-align:left;margin-top:12px}.portfolio-contribution-detail{display:block}.portfolio-contribution-detail b{display:block;margin-top:4px}}';
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
