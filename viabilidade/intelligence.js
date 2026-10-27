/* Évora Viabilidade · Arisa Intelligence v1.0 */
(function(){
'use strict';
if(window.__evoraIntelligenceV1)return;
window.__evoraIntelligenceV1=true;

const STORE='evora.viabilidade.v1';
const SESSION_KEY='evora.supabase.session.v1';
const CONFIG_ENDPOINT='/supabase-config.json';
const E=window.EvoraEngine;
if(!E)return;

const state={
 projectId:null,
 messages:[],
 threadId:null,
 loaded:false,
 loadingHistory:false,
 loading:false,
 error:'',
 config:null,
 snapshotKey:'',
 snapshot:null,
 lastModel:'',
};

const quickPrompts=[
 {id:'diagnosis',title:'Diagnóstico executivo',description:'Saúde, liquidez, rentabilidade e riscos prioritários.',prompt:'Faça um diagnóstico executivo completo deste empreendimento. Identifique os três principais pontos fortes, os três principais riscos e a prioridade número um da gestão.'},
 {id:'funding',title:'Reduzir funding',description:'Recebíveis, obra, capital próprio e dívida.',prompt:'Analise como reduzir a necessidade máxima simultânea de funding. Compare antecipação de recebíveis, velocidade de vendas, entrada, etapas da obra e estrutura de crédito. Priorize as medidas pelo impacto e pela viabilidade.'},
 {id:'sales',title:'Preço × velocidade',description:'Melhor equilíbrio entre preço, absorção e caixa.',prompt:'Use os cenários e a matriz de sensibilidade para indicar o melhor equilíbrio entre preço e velocidade de vendas. Não escolha apenas o maior VPL: considere funding, cobertura da obra e risco comercial.'},
 {id:'stages',title:'Etapas da obra',description:'Reprogramar fases para reduzir exposição.',prompt:'Analise o cronograma e as etapas da obra. Proponha uma sequência ou sobreposição mais eficiente para reduzir exposição de caixa sem comprometer a entrega do produto.'},
 {id:'land',title:'Terreno e parceria',description:'Peso econômico do terreno e alternativas.',prompt:'Avalie o peso econômico do terreno, com e sem TMA, e sua relação com o VGV. Indique se a estrutura atual parece pressionar o empreendimento e quais alternativas de negociação deveriam ser simuladas.'},
 {id:'decision',title:'Melhor solução',description:'Cenário recomendado e plano de ação.',prompt:'Considerando todos os dados disponíveis, proponha a melhor solução global para o empreendimento. Apresente o cenário recomendado, as mudanças exatas a simular, os efeitos esperados e as validações necessárias.'},
];

const safeJSON=(value,fallback=null)=>{try{return JSON.parse(value);}catch{return fallback;}};
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,Number(value)||0));
const fmt=(value,digits=0)=>Number.isFinite(Number(value))?Number(value).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
const pct=(value,digits=1)=>Number.isFinite(Number(value))?fmt(Number(value),digits)+'%':'—';
const money=value=>{
 const n=Number(value);
 if(!Number.isFinite(n))return '—';
 const a=Math.abs(n),sign=n<0?'−':'';
 return sign+'R$ '+(a>=1e6?fmt(a/1e6,1)+' mi':a>=1e4?fmt(a/1e3,0)+' mil':fmt(a,0));
};
const nowISO=()=>new Date().toISOString();
const stamp=value=>{const n=Date.parse(value||'');return Number.isFinite(n)?n:0;};

function readLibrary(){
 const value=safeJSON(localStorage.getItem(STORE),null);
 return value&&Array.isArray(value.projects)&&value.projects.length?value:null;
}
function activeProject(){
 const library=readLibrary();
 if(!library)return null;
 return library.projects.find(project=>project.id===library.active)||library.projects[0]||null;
}
function readSession(){
 const value=safeJSON(localStorage.getItem(SESSION_KEY),null);
 return value&&value.access_token&&value.refresh_token?value:null;
}
function scoreTone(score){return score>=80?'strong':score>=65?'stable':score>=50?'attention':'critical';}
function scoreLabel(score){return score>=80?'Forte':score>=65?'Estável':score>=50?'Atenção':'Crítica';}

