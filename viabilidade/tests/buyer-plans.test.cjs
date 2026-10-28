/* Run: node viabilidade/tests/buyer-plans.test.cjs */
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function engine(files){const c={crypto:require('node:crypto').webcrypto};c.window=c;c.globalThis=c;vm.createContext(c);files.forEach(f=>vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),c));return c.EvoraEngine;}
const old=engine(['engine.js','work-stages-engine.js']);
const E=engine(['engine.js','buyer-plans-engine.js','work-stages-engine.js']);
function near(a,b,label){assert.ok(Math.abs(a-b)<Math.max(1e-5,Math.abs(a)*1e-9),label+': '+a+' != '+b);}
const base={...old.defaults},legacy=old.simulate(base),seed=E.buyerPlans.starter(base);
const mixed=E.simulate({...base,buyerPlansJson:JSON.stringify(seed)});
for(const key of ['receipts','vpl','landVpl','unit','vgv','work','peak','draw','extra','interest','fee','repay','distribution'])near(legacy.totals[key],mixed.totals[key],'legacy '+key);
for(let t=0;t<legacy.rows.length;t++)for(const key of ['received','signed','portfolioBalance','cumulative','debt','bank','draw'])near(legacy.rows[t][key],mixed.rows[t][key],'month '+t+' '+key);
const a={...seed.plans.find(x=>x.type==='installments'),id:'a',share:50,term:120,balloon:0,balloons:0};
const b={...a,id:'b',share:50,term:300,interest:.33,entry:5,entryMonths:6,index:'IPCA',correction:4,discount:5};
const parameters={...base,buyerPlansJson:JSON.stringify({enabled:true,plans:[a,b]})};
const combined=E.simulate(parameters);
for(const row of combined.rows)near(row.received,Object.values(row.buyerPlanReceipts).reduce((s,x)=>s+x,0),'monthly plan receipts');
near(combined.totals.qty,legacy.totals.qty,'stock');near(combined.totals.work,legacy.totals.work,'work not duplicated');
near(combined.totals.receipts,combined.paymentPlans.reduce((s,x)=>s+x.totals.receipts,0),'total receipts');
near(combined.totals.scheduled-combined.totals.lost,combined.totals.receipts,'cash conservation');
const staged={...base,workMode:'stages',workStagesJson:JSON.stringify([{id:'s1',name:'Infra',budget:14000000,start:2,duration:20,contingency:5,curve:'s'},{id:'s2',name:'Lazer',budget:8000000,start:22,duration:12,contingency:8,curve:'linear'}])};
const stageOld=old.simulate(staged),stageMixed=E.simulate({...staged,buyerPlansJson:JSON.stringify(seed)});
for(const key of ['vpl','receipts','work','peak','extra','interest','landVpl','cashForWorkAtCompletion'])near(stageOld.totals[key],stageMixed.totals[key],'stages '+key);
const cash=E.simulate({...base,buyerPlansJson:JSON.stringify({enabled:true,plans:[{...a,id:'cash',type:'cash',share:100}]})});
near(cash.totals.receipts,cash.totals.signed*(1-base.loss/100),'cash plan');assert.ok(cash.totals.peak<combined.totals.peak);
for(const system of ['PRICE','SAC'])for(const term of [1,12,180,300,360]){
 const r=E.simulate({...base,buyerPlansJson:JSON.stringify({enabled:true,plans:[{...a,share:100,system,term}]})});assert.ok(r.rows.every(x=>Number.isFinite(x.net)));
 near(r.totals.scheduled-r.totals.lost,r.totals.receipts,'receipts '+system+' '+term);
}
assert.throws(()=>E.simulate({...base,buyerPlansJson:JSON.stringify({enabled:true,plans:[{...a,share:80}]})}));
assert.throws(()=>E.simulate({...base,buyerPlansJson:JSON.stringify({enabled:true,plans:[{...a,share:100,balloon:80,entry:30,balloons:3}]})}));
assert.throws(()=>E.simulate({...base,buyerPlansJson:JSON.stringify({enabled:true,plans:[{...a,share:100,term:12,balloon:20,balloons:2}]})}));
const zero=E.simulate({...base,buyerPlansJson:JSON.stringify({enabled:true,plans:[{...a,share:100},{...b,share:0,term:360}]})});
assert.equal(zero.totals.horizon,E.simulate({...base,buyerPlansJson:JSON.stringify({enabled:true,plans:[{...a,share:100}]})}).totals.horizon);
const serialized=JSON.parse(JSON.stringify(parameters));near(E.simulate(serialized).totals.vpl,combined.totals.vpl,'backup round trip');
for(const s of E.scenarios(parameters))assert.ok(s.result||s.error);
console.log('PASS: legacy parity, mixed receipts, cash conservation, stage integration, funding, zero-share horizon, Price/SAC terms, input validation, JSON round-trip.');
