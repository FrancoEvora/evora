/* Run from viabilidade: node tests/investment-assessment.test.cjs */
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const c={console,crypto:require('node:crypto').webcrypto,requestAnimationFrame:()=>{},document:{getElementById:()=>null}};
c.window=c;c.globalThis=c;c.addEventListener=()=>{};vm.createContext(c);
for(const name of ['engine','buyer-plans-engine','work-stages-engine','performance-core','health-score','investment-assessment']){
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name+'.js'),'utf8'),c,{filename:name+'.js'});
}
const E=c.EvoraEngine;
function assessment(result,scenarios,actuals={sales:{},work:{},plan:null}){
 const project={id:'qa',params:result.p,updated:'2026-10-27',actuals};
 const data=E.performance.performance(project,result,12);
 data.scenarios=scenarios||E.scenarios(result.p).map(s=>s.error?{id:s.id,name:s.name,error:s.error}:{id:s.id,name:s.name,vpl:s.result.totals.vpl});
 return {a:E.investmentAssessment(project,result,data),result,project,data};
}
const result=E.simulate({...E.defaults});
const baseline=assessment(result);
assert.equal(baseline.a.score,E.healthScore(baseline.project,baseline.result).score);
assert.equal(baseline.a.scoreDimensions.length,6);
assert.equal(baseline.a.scoreDimensions.reduce((n,d)=>n+d.max,0),100);
assert.equal(baseline.a.canCommit,false);
assert.ok(baseline.a.alerts.some(a=>a.includes('realizados')));
assert.ok(baseline.a.diligence.every(x=>/Não verificado|Pendente/.test(x.status)));
assert.equal(typeof baseline.a.label,'string');
const negative=E.simulate({...E.defaults});negative.totals.vpl=-50000;negative.totals.extra=0;
const ng=assessment(negative);assert.equal(ng.a.category,'do_not_invest');assert.ok(ng.a.critical.some(b=>b.code==='negative_vpl'));
const unfunded=E.simulate({...E.defaults});unfunded.totals.extra=500000;unfunded.totals.vpl=Math.abs(unfunded.totals.vpl)+10000;
const uf=assessment(unfunded);assert.equal(uf.a.category,'do_not_invest');assert.ok(uf.a.critical.some(b=>b.code==='uncovered_funding'));
const good=E.simulate({...E.defaults});const t=good.totals;
Object.assign(t,{vpl:t.vgv*.26,coverage:100,peak:0,extra:0,soldAtCompletion:t.qty});
for(const r of good.rows)r.debt=0;
const positiveScenarios=[{id:'stress',name:'Estresse',vpl:t.vgv*.02}];
const favorable=assessment(good,positiveScenarios,{sales:{0:12},work:{1:10},plan:null});
assert.ok(favorable.a.score>=80);
assert.equal(favorable.a.category,'conditionally_favorable');
assert.equal(favorable.a.canCommit,false);
assert.ok(/DILIGÊNCIA/.test(favorable.a.label));
const weakStress=assessment(good,[{id:'stress',name:'Estresse',vpl:-900}]);
assert.equal(weakStress.a.category,'pending_restructuring');
assert.ok(weakStress.a.alerts.some(x=>x.includes('estresse')));
const scoreLimits=E.healthScore(favorable.project,good);
assert.equal(scoreLimits.score,favorable.a.score);
const withActual=assessment(good,positiveScenarios,{sales:{0:12},work:{1:10},plan:null});
assert.equal(withActual.a.supporting.realizedSalesAvailable,true);
assert.equal(withActual.a.supporting.realizedWorkAvailable,true);
const stage=E.simulate({...E.defaults,workMode:'stages',workStagesJson:JSON.stringify([{id:'a',name:'Infra',budget:20000000,start:1,duration:24,contingency:5,curve:'s'},{id:'b',name:'Lazer',budget:4000000,start:25,duration:12,contingency:5,curve:'linear'}])});
assert.ok(Number.isFinite(assessment(stage).a.score));
assert.ok(!Object.keys(assessment(stage).a).some(x=>x==='api_key'));
console.log('PASS investor score: common executive parity, 6 weighted dimensions, missing evidence, negative NPV and funding gates, conditional positive and stress, stages, no unconditional funding release.');
