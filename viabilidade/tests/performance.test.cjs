/* Run: node tests/performance.test.cjs */
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const c={console,crypto:require('node:crypto').webcrypto};c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of ['engine','buyer-plans-engine','work-stages-engine','performance-core'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f+'.js'),'utf8'),c);
const E=c.EvoraEngine,H=E.performance;
const p={...E.defaults,workMode:'stages',workStagesJson:JSON.stringify([{id:'infra',name:'Infraestrutura',budget:14000000,start:2,duration:20,contingency:5,curve:'s'},{id:'lazer',name:'Lazer',budget:8000000,start:22,duration:12,contingency:5,curve:'linear'}])};
const seed=H.addPreset([],'infrastructure',[0,1,2],21);assert.equal(seed.added,3);assert.equal(H.addPreset(seed.items,'infrastructure',[0,1,2],21).added,0);
seed.items[0].status='done';seed.items[0].completedMonth=12;
const reg={version:1,byStage:{infra:H.normalizeItems(seed.items)}},r0=E.simulate(p),r=E.simulate({...p,deliveryRegisterJson:JSON.stringify(reg)});
assert.equal(r.totals.vpl,r0.totals.vpl);assert.equal(JSON.parse(r.p.deliveryRegisterJson).byStage.infra.length,3);
const project={id:'qa',params:r.p,actuals:{sales:{0:0,2:5},work:{2:0,3:10},plan:null},updated:'2026-10-27'},d=H.performance(project,r,24);
assert.equal(d.deliverables.total,3);assert.equal(d.deliverables.done,1);assert.equal(d.deliverables.overdue,2);assert.equal(H.performance(project,r,6).deliverables.done,0);
assert.equal(d.sales.available,true);assert.equal(d.sales.complete,false);assert.equal(d.sales.actual,5);
assert.equal(H.actualComparison({},r,24,'sales').actual,null);assert.equal(H.actualComparison({0:0},r,0,'sales').actual,0);
assert.throws(()=>H.normalizeItems([{title:'Entrega',status:'done'}]));assert.throws(()=>H.normalizeItems([{title:''}]));
for(const mode of ['single','stages'])for(const cash of [0,100])for(const landMode of ['cash','share']){
 const result=E.simulate({...p,workMode:mode,cashSales:cash,landMode}),data=H.performance({params:result.p,actuals:{}},result,24);
 assert.ok(Math.abs(data.cycle.identityResidual)<1e-5);assert.ok(Math.abs(data.period.identityResidual)<1e-5);
 for(const row of H.cashRows(result)){assert.ok(Math.abs(row.received-row.operatingCost-row.net)<1e-6);assert.ok(Math.abs(row.cumTotalIn-row.cumTotalOut-row.bank)<1e-5);}
}
const mixed={...p,buyerPlansJson:JSON.stringify(E.buyerPlans.starter(p))};const mr=E.simulate(mixed),md=H.performance({params:mr.p,actuals:{}},mr,12);assert.ok(Math.abs(md.cycle.identityResidual)<1e-5);
console.log('PASS: metadata preserved; unchanged financials; presets deduplicated; month-sensitive completions; missing values distinct from zero; monthly/cumulative sources and uses reconcile; stages and buyer plans compatible.');
