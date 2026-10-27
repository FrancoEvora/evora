/* Évora Viabilidade · Motor de etapas da obra v2.0 */
(function(){
'use strict';
const E=window.EvoraEngine;
if(!E||E.__workStagesEngineV2)return;
E.__workStagesEngineV2=true;

const originalPrepare=E.prepare;
const originalSimulate=E.simulate;
E.defaults.workMode='single';
E.defaults.workStagesJson='[]';

const CURVES=['s','linear','early','late','custom'];
const labels={s:'Curva S',linear:'Linear',early:'Concentrada no início',late:'Concentrada no fim',custom:'Manual'};
const clone=value=>JSON.parse(JSON.stringify(value));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,finite(value,min)));
const uid=()=>globalThis.crypto?.randomUUID?.()||'stage-'+Date.now().toString(36)+Math.random().toString(36).slice(2);

function standardWeights(curve,duration){
 const n=Math.max(1,Math.round(duration)||1);
 const values=Array.from({length:n},(_,index)=>{
  if(curve==='linear')return 1;
  if(curve==='early')return n-index;
  if(curve==='late')return index+1;
  return Math.sin(Math.PI*(index+.5)/n);
 });
 const sum=values.reduce((a,b)=>a+b,0)||1;
 return values.map(value=>value/sum);
}
function resampleWeights(source,duration){
 const n=Math.max(1,Math.round(duration)||1);
 const src=(Array.isArray(source)?source:[]).map(Number).filter(Number.isFinite).map(value=>Math.max(0,value));
 if(!src.length)return standardWeights('s',n);
 if(src.length===1)return Array(n).fill(1/n);
 const out=[];
 for(let index=0;index<n;index++){
  const position=n===1?0:index*(src.length-1)/(n-1);
  const low=Math.floor(position),high=Math.min(src.length-1,Math.ceil(position)),q=position-low;
  out.push(src[low]*(1-q)+src[high]*q);
 }
 const sum=out.reduce((a,b)=>a+b,0)||1;
 return out.map(value=>value/sum);
}
function normalizeStage(raw,index,defaults){
 const fallbackDuration=Math.max(1,Math.round(finite(defaults.duration,12)));
 const duration=Math.max(1,Math.min(120,Math.round(finite(raw&&raw.duration,fallbackDuration))));
 const fallbackStart=Math.max(0,Math.round(finite(defaults.start,0)));
 const start=Math.max(0,Math.min(119,Math.round(finite(raw&&raw.start,fallbackStart))));
 const name=String(raw&&raw.name||'Etapa '+(index+1)).slice(0,80);
 if(start+duration-1>120)throw new Error('A etapa “'+name+'” ultrapassa o limite de M120.');
 const curve=CURVES.includes(raw&&raw.curve)?raw.curve:'s';
 return {
  id:String(raw&&raw.id||uid()),
  name,
  budget:clamp(raw&&raw.budget,0,1e11),
  start,
  duration,
  contingency:clamp(raw&&raw.contingency!==undefined?raw.contingency:defaults.contingency,0,100),
  curve,
  weights:curve==='custom'?resampleWeights(raw&&raw.weights,duration):[]
 };
}
function parseStages(value,defaults){
 let raw=[];
 try{raw=Array.isArray(value)?value:JSON.parse(typeof value==='string'&&value?value:'[]');}catch{raw=[];}
 if(!Array.isArray(raw))raw=[];
 return raw.map((stage,index)=>normalizeStage(stage,index,defaults));
}
function serializeStages(stages){
 return stages.map(stage=>({id:stage.id,name:stage.name,budget:stage.budget,start:stage.start,duration:stage.duration,contingency:stage.contingency,curve:stage.curve,weights:stage.curve==='custom'?stage.weights:[]}));
}
function legacyStage(params){
 return normalizeStage({name:'Etapa 1 — Implantação',budget:params.work,start:params.workStart,duration:params.duration,contingency:params.contingency,curve:params.curve,weights:params.workWeights},0,{start:params.workStart,duration:params.duration,contingency:params.contingency});
}
function prepare(input){
 const incoming={...(input||{})};
 const stageMode=String(incoming.workMode||'single')==='stages';
 const legacy={
  work:Math.max(0,finite(incoming.work,E.defaults.work)),
  start:Math.max(0,Math.round(finite(incoming.workStart,E.defaults.workStart))),
  duration:Math.max(1,Math.round(finite(incoming.duration,E.defaults.duration))),
  contingency:clamp(incoming.contingency!==undefined?incoming.contingency:E.defaults.contingency,0,100),
  curve:CURVES.includes(incoming.curve)?incoming.curve:'s',
  weights:Array.isArray(incoming.workWeights)?incoming.workWeights:[]
 };
 const safe={...incoming};
 if(stageMode){safe.work=legacy.work;safe.workStart=0;safe.duration=1;safe.contingency=0;safe.curve='linear';safe.workWeights=[];}
 const params=originalPrepare(safe);
 params.workMode=stageMode?'stages':'single';
 params.workStagesJson=typeof incoming.workStagesJson==='string'?incoming.workStagesJson:'[]';
 let stages=parseStages(params.workStagesJson,legacy);
 if(stageMode){
  if(!stages.length)stages=[legacyStage({work:legacy.work,workStart:legacy.start,duration:legacy.duration,contingency:legacy.contingency,curve:legacy.curve,workWeights:legacy.weights})];
  const total=stages.reduce((sum,stage)=>sum+stage.budget,0);
  if(total<=0)throw new Error('Informe orçamento maior que zero em pelo menos uma etapa da obra.');
  const start=Math.min(...stages.map(stage=>stage.start));
  const end=Math.max(...stages.map(stage=>stage.start+stage.duration-1));
  if(end-start+1>120)throw new Error('O cronograma consolidado das etapas não pode superar 120 meses.');
  params.work=total;
  params.workStart=start;
  params.duration=end-start+1;
  params.contingency=stages.reduce((sum,stage)=>sum+stage.budget*stage.contingency,0)/total;
  params.curve='linear';
  params.workWeights=[];
 }
 params.workStages=stages;
 params.workStagesJson=JSON.stringify(serializeStages(stages));
 return params;
}
function buildSchedule(params){
 const stages=params.workStages.map(stage=>{
  const weights=stage.curve==='custom'?resampleWeights(stage.weights,stage.duration):standardWeights(stage.curve,stage.duration);
  const baseWithContingency=stage.budget*(1+stage.contingency/100);
  const monthly=[];
  let nominalTotal=0;
  for(let index=0;index<stage.duration;index++){
   const month=stage.start+index;
   const amount=baseWithContingency*weights[index]*Math.pow(1+params.workInflation/100,month/12);
   monthly.push({month,amount,weight:weights[index]});
   nominalTotal+=amount;
  }
  return {...stage,end:stage.start+stage.duration-1,weights,monthly,baseWithContingency,nominalTotal};
 });
 const amountByMonth=Array(121).fill(0);
 const stageByMonth=Array.from({length:121},()=>({}));
 const aggregate=Array(params.duration).fill(0);
 stages.forEach(stage=>stage.monthly.forEach(item=>{
  amountByMonth[item.month]+=item.amount;
  stageByMonth[item.month][stage.id]=item.amount;
  aggregate[item.month-params.workStart]+=stage.budget*item.weight;
 }));
 const totalBase=params.work||1;
 return {
  stages,
  amountByMonth,
  stageByMonth,
  aggregateWeights:aggregate.map(value=>value/totalBase),
  withContingency:stages.reduce((sum,stage)=>sum+stage.baseWithContingency,0)
 };
}
function recompute(result,params,light,schedule){
 const rows=result.rows;
 const workEnd=params.workStart+params.duration-1;
 rows.forEach(row=>{
  row.work=schedule.amountByMonth[row.t]||0;
  row.stageWork=schedule.stageByMonth[row.t]||{};
 });
 let cumulative=0,cumulativeWork=0,peak=0,peakMonth=0;
 rows.forEach(row=>{
  row.net=row.cashForWork-row.work;
  cumulative+=row.net;
  cumulativeWork+=row.work;
  row.cumulative=cumulative;
  row.cumWork=cumulativeWork;
  row.coverage=cumulativeWork>0?Math.max(0,row.cumCashForWork)/cumulativeWork*100:0;
  if(-cumulative>peak){peak=-cumulative;peakMonth=row.t;}
 });
 let bank=params.equity,debt=0,totalDraw=0,extra=0,totalInterest=0,totalFee=0,totalRepay=0,totalDistribution=0;
 rows.forEach(row=>{
  Object.assign(row,{draw:0,interest:0,fee:0,repay:0,debt:0,extraEquity:0,distribution:0,bank:0,equityCF:0});
  row.interest=debt*params.debtRate/100;
  bank+=row.net-row.interest;
  if(bank<0&&row.t<=params.drawEnd&&row.t<params.maturity){
   row.draw=Math.min(Math.max(0,params.credit-totalDraw),-bank/(1-params.debtFee/100));
   row.fee=row.draw*params.debtFee/100;
   debt+=row.draw;totalDraw+=row.draw;bank+=row.draw-row.fee;
  }
  if(row.t>=params.sweepStart&&bank>0&&debt>0){row.repay=Math.min(debt,bank);debt-=row.repay;bank-=row.repay;}
  if(row.t===params.maturity&&debt>0){row.repay+=debt;bank-=debt;debt=0;}
  if(bank<0){row.extraEquity=-bank;extra+=-bank;bank=0;}
  if(row.t>=workEnd+1&&debt<.001&&bank>0){row.distribution=bank;bank=0;}
  if(row.t===rows.length-1&&bank>0){row.distribution+=bank;bank=0;}
  row.debt=debt;row.bank=bank;row.equityCF=row.distribution-row.extraEquity-(row.t===0?params.equity:0);
  totalInterest+=row.interest;totalFee+=row.fee;totalRepay+=row.repay;totalDistribution+=row.distribution;
 });
 const sum=key=>rows.reduce((total,row)=>total+(Number(row[key])||0),0);
 const flows=rows.map(row=>row.net),equityFlows=rows.map(row=>row.equityCF);
 let lastNegative=-1;rows.forEach(row=>{if(row.cumulative<-.01)lastNegative=row.t;});
 const payback=lastNegative===rows.length-1?null:lastNegative<0?0:lastNegative+1;
 const completion=rows[workEnd],totalWork=sum('work'),receipts=sum('received');
 const coverage=totalWork>0?Math.max(0,completion.cumCashForWork)/totalWork*100:null;
 const targetRow=rows.find(row=>row.t<=workEnd&&row.cumCashForWork>=totalWork*params.target/100);
 Object.assign(result.totals,{
  work:totalWork,
  workBase:params.work,
  workWithContingency:schedule.withContingency,
  stageCount:schedule.stages.length,
  profit:sum('net'),
  margin:receipts>0?sum('net')/receipts*100:null,
  vpl:E.npv(flows,params.tma),
  projectIRR:light?{annual:null}:E.irr(flows),
  equityIRR:light?{annual:null}:E.irr(equityFlows),
  peak,peakMonth,payback,workEnd,coverage,
  targetMonth:targetRow?targetRow.t:null,
  draw:totalDraw,extra,interest:totalInterest,fee:totalFee,repay:totalRepay,distribution:totalDistribution,equityTotal:params.equity+extra
 });
 result.p=params;
 result.workWeights=schedule.aggregateWeights;
 result.stages=schedule.stages;
 const replaced=new Set(['Funding insuficiente','VPL negativo','Meta de cobertura não atingida']);
 result.warnings=(result.warnings||[]).filter(warning=>!replaced.has(warning.title));
 if(extra>1)result.warnings.unshift({level:'danger',title:'Funding insuficiente',text:'O cronograma consolidado das etapas exige aportes adicionais além das fontes parametrizadas.'});
 if(result.totals.vpl<0)result.warnings.unshift({level:'danger',title:'VPL negativo',text:'O retorno projetado não remunera a taxa mínima de atratividade informada.'});
 if(coverage!==null&&coverage<params.target)result.warnings.push({level:'warning',title:'Meta de cobertura não atingida',text:'O caixa disponível até a entrega está abaixo da meta definida.'});
 return result;
}

