/* Run: node tests/sacoc.test.cjs */
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function load(names){const c={console,crypto:require('node:crypto').webcrypto};c.window=c;c.globalThis=c;vm.createContext(c);for(const name of names)vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name+'.js'),'utf8'),c,{filename:name});return c.EvoraEngine;}
const old=load(['engine','buyer-plans-engine','work-stages-engine','performance-core']);
const E=load(['engine','sacoc-engine','buyer-plans-engine','sacoc-plan-fields','work-stages-engine','performance-core','deliverables-presets-expanded']);
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<Math.max(0.0001,Math.abs(b)*1e-10),label+': '+a+' != '+b);
for(const system of ['PRICE','SAC'])for(const workMode of ['single','stages']){
 const p={...old.defaults,system,workMode,workStagesJson:JSON.stringify([{id:'a',name:'Infra',budget:14000000,start:1,duration:20,contingency:5,curve:'s'},{id:'b',name:'Lazer',budget:8000000,start:21,duration:12,contingency:8,curve:'linear'}])};
 const a=old.simulate(p),b=E.simulate(p);
 for(const key of ['vpl','receipts','work','peak','landVpl','extra','draw','repay','interest','distribution'])near(a.totals[key],b.totals[key],'Legacy '+system+' '+workMode+' '+key);
 for(let i=0;i<a.rows.length;i++)for(const key of ['received','cumulative','portfolioBalance','bank','debt'])near(a.rows[i][key],b.rows[i][key],'Legacy row '+i+' '+key);
}
const p=E.prepare({...E.defaults,system:'SACOC',entry:0,entryMonths:1,term:300,interest:.8,balloon:0,balloons:0,index:'NONE',sacocFrequency:12,sacocAnnualRate:6});
const c=E.contract(p,468000);
near(c.first,1560,'reference installment 1');near(c.schedule[11].regular,1560,'installment 12');near(c.schedule[12].regular,1653.6,'installment 13');near(c.schedule[24].regular,1752.816,'installment 25');near(c.schedule.at(-1).regular,1560*1.06**24,'installment 300');
near(E.contract({...p,interest:4},468000).schedule[12].regular,c.schedule[12].regular,'annual ignores monthly');
near(E.contract({...p,sacocAnnualRate:12.36},468000).schedule[12].regular,1560*1.06*1.06,'explicit combined annual rate');
for(const frequency of [1,12])for(const term of [1,12,13,24,180,300,360])for(const entry of [0,10,100]){
 const count=term>=12&&entry<100?Math.min(4,Math.floor(term/12)):0;
 const terms={...p,term,entry,balloon:count?15:0,balloons:count,sacocFrequency:frequency,interest:.65};
 const con=E.contract(terms,432000);
 near(con.schedule.reduce((n,r)=>n+r.baseAmortization,0),con.principal,'principal conserved');near(con.schedule.at(-1).balance,0,'zero last balance');
 for(const r of con.schedule){near(r.regular+r.balloon,r.interest+r.amortization,'payment decomposes');assert.ok(r.regular>=0&&r.balloon>=0&&r.balance>=0);}
 if(frequency===1)near(con.first,con.baseRegular*1.0065,'first monthly cotas');
}
for(const correction of ['NONE','TR','IPCA'])for(const frequency of [1,12]){
 const single={...E.defaults,system:'SACOC',sacocFrequency:frequency,sacocAnnualRate:6,index:correction};
 const sr=E.simulate(single),config=E.buyerPlans.starter(E.prepare(single));
 const mr=E.simulate({...single,buyerPlansJson:JSON.stringify(config)});
 for(const key of ['vpl','receipts','peak','extra','landVpl','draw','distribution'])near(sr.totals[key],mr.totals[key],'single/multiple '+key);
 for(const r of mr.rows)near(r.received,Object.values(r.buyerPlanReceipts).reduce((s,v)=>s+v,0),'mixed monthly conservation');
 const d=E.performance.performance({id:'qa',params:mr.p,actuals:{}},mr,24);near(d.period.identityResidual,0,'period funding bridge');near(d.cycle.identityResidual,0,'cycle funding bridge');
 near(sr.totals.receipts,sr.totals.scheduled-sr.totals.lost,'loss delayed conservation');
}
const common=E.buyerPlans.blank(E.prepare(p));const mixed={enabled:true,plans:[{...common,id:'a',name:'Price',share:40,system:'PRICE'},{...common,id:'b',name:'SAC',share:20,system:'SAC'},{...common,id:'c',name:'SACOC anual',share:30,system:'SACOC',sacocFrequency:12},{...common,id:'d',name:'Vista',share:10,type:'cash'}]};
const mr=E.simulate({...p,buyerPlansJson:JSON.stringify(mixed),workMode:'stages',workStagesJson:JSON.stringify([{id:'x',name:'Implantação',budget:22000000,start:2,duration:36,contingency:5,curve:'s'}])});
near(mr.totals.receipts,mr.paymentPlans.reduce((n,x)=>n+x.totals.receipts,0),'all plans reconcile');
for(const scenario of E.scenarios(mr.p)){assert.ok(!scenario.error,scenario.error);assert.equal(scenario.result.paymentPlans.find(x=>x.id==='c').system,'SACOC');assert.ok(Number.isFinite(scenario.result.totals.vpl));}
assert.throws(()=>E.prepare({...p,sacocFrequency:2}));assert.throws(()=>E.prepare({...p,sacocAnnualRate:-1}));assert.throws(()=>E.prepare({...p,entry:90,balloon:15}));
const pp=E.prepare(JSON.parse(JSON.stringify(mr.p)));assert.equal(pp.buyerPlans.find(x=>x.id==='c').sacocAnnualRate,6);
const H=E.performance,groups=['leisureDetailed','gateSecurity','commonServices','landscapeDetailed'];
for(const group of groups){const selected=H.presets[group].items.map((_,i)=>i),loaded=H.addPreset([],group,selected,24);assert.equal(loaded.added,selected.length);assert.equal(H.addPreset(loaded.items,group,selected,24).added,0);assert.ok(H.normalizeItems(loaded.items).every(x=>x.status==='pending'));}
assert.equal(H.presets.leisure.items[0][0],'Portaria e controle de acesso');
console.log('PASS: Price/SAC legacy parity; SACOC annual/monthly anchors; separate indexation; principal/balloon conservation; cash/loss/funding reconciliation; scenarios; stage integration; saved plan rules; optional preset deduplication.');