function health(result){
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
  {id:'profitability',label:'Rentabilidade',max:25,score:25*clamp(profitabilityRatio/.15),metric:pct(profitabilityRatio*100)},
  {id:'coverage',label:'Cobertura da obra',max:20,score:20*coverageRatio,metric:pct(Number(t.coverage)||0)},
  {id:'liquidity',label:'Liquidez e exposição',max:20,score:20*(1-peakFundingRatio),metric:pct((Number(t.peak)||0)/work*100)},
  {id:'sales',label:'Absorção comercial',max:15,score:15*soldRatio,metric:pct(soldRatio*100)},
  {id:'debt',label:'Dívida na entrega',max:10,score:10*(1-debtRatio),metric:peakDebt>0?pct(debtRatio*100):'Sem dívida'},
  {id:'funding',label:'Funding não coberto',max:10,score:10*(1-extraRatio),metric:money(Number(t.extra)||0)},
 ].map(item=>({...item,score:clamp(item.score,0,item.max)}));
 let score=Math.round(dimensions.reduce((sum,item)=>sum+item.score,0));
 const guards=[];
 if((Number(t.vpl)||0)<0&&score>49){score=49;guards.push('VPL negativo limita a nota a 49.');}
 if((Number(t.extra)||0)>1&&score>69){score=69;guards.push('Funding adicional não coberto limita a nota a 69.');}
 const weakest=[...dimensions].sort((a,b)=>(a.score/a.max)-(b.score/b.max)).slice(0,2);
 return {score,classification:scoreLabel(score),tone:scoreTone(score),dimensions,weakest,guards,peakDebt,debtAtDelivery};
}

function fundingDiagnostics(params,result){
 let cumulativeExtra=0,cumulativeDistributions=0,cumulativeInterest=0,cumulativeFees=0;
 let peak={value:0,month:0,equityOutstanding:0,debt:0,cashReserve:0,operatingGap:0,financeCost:0,work:0,cashForWork:0};
 let peakDebt=0,peakDebtMonth=0;
 for(const row of result.rows){
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
   peak={value:utilized,month:Number(row.t)||0,equityOutstanding,debt,cashReserve,operatingGap:Math.max(0,-(Number(row.cumulative)||0)),financeCost:cumulativeInterest+cumulativeFees,work:Number(row.cumWork)||0,cashForWork:Number(row.cumCashForWork)||0};
  }
 }
 return {peak,peakDebt,peakDebtMonth,totalDraw:Number(result.totals.draw)||0,totalRepay:Number(result.totals.repay)||0,endingDebt:Math.max(0,Number(result.rows.at(-1)?.debt)||0),totalInterest:Number(result.totals.interest)||0,totalFees:Number(result.totals.fee)||0};
}

function actualSummary(project,result){
 const actuals=project.actuals&&typeof project.actuals==='object'?project.actuals:{sales:{},work:{}};
 const salesEntries=Object.entries(actuals.sales||{}).map(([month,value])=>[Number(month),Number(value)]).filter(([month,value])=>Number.isFinite(month)&&Number.isFinite(value));
 const workEntries=Object.entries(actuals.work||{}).map(([month,value])=>[Number(month),Number(value)]).filter(([month,value])=>Number.isFinite(month)&&Number.isFinite(value));
 const lastSales=salesEntries.length?Math.max(...salesEntries.map(item=>item[0])):null;
 const lastWork=workEntries.length?Math.max(...workEntries.map(item=>item[0])):null;
 const soldActual=salesEntries.reduce((sum,item)=>sum+item[1],0);
 const workActual=Math.min(100,workEntries.reduce((sum,item)=>sum+item[1],0));
 const soldPlan=lastSales===null?null:Number(result.rows[Math.min(lastSales,result.rows.length-1)]?.cumUnits)||0;
 let workPlan=null;
 if(lastWork!==null){
  const end=Math.min(result.workWeights.length-1,lastWork-result.p.workStart);
  workPlan=end<0?0:result.workWeights.slice(0,end+1).reduce((sum,value)=>sum+Number(value||0),0)*100;
 }
 return {available:Boolean(salesEntries.length||workEntries.length),sales:{lastMonth:lastSales,actual:soldActual,planned:soldPlan,deviation:soldPlan===null?null:soldActual-soldPlan},work:{lastMonth:lastWork,actual:workActual,planned:workPlan,deviation:workPlan===null?null:workActual-workPlan},baselineSavedAt:actuals.plan?.savedAt||null};
}

function stageSnapshot(params,result){
 const stages=Array.isArray(result.stages)&&result.stages.length?result.stages:[{id:'single',name:'Implantação',budget:Number(params.work)||0,start:Number(params.workStart)||0,duration:Number(params.duration)||0,end:Number(result.totals.workEnd)||0,contingency:Number(params.contingency)||0,curve:params.curve||'s',nominalTotal:Number(result.totals.work)||0}];
 const total=Math.max(1,stages.reduce((sum,stage)=>sum+(Number(stage.budget)||0),0));
 return stages.map(stage=>({name:stage.name,budget:Number(stage.budget)||0,share:(Number(stage.budget)||0)/total*100,start:Number(stage.start)||0,end:Number(stage.end??((Number(stage.start)||0)+(Number(stage.duration)||0)-1))||0,duration:Number(stage.duration)||0,contingency:Number(stage.contingency)||0,curve:stage.curve||'s',nominalTotal:Number(stage.nominalTotal)||null}));
}