E.prepare=prepare;
E.simulate=function(input,light=false){
 const params=prepare(input||{});
 if(params.workMode!=='stages')return originalSimulate(params,light);
 const schedule=buildSchedule(params);
 const transformed={...params,workMode:'single',workStagesJson:'[]',work:0,contingency:0,workStart:params.workStart,duration:params.duration,curve:'linear',workWeights:[]};
 const result=originalSimulate(transformed,light);
 return recompute(result,params,light,schedule);
};
E.scenarios=function(input){
 const params=prepare(input||{});
 const definitions=[
  {id:'base',name:'Base',description:'Suas premissas atuais.',price:1,speed:1,cost:1,delay:0,loss:0},
  {id:'optimistic',name:'Expansão',description:'Preço +5%; vendas +25%; obra −5%.',price:1.05,speed:1.25,cost:.95,delay:0,loss:0},
  {id:'conservative',name:'Conservador',description:'Preço −5%; vendas −25%; obra +10%; início da obra +3 meses; perdas +2 p.p.',price:.95,speed:.75,cost:1.10,delay:3,loss:2},
  {id:'stress',name:'Estresse',description:'Preço −10%; vendas −40%; obra +20%; início da obra +6 meses; perdas +5 p.p.',price:.90,speed:.60,cost:1.20,delay:6,loss:5}
 ];
 return definitions.map(definition=>{
  const scenario={...params,price:params.price*definition.price,speed:params.speed*definition.speed,loss:Math.min(100,params.loss+definition.loss)};
  if(params.workMode==='stages'){
   const stages=params.workStages.map(stage=>({...stage,budget:stage.budget*definition.cost,start:stage.start+definition.delay}));
   scenario.workStagesJson=JSON.stringify(serializeStages(stages));
  }else{
   scenario.work*=definition.cost;scenario.workStart+=definition.delay;
  }
  try{return {...definition,p:scenario,result:E.simulate(scenario)};}catch(error){return {...definition,p:scenario,error:error.message};}
 });
};
E.workStageHelpers={CURVES,labels,standardWeights,resampleWeights,normalizeStage,parseStages,serializeStages,legacyStage,buildSchedule,uid};
})();
