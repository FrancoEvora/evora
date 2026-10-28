/* Évora · SACOC v1.0. Load after engine.js, before buyer-plans-engine.js.
 * Model convention, not a claim of universal contractual standard.
 * Monthly: each base-principal quota grows by (1+i)^k.
 * Annual blocks: installments 1–12 use base quotas; 13–24 multiply by (1+j), etc.
 * Indexation is independent. No interest accrues during the entry period.
 */
(function(root){
'use strict';
const E=root.EvoraEngine;if(!E||E.sacoc)return;
const legacyPrepare=E.prepare,legacySimulate=E.simulate,legacyContract=E.contract;
E.defaults.sacocFrequency=12;
E.defaults.sacocAnnualRate=6;
E.bounds.sacocFrequency=[1,12];
E.bounds.sacocAnnualRate=[0,100];
function settings(p){
 const frequency=p.sacocFrequency??12,annual=p.sacocAnnualRate??6;
 if(frequency!==1&&frequency!==12)throw new Error('SACOC: selecione evolução mensal ou blocos anuais de 12 parcelas.');
 if(typeof annual!=='number'||!Number.isFinite(annual)||annual<0||annual>100)throw new Error('SACOC: a taxa anual deve ficar entre 0% e 100%.');
 const monthly=p.interest;
 if(frequency===1&&(typeof monthly!=='number'||!Number.isFinite(monthly)||monthly<0||monthly>5))throw new Error('SACOC mensal: a taxa deve ficar entre 0% e 5% ao mês.');
 return {frequency,annual,monthly};
}
function prepare(input){
 const incoming=input||{},isSacoc=incoming.system==='SACOC';
 const p=legacyPrepare(isSacoc?{...incoming,system:'SAC'}:incoming);
 if(isSacoc){settings(p);p.system='SACOC';}
 return p;
}
function indexFactor(p,age){
 if(p.index==='NONE')return 1;
 const months=p.indexFrequency==='annual'?Math.floor(age/12)*12:age;
 return Math.pow(1+p.correction/100,months/12);
}
function growthFactor(p,age){const s=settings(p);return s.frequency===12?Math.pow(1+s.annual/100,Math.floor((age-1)/12)):Math.pow(1+s.monthly/100,age);}
function description(p){
 const s=settings(p),fmt=v=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:4});
 return s.frequency===12?'SACOC · '+fmt(s.annual)+'% a.a. em blocos de 12; primeiro acréscimo na 13ª prestação':'SACOC · '+fmt(s.monthly)+'% a.m. sobre as cotas; desde a 1ª prestação';
}
function contract(p,value){
 if(p.system!=='SACOC')return legacyContract(p,value);
 settings(p);
 if(!Number.isFinite(value)||value<0||!Number.isInteger(p.term)||p.term<1||p.term>360)throw new Error('SACOC: preço e prazo inválidos.');
 if(!Number.isFinite(p.entry)||p.entry<0||p.entry>100||!Number.isFinite(p.balloon)||p.balloon<0||p.entry+p.balloon>100+1e-9)throw new Error('SACOC: entrada e balões não podem superar o preço.');
 const count=p.balloon>0?p.balloons:0;
 if(count&&(!Number.isInteger(count)||count<1||count*12>p.term))throw new Error('SACOC: os balões anuais devem caber no prazo.');
 const principal=value*(1-p.entry/100),balloonPrincipal=value*p.balloon/100;
 const baseRegular=Math.max(0,(principal-balloonPrincipal)/p.term),baseBalloon=count?balloonPrincipal/count:0;
 const schedule=[];let baseBalance=principal;
 for(let age=1;age<=p.term;age++){
  const balloonBase=age%12===0&&age/12<=count?baseBalloon:0;
  const regularBase=age===p.term?Math.max(0,baseBalance-balloonBase):baseRegular;
  const quota=regularBase+balloonBase,growth=growthFactor(p,age),correction=indexFactor(p,age);
  baseBalance=age===p.term?0:Math.max(0,baseBalance-quota);
  const row={age,regular:regularBase*growth*correction,balloon:balloonBase*growth*correction,
   interest:quota*(growth-1)*correction,amortization:quota*correction,balance:baseBalance*correction,
   baseAmortization:quota,baseBalance,growthFactor:growth,correctionFactor:correction,
   remuneration:quota*(growth-1)*correction,capitalizedBalance:baseBalance*growth*correction};
  if(Object.values(row).some(v=>typeof v==='number'&&!Number.isFinite(v)))throw new Error('SACOC: valores fora da faixa numérica.');
  schedule.push(row);
 }
 return {principal,schedule,negative:false,entry:value*p.entry/100,first:schedule[0]?.regular||0,
  last:schedule.at(-1)?.regular||0,system:'SACOC',sacocFrequency:p.sacocFrequency??12,
  baseRegular,baseBalloon,description:description(p),
  balanceDefinition:'Saldo-base de principal remanescente com correção monetária, sem remuneração das cotas; não é valor de quitação antecipada.',
  interestDefinition:'Remuneração acumulada da cota paga neste vencimento; não são juros mensais sobre o saldo integral.'};
}
function rebuild(result,p,light){
 const rows=result.rows,workEnd=p.workStart+p.duration-1;
 let cum=0,cw=0,cpn=0,cfw=0,cr=0,cu=0,peak=0,peakMonth=0;
 for(const r of rows){
  r.received=r.cash+r.entry+r.regular+r.balloon;r.tax=r.received*p.tax/100;r.servicing=r.received*p.servicing/100;
  if(p.landMode==='share')r.land=r.received*p.landShare/100;
  r.portfolioNet=r.received-(p.landMode==='share'?r.land:0)-r.tax-r.servicing;
  r.cashForWork=r.portfolioNet-(p.landMode==='cash'?r.land:0)-r.predev-r.commission-r.marketing-r.admin;
  r.available=r.cashForWork;r.net=r.cashForWork-r.work;
  cum+=r.net;cw+=r.work;cpn+=r.portfolioNet;cfw+=r.cashForWork;cr+=r.received;cu+=r.units;
  Object.assign(r,{cumulative:cum,cumWork:cw,cumPortfolioNet:cpn,cumCashForWork:cfw,cumAvailable:cfw,cumReceived:cr,cumUnits:cu,coverage:cw>0?Math.max(0,cfw)/cw*100:0});
  if(-cum>peak){peak=-cum;peakMonth=r.t;}
 }
 let bank=p.equity,debt=0,totalDraw=0,extra=0,totalInterest=0,totalFee=0,totalRepay=0,totalDist=0;
 for(const r of rows){
  Object.assign(r,{draw:0,interest:debt*p.debtRate/100,fee:0,repay:0,debt:0,extraEquity:0,distribution:0,bank:0,equityCF:0});
  bank+=r.net-r.interest;
  if(bank<0&&r.t<=p.drawEnd&&r.t<p.maturity){r.draw=Math.min(Math.max(0,p.credit-totalDraw),-bank/(1-p.debtFee/100));r.fee=r.draw*p.debtFee/100;debt+=r.draw;totalDraw+=r.draw;bank+=r.draw-r.fee;}
  if(r.t>=p.sweepStart&&bank>0&&debt>0){r.repay=Math.min(debt,bank);debt-=r.repay;bank-=r.repay;}
  if(r.t===p.maturity&&debt>0){r.repay+=debt;bank-=debt;debt=0;}
  if(bank<0){r.extraEquity=-bank;extra-=bank;bank=0;}
  if(r.t>=workEnd+1&&debt<.001&&bank>0){r.distribution=bank;bank=0;}
  if(r.t===rows.length-1&&bank>0){r.distribution+=bank;bank=0;}
  r.debt=debt;r.bank=bank;r.equityCF=r.distribution-r.extraEquity-(r.t===0?p.equity:0);
  totalInterest+=r.interest;totalFee+=r.fee;totalRepay+=r.repay;totalDist+=r.distribution;
 }
 const sum=k=>rows.reduce((a,r)=>a+r[k],0),flows=rows.map(r=>r.net),equityFlows=rows.map(r=>r.equityCF);
 const completion=rows[workEnd],work=sum('work'),receipts=sum('received'),vpl=E.npv(flows,p.tma),landVpl=E.npv(rows.map(r=>r.land),p.tma);
 let lastNegative=-1;for(const r of rows)if(r.cumulative<-.01)lastNegative=r.t;
 const t=result.totals;
 Object.assign(t,{receipts,lost:sum('lost'),scheduled:sum('scheduled'),land:sum('land'),landVpl,landPctVgv:t.vgv>0?landVpl/t.vgv*100:null,
  portfolioNet:sum('portfolioNet'),cashForWork:sum('cashForWork'),tax:sum('tax'),servicing:sum('servicing'),profit:sum('net'),margin:receipts>0?sum('net')/receipts*100:null,
  vpl,projectIRR:light?{annual:null}:E.irr(flows),equityIRR:light?{annual:null}:E.irr(equityFlows),peak,peakMonth,
  payback:lastNegative===rows.length-1?null:lastNegative<0?0:lastNegative+1,
  coverage:work>0?Math.max(0,completion.cumCashForWork)/work*100:null,
  portfolioNetAtCompletion:completion.cumPortfolioNet,cashForWorkAtCompletion:completion.cumCashForWork,availableAtCompletion:completion.cumCashForWork,
  receivedAtCompletion:completion.cumReceived,soldAtCompletion:completion.cumUnits,portfolioAtCompletion:completion.portfolioBalance,
  futureReceipts:rows.slice(workEnd+1).reduce((a,r)=>a+r.received,0),pvFuture:rows.slice(workEnd+1).reduce((a,r)=>a+r.received/Math.pow(1+E.monthly(p.tma),r.t-workEnd),0),
  targetMonth:rows.find(r=>r.t<=workEnd&&r.cumCashForWork>=work*p.target/100)?.t??null,
  draw:totalDraw,extra,interest:totalInterest,fee:totalFee,repay:totalRepay,distribution:totalDist,equityTotal:p.equity+extra});
 const replace=new Set(['Funding insuficiente','VPL negativo','Meta de cobertura não atingida','Amortização negativa']);
 result.warnings=result.warnings.filter(x=>!replace.has(x.title));
 if(extra>1)result.warnings.unshift({level:'danger',title:'Funding insuficiente',text:'O fluxo com SACOC exige aportes adicionais além das fontes parametrizadas.'});
 if(vpl<0)result.warnings.unshift({level:'danger',title:'VPL negativo',text:'O retorno projetado não remunera a TMA informada.'});
 if(t.coverage!==null&&t.coverage<p.target)result.warnings.push({level:'warning',title:'Meta de cobertura não atingida',text:'O caixa disponível até a entrega está abaixo da meta definida.'});
 result.warnings.push({level:'info',title:'SACOC: regra explícita de cotas',text:description(p)+'. A correção monetária é independente. Conferir fórmula e data de incidência com o contrato; o saldo-base não é valor de quitação.'});
 result.p=p;return result;
}
function simulate(input,light=false){
 const p=prepare(input);
 if(p.system!=='SACOC')return legacySimulate(p,light);
 // Obtain the unchanged project schedule and expenses, then replace only buyer flows.
 const result=legacySimulate({...p,system:'SAC',interest:0},true),rows=result.rows;
 for(const r of rows)for(const k of ['cash','entry','regular','balloon','scheduled','lost','portfolioBalance'])r[k]=0;
 const receive=(t,amount,type)=>{
  if(Math.abs(amount)<1e-9)return;
  rows[t].scheduled+=amount;rows[t].lost+=amount*p.loss/100;
  const collectible=amount*(1-p.loss/100),late=collectible*p.late/100;
  rows[t][type]+=collectible-late;rows[t+p.delay][type]+=late;
 };
 for(const c of result.cohorts){
  const value=c.units*result.totals.unit*Math.pow(1+p.appreciation/100,c.t/12);
  receive(c.t,value*p.cashSales/100,'cash');
  const con=contract(p,value*(1-p.cashSales/100));
  for(let k=0;k<p.entryMonths;k++){receive(c.t+k,con.entry/p.entryMonths,'entry');rows[c.t+k].portfolioBalance+=con.principal;}
  for(const s of con.schedule){const t=c.t+p.entryMonths-1+s.age;receive(t,s.regular,'regular');receive(t,s.balloon,'balloon');rows[t].portfolioBalance+=s.balance;}
 }
 result.contract=contract(p,result.totals.unit);
 return rebuild(result,p,light);
}
E.prepare=prepare;E.contract=contract;E.simulate=simulate;
E.sacoc={version:'1.0',settings,growthFactor,description,contract,keys:['sacocFrequency','sacocAnnualRate'],
 integratePlans:function(){const h=E.buyerPlans;if(h)for(const key of this.keys)if(!h.keys.includes(key))h.keys.push(key);}};
E.version+='-sacoc1';
})(typeof window!=='undefined'?window:globalThis);