function scenarioSnapshot(params){
 return E.scenarios(params).map(item=>{
  if(item.error)return {id:item.id,name:item.name,description:item.description,error:item.error};
  const t=item.result.totals,h=health(item.result),diag=fundingDiagnostics(item.result.p,item.result);
  return {id:item.id,name:item.name,description:item.description,price:Number(item.result.p.price)||0,speed:Number(item.result.p.speed)||0,work:Number(t.work)||0,vpl:Number(t.vpl)||0,peakOperational:Number(t.peak)||0,fundingMaximum:Number(diag.peak.value)||0,coverage:Number(t.coverage)||0,extraFunding:Number(t.extra)||0,margin:Number(t.margin)||0,lastSale:Number(t.lastSale)||0,score:h.score,classification:h.classification};
 });
}

function sensitivitySnapshot(params){
 const rows=[];
 for(const speedDelta of [-30,-15,0,15,30]){
  for(const priceDelta of [-10,-5,0,5,10]){
   try{
    const test=E.simulate({...params,price:params.price*(1+priceDelta/100),speed:params.speed*(1+speedDelta/100)},true),t=test.totals,diag=fundingDiagnostics(test.p,test);
    rows.push({priceDelta,speedDelta,price:Number(test.p.price)||0,speed:Number(test.p.speed)||0,vpl:Number(t.vpl)||0,peakOperational:Number(t.peak)||0,fundingMaximum:Number(diag.peak.value)||0,coverage:Number(t.coverage)||0,extraFunding:Number(t.extra)||0,lastSale:Number(t.lastSale)||0});
   }catch(error){rows.push({priceDelta,speedDelta,error:error.message});}
  }
 }
 return rows;
}

function timelineSnapshot(result){
 const t=result.totals,months=[0,6,12,24,36,Number(t.workEnd)||0,Number(t.peakMonth)||0,Number(t.lastSale)||0,Number(t.horizon)||0];
 return [...new Set(months.filter(month=>Number.isInteger(month)&&month>=0&&month<result.rows.length))].sort((a,b)=>a-b).map(month=>{
  const row=result.rows[month]||{};
  return {month,received:Number(row.received)||0,cumulativeReceived:Number(row.cumReceived)||0,cumulativePortfolioNet:Number(row.cumPortfolioNet)||0,cumulativeCashForWork:Number(row.cumCashForWork)||0,cumulativeWork:Number(row.cumWork)||0,operatingBalance:Number(row.cumulative)||0,debt:Number(row.debt)||0,bank:Number(row.bank)||0,unitsSoldInMonth:Number(row.units)||0,cumulativeUnits:Number(row.cumUnits)||0};
 });
}

