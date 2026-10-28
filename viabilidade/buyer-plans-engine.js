/* Buyer payment plans v1.0. Load after engine.js, before work-stages-engine.js. */
(function(root){
'use strict';
const E=root.EvoraEngine;if(!E||E.buyerPlans)return;
const basePrepare=E.prepare,baseSimulate=E.simulate;
const OFF='{"enabled":false,"plans":[]}';
E.defaults.buyerPlansJson=OFF;
const keys=['entry','entryMonths','term','interest','system','index','correction','indexFrequency','balloon','balloons'];
const numeric={share:[0,100],discount:[0,100],entry:[0,100],entryMonths:[1,36],term:[1,360],interest:[0,5],correction:[-20,30],balloon:[0,100],balloons:[0,30]};
const uid=()=>root.crypto?.randomUUID?.()||'plan-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const copy=o=>JSON.parse(JSON.stringify(o));
function read(value){
 if(value==null||value==='')return {enabled:false,plans:[]};
 let c;try{c=typeof value==='string'?JSON.parse(value):value;}catch{throw new Error('A configuração dos planos de pagamento não é um JSON válido.');}
 if(!c||typeof c!=='object'||Array.isArray(c)||typeof c.enabled!=='boolean'||!Array.isArray(c.plans))throw new Error('Configuração de planos inválida.');
 if(c.plans.length>12)throw new Error('Utilize no máximo 12 planos por empreendimento.');
 return copy(c);
}
function terms(p,plan){
 const out={...p,cashSales:plan.type==='cash'?100:0,discount:100*(1-(1-p.discount/100)*(1-plan.discount/100)),buyerPlansJson:OFF};
 for(const k of keys)out[k]=plan[k];
 if(plan.type==='cash')Object.assign(out,{entry:100,entryMonths:1,term:1,interest:0,system:'PRICE',index:'NONE',correction:0,indexFrequency:'monthly',balloon:0,balloons:0});
 return out;
}
function normalize(plan,i,p){
 if(!plan||typeof plan!=='object'||Array.isArray(plan))throw new Error('Plano '+(i+1)+' inválido.');
 const name=String(plan.name||'').trim();if(!name||name.length>80)throw new Error('Dê um nome de até 80 caracteres ao plano '+(i+1)+'.');
 const out={id:String(plan.id||'plan-'+i),name,type:plan.type,share:plan.share,discount:plan.discount??0};
 if(!['cash','installments'].includes(out.type))throw new Error(name+': selecione à vista ou parcelado.');
 for(const k of keys)out[k]=plan[k]??p[k];
 for(const [k,[min,max]] of Object.entries(numeric)){
  if(out.type==='cash'&&!['share','discount'].includes(k))continue;
  if(typeof out[k]!=='number'||!Number.isFinite(out[k])||out[k]<min||out[k]>max)throw new Error(name+': '+k+' deve ficar entre '+min+' e '+max+'.');
 }
 if(!out.id||out.id.length>100)throw new Error(name+': identificador inválido.');
 try{basePrepare(terms(p,out));}catch(e){throw new Error(name+': '+e.message);}
 return out;
}
function validate(config,p){
 const c=read(config),plans=c.plans.map((x,i)=>normalize(x,i,p));
 if(new Set(plans.map(x=>x.id)).size!==plans.length)throw new Error('Os planos precisam de identificadores distintos. Use Duplicar para criar uma cópia.');
 if(c.enabled){
  if(!plans.length)throw new Error('Adicione pelo menos um plano.');
  const total=plans.reduce((n,x)=>n+x.share,0);
  if(Math.abs(total-100)>0.000001)throw new Error('A participação dos planos soma '+total.toLocaleString('pt-BR',{maximumFractionDigits:4})+'%. Ajuste para 100%.');
 }
 return {enabled:c.enabled,plans};
}
function prepare(input){
 const p=basePrepare(input),c=read(p.buyerPlansJson);
 // Saved, disabled drafts do not affect legacy studies or their calculations.
 const valid=c.enabled?validate(c,p):c;
 p.buyerPlansJson=JSON.stringify(valid);p.buyerPlanMode=valid.enabled?'multiple':'single';
 if(valid.enabled)p.buyerPlans=valid.plans;
 return p;
}
function starter(p){
 const common={discount:0};for(const k of keys)common[k]=p[k];
 const plans=[];
 if(p.cashSales>0)plans.push({...common,id:uid(),name:'À vista',type:'cash',share:p.cashSales});
 if(p.cashSales<100)plans.push({...common,id:uid(),name:'Plano padrão',type:'installments',share:100-p.cashSales});
 return {enabled:true,plans};
}
function blank(p){const c=starter({...p,cashSales:0}).plans[0];return {...c,id:uid(),name:'Novo plano',share:0};}
function rebuild(result,p,light){
 const rows=result.rows,workEnd=p.workStart+p.duration-1;
 let cum=0,cw=0,cp=0,cf=0,cr=0,cu=0,peak=0,peakMonth=0;
 for(const r of rows){
  r.received=r.cash+r.entry+r.regular+r.balloon;r.tax=r.received*p.tax/100;r.servicing=r.received*p.servicing/100;
  if(p.landMode==='share')r.land=r.received*p.landShare/100;
  r.portfolioNet=r.received-r.tax-r.servicing-(p.landMode==='share'?r.land:0);
  r.cashForWork=r.portfolioNet-(p.landMode==='cash'?r.land:0)-r.predev-r.commission-r.marketing-r.admin;
  r.available=r.cashForWork;r.net=r.cashForWork-r.work;cum+=r.net;cw+=r.work;cp+=r.portfolioNet;cf+=r.cashForWork;cr+=r.received;cu+=r.units;
  Object.assign(r,{cumulative:cum,cumWork:cw,cumPortfolioNet:cp,cumCashForWork:cf,cumAvailable:cf,cumReceived:cr,cumUnits:cu,coverage:cw>0?Math.max(0,cf)/cw*100:0});
  if(-cum>peak){peak=-cum;peakMonth=r.t;}
 }
 let bank=p.equity,debt=0,totalDraw=0,extra=0,interest=0,fee=0,repay=0,distribution=0;
 for(const r of rows){
  Object.assign(r,{draw:0,interest:debt*p.debtRate/100,fee:0,repay:0,debt:0,extraEquity:0,distribution:0,bank:0,equityCF:0});bank+=r.net-r.interest;
  if(bank<0&&r.t<=p.drawEnd&&r.t<p.maturity){r.draw=Math.min(Math.max(0,p.credit-totalDraw),-bank/(1-p.debtFee/100));r.fee=r.draw*p.debtFee/100;debt+=r.draw;totalDraw+=r.draw;bank+=r.draw-r.fee;}
  if(r.t>=p.sweepStart&&bank>0&&debt>0){r.repay=Math.min(bank,debt);debt-=r.repay;bank-=r.repay;}
  if(r.t===p.maturity&&debt>0){r.repay+=debt;bank-=debt;debt=0;}
  if(bank<0){r.extraEquity=-bank;extra-=bank;bank=0;}
  if(r.t>=workEnd+1&&debt<.001&&bank>0){r.distribution=bank;bank=0;}
  if(r.t===rows.length-1&&bank>0){r.distribution+=bank;bank=0;}
  r.debt=debt;r.bank=bank;r.equityCF=r.distribution-r.extraEquity-(r.t===0?p.equity:0);
  interest+=r.interest;fee+=r.fee;repay+=r.repay;distribution+=r.distribution;
 }
 const sum=k=>rows.reduce((n,r)=>n+r[k],0),flows=rows.map(r=>r.net),receipts=sum('received'),work=sum('work'),completion=rows[workEnd],vpl=E.npv(flows,p.tma),landVpl=E.npv(rows.map(r=>r.land),p.tma);
 let lastNegative=-1;for(const r of rows)if(r.cumulative<-.01)lastNegative=r.t;
 const unit=result.paymentPlans.reduce((n,x)=>n+x.unitPrice*x.share/100,0),vgv=unit*result.totals.qty;
 Object.assign(result.totals,{unit,vgv,signed:sum('signed'),receipts,lost:sum('lost'),scheduled:sum('scheduled'),work,land:sum('land'),landVpl,landPctVgv:vgv?landVpl/vgv*100:null,portfolioNet:sum('portfolioNet'),cashForWork:sum('cashForWork'),commission:sum('commission'),marketing:sum('marketing'),tax:sum('tax'),servicing:sum('servicing'),profit:sum('net'),margin:receipts?sum('net')/receipts*100:null,vpl,projectIRR:light?{annual:null}:E.irr(flows),equityIRR:light?{annual:null}:E.irr(rows.map(r=>r.equityCF)),peak,peakMonth,payback:lastNegative===rows.length-1?null:lastNegative<0?0:lastNegative+1,workEnd,horizon:rows.length-1,coverage:work?Math.max(0,completion.cumCashForWork)/work*100:null,portfolioNetAtCompletion:completion.cumPortfolioNet,cashForWorkAtCompletion:completion.cumCashForWork,availableAtCompletion:completion.cumCashForWork,receivedAtCompletion:completion.cumReceived,soldAtCompletion:completion.cumUnits,portfolioAtCompletion:completion.portfolioBalance,futureReceipts:rows.slice(workEnd+1).reduce((n,r)=>n+r.received,0),pvFuture:rows.slice(workEnd+1).reduce((n,r)=>n+r.received/Math.pow(1+E.monthly(p.tma),r.t-workEnd),0),targetMonth:rows.find(r=>r.t<=workEnd&&r.cumCashForWork>=work*p.target/100)?.t??null,draw:totalDraw,extra,interest,fee,repay,distribution,equityTotal:p.equity+extra,buyerPlanCount:result.paymentPlans.filter(x=>x.share>0).length});
 const removed=new Set(['Funding insuficiente','VPL negativo','Meta de cobertura não atingida','Amortização negativa']);
 result.warnings=result.warnings.filter(w=>!removed.has(w.title));
 if(extra>1)result.warnings.unshift({level:'danger',title:'Funding insuficiente',text:'A combinação dos planos e desembolsos exige aportes adicionais além das fontes informadas.'});
 if(vpl<0)result.warnings.unshift({level:'danger',title:'VPL negativo',text:'O retorno projetado não remunera a TMA informada.'});
 if(work&&result.totals.coverage<p.target)result.warnings.push({level:'warning',title:'Meta de cobertura não atingida',text:'Os recebimentos combinados dos planos não atingem a meta de cobertura até a entrega.'});
 for(const x of result.paymentPlans)if(x.share>0&&x.contract.negative)result.warnings.push({level:'warning',title:'Amortização negativa',text:'Revise os balões do plano '+x.name+': a prestação regular é inferior aos juros em algum vencimento.'});
 result.p=p;return result;
}
function simulate(input,light=false){
 const p=prepare(input),config=read(p.buyerPlansJson);
 if(!config.enabled)return baseSimulate(p,light);
 const active=config.plans.filter(x=>x.share>0),longest=active.reduce((best,x)=>(x.type==='cash'?0:x.entryMonths+x.term)>(best.type==='cash'?0:best.entryMonths+best.term)?x:best,active[0]);
 const seed=terms(p,longest),result=baseSimulate(seed,true),rows=result.rows;
 const end=active.reduce((n,x)=>Math.max(n,x.type==='cash'?0:x.entryMonths+x.term-1),0);
 const horizon=Math.max(result.totals.lastSale+end+p.delay,p.workStart+p.duration-1,p.landMode==='cash'?p.landMonths:0,p.adminMonths-1,p.credit>0?p.maturity:0);
 rows.length=horizon+1;
 for(const r of rows){for(const k of ['signed','cash','entry','regular','balloon','scheduled','lost','portfolioBalance','commission','marketing'])r[k]=0;r.buyerPlanReceipts={};}
 result.paymentPlans=config.plans.map(plan=>{
  const pp=terms(p,plan),unitPrice=p.lot*p.price*(1-p.discount/100)*(1-plan.discount/100),monthly=rows.map(r=>({t:r.t,units:0,signed:0,cash:0,entry:0,regular:0,balloon:0,scheduled:0,lost:0,received:0,portfolioBalance:0}));
  const sample=plan.type==='cash'?{principal:0,entry:unitPrice,first:0,negative:false,schedule:[]}:E.contract(pp,unitPrice);
  const receive=(t,amount,type)=>{
   if(Math.abs(amount)<1e-9)return;
   monthly[t].scheduled+=amount;monthly[t].lost+=amount*p.loss/100;
   const collectible=amount*(1-p.loss/100),late=collectible*p.late/100;
   monthly[t][type]+=collectible-late;monthly[t+p.delay][type]+=late;
  };
  if(plan.share>0)for(const c of result.cohorts){
   const units=c.units*plan.share/100,value=units*unitPrice*Math.pow(1+p.appreciation/100,c.t/12);
   monthly[c.t].units+=units;monthly[c.t].signed+=value;
   if(plan.type==='cash'){receive(c.t,value,'cash');continue;}
   const con=E.contract(pp,value);
   for(let k=0;k<pp.entryMonths;k++){receive(c.t+k,con.entry/pp.entryMonths,'entry');monthly[c.t+k].portfolioBalance+=con.principal;}
   for(const s of con.schedule){const t=c.t+pp.entryMonths-1+s.age;receive(t,s.regular,'regular');receive(t,s.balloon,'balloon');monthly[t].portfolioBalance+=s.balance;}
  }
  for(const m of monthly){
   m.received=m.cash+m.entry+m.regular+m.balloon;
   for(const k of ['signed','cash','entry','regular','balloon','scheduled','lost','portfolioBalance'])rows[m.t][k]+=m[k];
   rows[m.t].buyerPlanReceipts[plan.id]=m.received;
  }
  const sum=k=>monthly.reduce((n,r)=>n+r[k],0),workEnd=p.workStart+p.duration-1;
  return {...plan,unitPrice,units:result.totals.qty*plan.share/100,contract:sample,monthly,totals:{vgv:unitPrice*result.totals.qty*plan.share/100,signed:sum('signed'),scheduled:sum('scheduled'),receipts:sum('received'),lost:sum('lost'),receivedAtCompletion:monthly.filter(r=>r.t<=workEnd).reduce((n,r)=>n+r.received,0),receiptsPV:E.npv(monthly.map(r=>r.received),p.tma)}};
 });
 for(const r of rows){r.commission=r.signed*p.commission/100;r.marketing=r.signed*p.marketing/100;}
 result.contract=(result.paymentPlans.find(x=>x.share>0&&x.type==='installments')||result.paymentPlans.find(x=>x.share>0)).contract;
 p.buyerPlans=config.plans;
 p.buyerPlanSummary=result.paymentPlans.map(x=>({id:x.id,name:x.name,share:x.share,type:x.type,unitPrice:x.unitPrice,expectedEquivalentLots:x.units,firstRegular:x.contract.first,...x.totals}));
 p.buyerPlanModel='Participação constante por grupo mensal de vendas, aplicada a lotes equivalentes; não arredonda contratos. Desconto adicional de cada plano compõe multiplicativamente o desconto global. Risco, tributos e despesas seguem premissas globais. cashSales e condições globais de parcelamento são ignorados quando este modo está ativo. Não confundir prazo ou juros de um plano com uma média contratual.';
 return rebuild(result,p,light);
}
E.prepare=prepare;E.simulate=simulate;
E.buyerPlans={read,validate,starter,blank,terms,keys,uid,copy,version:'1.0'};
})(typeof window!=='undefined'?window:globalThis);