function buildSnapshot(project){
 const key=project.id+'|'+String(project.updated||'')+'|'+JSON.stringify(project.params);
 if(state.snapshotKey===key&&state.snapshot)return state.snapshot;
 const result=E.simulate(project.params,true),params=result.p,t=result.totals,h=health(result),diag=fundingDiagnostics(params,result),stages=stageSnapshot(params,result);
 const work=Math.max(0,Number(t.work)||0),capacity=Math.max(0,Number(t.cashForWorkAtCompletion)||0),contribution=Math.min(work,capacity),surplus=Math.max(0,capacity-work),uncovered=Math.max(0,work-contribution),vgv=Math.max(1,Number(t.vgv)||0),landNominal=Math.max(0,Number(t.land)||0),landVpl=Math.max(0,Number(t.landVpl)||0);
 const snapshot={
  schemaVersion:1,
  engineVersion:E.version,
  generatedAt:nowISO(),
  project:{id:project.id,name:params.name,city:params.city,updatedAt:project.updated||null},
  health:{score:h.score,classification:h.classification,guards:h.guards,weakest:h.weakest.map(item=>({label:item.label,score:item.score,max:item.max,metric:item.metric})),dimensions:h.dimensions},
  premises:{start:params.start,area:params.area,use:params.use,lot:params.lot,price:params.price,discount:params.discount,salesStart:params.salesStart,launch:params.launch,speed:params.speed,salesCurve:params.salesCurve,cashSales:params.cashSales,entry:params.entry,entryMonths:params.entryMonths,term:params.term,interest:params.interest,system:params.system,index:params.index,correction:params.correction,indexFrequency:params.indexFrequency,balloon:params.balloon,balloons:params.balloons,loss:params.loss,late:params.late,delay:params.delay,workInflation:params.workInflation,landMode:params.landMode,landShare:params.landShare,landPrice:params.landPrice,predev:params.predev,commission:params.commission,marketing:params.marketing,tax:params.tax,servicing:params.servicing,admin:params.admin,adminMonths:params.adminMonths,equity:params.equity,credit:params.credit,debtRate:params.debtRate,debtFee:params.debtFee,drawEnd:params.drawEnd,maturity:params.maturity,sweepStart:params.sweepStart,tma:params.tma,target:params.target},
  indicators:{qty:t.qty,vgv:t.vgv,unit:t.unit,receipts:t.receipts,receiptsAtDelivery:t.receivedAtCompletion,portfolioNetAtDelivery:t.portfolioNetAtCompletion,cashForWorkAtDelivery:t.cashForWorkAtCompletion,work:t.work,vpl:t.vpl,margin:t.margin,projectIRR:t.projectIRR?.annual??null,equityIRR:t.equityIRR?.annual??null,operatingPeak:t.peak,operatingPeakMonth:t.peakMonth,coverage:t.coverage,soldAtDelivery:t.soldAtCompletion,lastSale:t.lastSale,workEnd:t.workEnd,horizon:t.horizon,payback:t.payback,pvFuture:t.pvFuture},
  portfolioContribution:{capacityAtDelivery:capacity,absorbedByWork:contribution,percentageOfWork:work>0?contribution/work*100:0,surplusAfterWork:surplus,workStillUncovered:uncovered},
  funding:{maximumSimultaneous:diag.peak.value,peakMonth:diag.peak.month,operatingGapAtPeak:diag.peak.operatingGap,financeCostAtPeak:diag.peak.financeCost,equityOutstandingAtPeak:diag.peak.equityOutstanding,debtAtPeakMonth:diag.peak.debt,cashReserveAtPeak:diag.peak.cashReserve,peakDebt:diag.peakDebt,peakDebtMonth:diag.peakDebtMonth,totalDraw:diag.totalDraw,totalRepay:diag.totalRepay,endingDebt:diag.endingDebt,totalInterest:diag.totalInterest,totalFees:diag.totalFees,additionalFunding:t.extra},
  land:{mode:params.landMode,contractualShare:params.landMode==='share'?params.landShare:null,purchasePrice:params.landMode==='cash'?params.landPrice:null,nominal:landNominal,nominalPctVgv:landNominal/vgv*100,vpl:landVpl,vplPctVgv:landVpl/vgv*100,tma:params.tma},
  workStages:stages,
  scenarios:scenarioSnapshot(params),
  sensitivity:sensitivitySnapshot(params),
  timeline:timelineSnapshot(result),
  actuals:actualSummary(project,result),
 };
 state.snapshotKey=key;state.snapshot=snapshot;
 return snapshot;
}

async function loadConfig(){
 if(state.config)return state.config;
 const response=await fetch(CONFIG_ENDPOINT,{cache:'no-store',headers:{Accept:'application/json'}});
 if(!response.ok)throw new Error('Configuração do Supabase indisponível.');
 state.config=await response.json();
 return state.config;
}

async function ensureSession(){
 let session=readSession();
 if(!session)return null;
 if(Number(session.expires_at||0)<=Math.floor(Date.now()/1000)+90&&window.EvoraSupabase?.sync){
  try{await window.EvoraSupabase.sync();}catch{}
  session=readSession();
 }
 return session;
}

async function supabaseRequest(path,{method='GET',body,prefer}={}){
 const config=await loadConfig(),session=await ensureSession();
 if(!session)throw new Error('Entre na nuvem para usar a Inteligência.');
 const headers={apikey:config.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',Accept:'application/json'};
 if(prefer)headers.Prefer=prefer;
 const response=await fetch(String(config.url).replace(/\/$/,'')+'/rest/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();
 const data=text?safeJSON(text,text):null;
 if(!response.ok){const error=new Error(String(data?.message||data?.error||data?.hint||response.statusText||'Falha no Supabase.'));error.status=response.status;throw error;}
 return data;
}

async function ensureThread(project,retry=true){
 const session=await ensureSession();
 if(!session?.user?.id)throw new Error('Entre na nuvem para salvar as análises.');
 const filter='viability_ai_threads?project_client_id=eq.'+encodeURIComponent(project.id)+'&select=id,title,updated_at&limit=1';
 let rows=await supabaseRequest(filter);
 if(Array.isArray(rows)&&rows.length)return rows[0];
 try{
  rows=await supabaseRequest('viability_ai_threads?on_conflict=user_id%2Cproject_client_id',{method:'POST',body:{user_id:session.user.id,project_client_id:project.id,title:'Inteligência · '+String(project.params?.name||'Empreendimento').slice(0,120),updated_at:nowISO()},prefer:'resolution=merge-duplicates,return=representation'});
  if(Array.isArray(rows)&&rows.length)return rows[0];
 }catch(error){
  if(retry&&window.EvoraSupabase?.sync){
   await window.EvoraSupabase.sync();
   return ensureThread(project,false);
  }
  throw error;
 }
 throw new Error('Não foi possível criar a conversa deste empreendimento.');
}

async function loadConversation(project){
 if(state.loadingHistory)return;
 state.loadingHistory=true;state.error='';
 try{
  const session=await ensureSession();
  if(!session){state.loaded=true;state.messages=[];state.threadId=null;return;}
  const thread=await ensureThread(project);
  state.threadId=thread.id;
  const rows=await supabaseRequest('viability_ai_messages?thread_id=eq.'+encodeURIComponent(thread.id)+'&select=id,role,content,metadata,created_at&order=created_at.asc&limit=80');
  state.messages=(Array.isArray(rows)?rows:[]).map(row=>({id:row.id,role:row.role,content:row.content,metadata:row.metadata||{},createdAt:row.created_at}));
  state.lastModel=[...state.messages].reverse().find(message=>message.role==='assistant'&&message.metadata?.model)?.metadata?.model||'';
  state.loaded=true;
 }catch(error){
  state.loaded=true;state.error='Não foi possível carregar o histórico: '+error.message;
 }finally{
  state.loadingHistory=false;renderPage(true);
 }
}

async function persistMessage(message){
 const session=await ensureSession();
 if(!session?.user?.id||!state.threadId)return;
 await supabaseRequest('viability_ai_messages',{method:'POST',body:{thread_id:state.threadId,user_id:session.user.id,role:message.role,content:message.content,metadata:message.metadata||{},created_at:message.createdAt||nowISO()},prefer:'return=minimal'});
 await supabaseRequest('viability_ai_threads?id=eq.'+encodeURIComponent(state.threadId),{method:'PATCH',body:{updated_at:nowISO()},prefer:'return=minimal'});
}

async function clearConversation(){
 if(!state.threadId)return;
 if(!confirm('Apagar o histórico da Inteligência deste empreendimento?'))return;
 try{
  await supabaseRequest('viability_ai_messages?thread_id=eq.'+encodeURIComponent(state.threadId),{method:'DELETE',prefer:'return=minimal'});
  state.messages=[];state.error='';renderPage(true);
 }catch(error){state.error='Não foi possível apagar o histórico: '+error.message;renderPage(true);}
}

function inlineMarkdown(value){
 return esc(value)
  .replace(/`([^`]+)`/g,'<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
  .replace(/__([^_]+)__/g,'<strong>$1</strong>');
}
function renderMarkdown(text){
 const lines=String(text||'').replace(/\r/g,'').split('\n');
 let html='',list='';
 const close=()=>{if(list){html+='</'+list+'>';list='';}};
 for(const raw of lines){
  const line=raw.trimEnd(),trim=line.trim();
  if(!trim){close();continue;}
  if(/^---+$/.test(trim)){close();html+='<hr>';continue;}
  let match;
  if((match=trim.match(/^###\s+(.+)/))){close();html+='<h3>'+inlineMarkdown(match[1])+'</h3>';continue;}
  if((match=trim.match(/^##\s+(.+)/))){close();html+='<h2>'+inlineMarkdown(match[1])+'</h2>';continue;}
  if((match=trim.match(/^#\s+(.+)/))){close();html+='<h2>'+inlineMarkdown(match[1])+'</h2>';continue;}
  if((match=trim.match(/^[-*]\s+(.+)/))){if(list!=='ul'){close();list='ul';html+='<ul>';}html+='<li>'+inlineMarkdown(match[1])+'</li>';continue;}
  if((match=trim.match(/^\d+[.)]\s+(.+)/))){if(list!=='ol'){close();list='ol';html+='<ol>';}html+='<li>'+inlineMarkdown(match[1])+'</li>';continue;}
  if((match=trim.match(/^>\s*(.+)/))){close();html+='<p><em>'+inlineMarkdown(match[1])+'</em></p>';continue;}
  close();html+='<p>'+inlineMarkdown(trim)+'</p>';
 }
 close();return html;
}

function navIcon(){return '<svg class="intelligence-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z M18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z M5 14l.7 1.8 1.8.7-1.8.7L5 19l-.7-1.8-1.8-.7 1.8-.7L5 14z"/></svg>';}
function ensureNav(){
 const nav=document.querySelector('.nav');if(!nav)return;
 let button=nav.querySelector('[data-intelligence-nav]');
 if(!button){
  button=document.createElement('button');button.type='button';button.className='intelligence-nav';button.dataset.intelligenceNav='1';button.innerHTML=navIcon()+'Inteligência<span class="index">IA</span>';
  button.addEventListener('click',()=>{location.hash='intelligence';});
  nav.insertBefore(button,nav.firstChild);
 }
 const active=location.hash.slice(1)==='intelligence';
 button.classList.toggle('active',active);button.setAttribute('aria-current',active?'page':'false');
 if(active)nav.querySelectorAll('button:not([data-intelligence-nav])').forEach(item=>item.classList.remove('active'));
}

function messageHtml(message){
 const time=message.createdAt?new Date(message.createdAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'';
 const model=message.role==='assistant'&&message.metadata?.model?String(message.metadata.model).replace('openai/',''):'';
 return '<article class="intel-message '+message.role+'"><div class="intel-avatar">'+(message.role==='assistant'?'A':'EU')+'</div><div class="intel-bubble"><div class="intel-markdown">'+renderMarkdown(message.content)+'</div><div class="intel-message-meta"><span>'+esc(time)+'</span>'+(model?'<span>'+esc(model)+'</span>':'')+'</div></div></article>';
}

function stageCards(stages){
 return stages.map(stage=>'<div class="intel-stage"><div class="intel-stage-head"><strong>'+esc(stage.name)+'</strong><b>'+pct(stage.share)+'</b></div><small>M'+stage.start+' a M'+stage.end+' · '+money(stage.budget)+'</small><div class="intel-stage-track"><i style="width:'+Math.min(100,Math.max(0,stage.share))+'%"></i></div></div>').join('');
}

function renderPage(force=false){
 ensureNav();
 if(location.hash.slice(1)!=='intelligence')return;
 const project=activeProject(),main=document.querySelector('main.content');
 if(!project||!main)return;
 if(state.projectId!==project.id){
  state.projectId=project.id;state.messages=[];state.threadId=null;state.loaded=false;state.error='';state.snapshotKey='';state.snapshot=null;
  setTimeout(()=>loadConversation(project),0);
 }
 let snapshot;
 try{snapshot=buildSnapshot(project);}catch(error){main.innerHTML='<div class="error-banner"><strong>Inteligência indisponível.</strong> '+esc(error.message)+'</div>';return;}
 const session=readSession(),h=snapshot.health,f=snapshot.funding,i=snapshot.indicators,pc=snapshot.portfolioContribution,land=snapshot.land;
 const signature=[project.id,project.updated,state.messages.length,state.loading,state.loadingHistory,state.error,state.lastModel,Boolean(session)].join('|');
 if(!force&&main.dataset.intelligenceSignature===signature)return;
 main.dataset.intelligenceSignature=signature;
 const breadcrumb=document.querySelector('.breadcrumb b');if(breadcrumb)breadcrumb.textContent='Inteligência';
 const statusClass=state.error?'error':state.loading||state.loadingHistory?'loading':session?'ready':'';
 const statusText=state.loading?'Analisando cenário':state.loadingHistory?'Carregando histórico':session?'Pronta para analisar':'Login necessário';
 const messages=state.messages.length?state.messages.map(messageHtml).join(''):'<div class="intel-empty"><div class="intel-empty-mark">A</div><h3>Decisão orientada por cenário.</h3><p>A Arisa recebe as premissas, o fluxo, as etapas da obra, o score de saúde e a sensibilidade do empreendimento ativo. Escolha uma análise pronta ou formule sua própria pergunta.</p></div>';
 const thinking=state.loading?'<article class="intel-message assistant"><div class="intel-avatar">A</div><div class="intel-bubble"><div class="intel-thinking"><i></i><i></i><i></i><span>Comparando cenários e estruturando a recomendação…</span></div></div></article>':'';
 const login=!session?'<div class="intel-login-banner"><div><strong>Entre na nuvem para usar a agente.</strong><p>O login protege o consumo da IA e vincula o histórico ao empreendimento correto no Supabase.</p></div><button type="button" class="button primary" data-intel-login>Entrar na nuvem</button></div>':'';
 const error=state.error?'<div class="intel-error">'+esc(state.error)+'</div>':'';
 const quick=quickPrompts.map(item=>'<button type="button" class="intel-quick-prompt" data-intel-prompt="'+item.id+'"><strong>'+esc(item.title)+'</strong><span>'+esc(item.description)+'</span></button>').join('');
 const weakest=h.weakest.map(item=>item.label).join(' · ');
 main.innerHTML='<div class="intel-page">'+
  '<header class="intel-heading"><div><div class="eyebrow">Évora · inteligência estratégica</div><h1>Inteligência</h1><p class="subtitle">Agente de IA para análise de cenários, estrutura de capital, carteira, obra e tomada de decisão do empreendimento ativo.</p></div><div class="intel-heading-actions"><button type="button" class="button" data-intel-refresh>Atualizar contexto</button><button type="button" class="button primary" data-intel-prompt="diagnosis">Diagnóstico completo</button></div></header>'+
  '<section class="intel-agent-hero"><div class="intel-agent-orb"><strong>A</strong></div><div class="intel-agent-copy"><span>ARISA INTELLIGENCE</span><h2>'+esc(project.params.name)+'</h2><p>Leitura integrada de '+snapshot.scenarios.length+' cenários, 25 combinações de preço e velocidade, '+snapshot.workStages.length+' etapa(s) de obra e marcos mensais do fluxo.</p></div><div class="intel-agent-status"><div class="intel-status-pill '+statusClass+'">'+statusText+'</div><b>'+(state.lastModel?esc(state.lastModel.replace('openai/','')):'Análise orientada pelos dados')+'</b><small>As recomendações não substituem validações externas.</small></div></section>'+
  '<div class="intel-kpis"><div class="intel-kpi '+h.tone+'"><span>Score de saúde</span><strong>'+h.score+' · '+h.classification+'</strong><small>'+esc(weakest||'Sem fragilidade dominante')+'</small></div><div class="intel-kpi"><span>VPL do empreendimento</span><strong>'+money(i.vpl)+'</strong><small>TMA '+pct(snapshot.premises.tma)+' a.a.</small></div><div class="intel-kpi"><span>Funding máximo</span><strong>'+money(f.maximumSimultaneous)+'</strong><small>Pico em M'+f.peakMonth+'</small></div><div class="intel-kpi"><span>Carteira absorvida pela obra</span><strong>'+money(pc.absorbedByWork)+'</strong><small>'+pct(pc.percentageOfWork)+' da obra</small></div><div class="intel-kpi"><span>Terreno em VPL</span><strong>'+money(land.vpl)+'</strong><small>'+pct(land.vplPctVgv)+' do VGV</small></div></div>'+
  login+
  '<div class="intel-layout"><section class="intel-chat-panel"><div class="intel-chat-head"><div><h2>Análise e recomendações</h2><p>O histórico é separado por empreendimento.</p></div><div class="intel-chat-tools"><button type="button" class="button small" data-intel-refresh>Recalcular contexto</button>'+(state.messages.length?'<button type="button" class="button small danger" data-intel-clear>Limpar conversa</button>':'')+'</div></div><div class="intel-quick-prompts">'+quick+'</div><div class="intel-messages" data-intel-messages>'+messages+thinking+'</div>'+error+'<div class="intel-composer"><form data-intel-form><textarea name="prompt" maxlength="5000" placeholder="Ex.: Como reduzir o funding sem baixar o preço do lote?" '+(!session||state.loading?'disabled':'')+'></textarea><button class="button primary intel-send" type="submit" '+(!session||state.loading?'disabled':'')+'>Analisar</button></form><p class="intel-composer-note">A agente utiliza o cenário ativo e não altera premissas automaticamente. Recomendações devem ser simuladas antes da decisão.</p></div></section>'+
  '<aside class="intel-context-panel"><div class="intel-context-head"><h2>Contexto enviado à agente</h2><p>Resumo calculado em tempo real pelo motor da plataforma.</p></div><div class="intel-context-body"><div class="intel-context-group"><span class="intel-context-label">Negócio</span><div class="intel-context-row"><span>VGV</span><b>'+money(i.vgv)+'</b></div><div class="intel-context-row"><span>Obra nominal</span><b>'+money(i.work)+'</b></div><div class="intel-context-row"><span>Preço / velocidade</span><b>'+money(snapshot.premises.price)+'/m² · '+fmt(snapshot.premises.speed,2)+' lotes/mês</b></div><div class="intel-context-row"><span>Sell-out</span><b>M'+i.lastSale+'</b></div></div><div class="intel-context-group"><span class="intel-context-label">Liquidez</span><div class="intel-context-row"><span>Exposição operacional</span><b>'+money(i.operatingPeak)+' · M'+i.operatingPeakMonth+'</b></div><div class="intel-context-row"><span>Funding adicional</span><b>'+money(f.additionalFunding)+'</b></div><div class="intel-context-row"><span>Cobertura na entrega</span><b>'+pct(i.coverage)+'</b></div><div class="intel-context-row"><span>Dívida final</span><b>'+money(f.endingDebt)+'</b></div></div><div class="intel-context-group stages"><span class="intel-context-label">Etapas da obra</span>'+stageCards(snapshot.workStages)+'</div></div><div class="intel-context-foot">Fonte: premissas e cálculos do empreendimento ativo. A agente recebe também cenários, matriz de sensibilidade, realizado e marcos do fluxo.</div></aside></div>'+
  '<footer class="footer"><span>Évora Viabilidade · Inteligência por empreendimento · Motor '+esc(E.version)+'</span><span>Contexto atualizado em '+new Date(snapshot.generatedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'</span></footer>'+
 '</div>';
 requestAnimationFrame(()=>{const box=main.querySelector('[data-intel-messages]');if(box)box.scrollTop=box.scrollHeight;});
}

async function callAgent(project,prompt){
 let session=await ensureSession();
 if(!session)throw new Error('Entre na nuvem para usar a Inteligência.');
 const history=state.messages.slice(0,-1).slice(-10).map(message=>({role:message.role,content:message.content}));
 const request=()=>fetch('/api/intelligence',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({projectId:project.id,prompt,history,snapshot:buildSnapshot(project)})});
 let response=await request();
 if(response.status===401&&window.EvoraSupabase?.sync){
  try{await window.EvoraSupabase.sync();}catch{}
  session=readSession();if(session)response=await request();
 }
 const data=await response.json().catch(()=>({error:response.statusText}));
 if(!response.ok)throw new Error(data.error||'A análise não pôde ser concluída.');
 return data;
}

async function sendPrompt(prompt){
 const project=activeProject(),text=String(prompt||'').trim();
 if(!project||!text||state.loading)return;
 const session=await ensureSession();
 if(!session){window.EvoraSupabase?.open?.();return;}
 if(!state.threadId){await loadConversation(project);if(!state.threadId)throw new Error('Sincronize o empreendimento antes de usar a Inteligência.');}
 const userMessage={role:'user',content:text,metadata:{},createdAt:nowISO()};
 state.messages.push(userMessage);state.loading=true;state.error='';renderPage(true);
 try{
  await persistMessage(userMessage);
  const response=await callAgent(project,text);
  const assistant={role:'assistant',content:response.reply,metadata:{model:response.model,responseId:response.responseId,usage:response.usage,generatedAt:response.generatedAt,snapshotGeneratedAt:state.snapshot?.generatedAt},createdAt:response.generatedAt||nowISO()};
  state.messages.push(assistant);state.lastModel=response.model||state.lastModel;
  await persistMessage(assistant);
 }catch(error){state.error=error.message;}
 finally{state.loading=false;renderPage(true);}
}

function refreshContext(){
 state.snapshotKey='';state.snapshot=null;state.error='';renderPage(true);
}

let scheduled=false;
function enhance(){
 if(scheduled)return;scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;ensureNav();if(location.hash.slice(1)==='intelligence')renderPage();});
}

const root=document.getElementById('app');
if(root)new MutationObserver(enhance).observe(root,{childList:true,subtree:true});
window.addEventListener('hashchange',enhance);
window.addEventListener('storage',event=>{if(event.key===STORE||event.key===SESSION_KEY){state.loaded=false;enhance();}});
window.addEventListener('evora:supabase-status',()=>{if(location.hash.slice(1)==='intelligence'){const project=activeProject();if(project&&!state.loaded)loadConversation(project);renderPage(true);}});

document.addEventListener('click',event=>{
 const login=event.target.closest('[data-intel-login]');if(login){window.EvoraSupabase?.open?.();return;}
 const promptButton=event.target.closest('[data-intel-prompt]');if(promptButton){const item=quickPrompts.find(entry=>entry.id===promptButton.dataset.intelPrompt);if(item)sendPrompt(item.prompt).catch(error=>{state.error=error.message;renderPage(true);});return;}
 if(event.target.closest('[data-intel-refresh]')){refreshContext();return;}
 if(event.target.closest('[data-intel-clear]')){clearConversation();return;}
});

document.addEventListener('submit',event=>{
 const form=event.target.closest('[data-intel-form]');if(!form)return;
 event.preventDefault();const textarea=form.querySelector('textarea[name="prompt"]'),value=textarea?.value||'';
 if(textarea)textarea.value='';sendPrompt(value).catch(error=>{state.error=error.message;state.loading=false;renderPage(true);});
});

document.addEventListener('keydown',event=>{
 const textarea=event.target.closest?.('[data-intel-form] textarea');
 if(textarea&&(event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();textarea.form?.requestSubmit();}
});

enhance();
})();
