/* Run: node tests/work-curve-duration.test.cjs */
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const context={console,crypto:require('node:crypto').webcrypto};context.window=context;context.globalThis=context;vm.createContext(context);
for(const name of ['engine','sacoc-engine','buyer-plans-engine','sacoc-plan-fields','work-stages-engine','performance-core','work-curves-core'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name+'.js'),'utf8'),context,{filename:name});
const E=context.EvoraEngine,W=E.workCurves,copy=value=>JSON.parse(JSON.stringify(value));
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<=Math.max(1e-10,Math.abs(b)*1e-12),label+': '+a+' != '+b);
const geometry=params=>copy(params.workStages.map(({id,start,duration,curve,weights})=>({id,start,duration,curve,weights})));
const makeStages=stages=>({...E.defaults,workMode:'stages',workStagesJson:JSON.stringify(stages)});
const stage=(id,start,duration,extra={})=>({id,name:'Etapa '+id,budget:1000000,start,duration,contingency:5,curve:'s',...extra});

// Enlarging 18 to 36 months splits each manual month's mass equally in two.
const original18={...E.defaults,workStart:4,duration:18,curve:'custom',workWeights:[1,0,2,3,0,4,5,0,6,7,0,8,9,0,10,11,0,12]};
const before18=JSON.stringify(original18),grown36=W.resizeDuration(original18,36),sum18=original18.workWeights.reduce((sum,value)=>sum+value,0);
assert.equal(JSON.stringify(original18),before18,'resize is a pure preview');
assert.equal(grown36.duration,36);assert.equal(grown36.workStart,4);assert.equal(grown36.work,original18.work);
for(let index=0;index<18;index++)for(let half=0;half<2;half++)near(grown36.workWeights[index*2+half],original18.workWeights[index]/sum18/2,'mass split');
assert.equal(grown36.workWeights[2],0);assert.equal(grown36.workWeights[3],0);
near(grown36.workWeights.reduce((sum,value)=>sum+value,0),1,'resized weights sum to 100%');
assert.equal(W.readOriginal(grown36).single.duration,18);
const reapplied=W.applyModel(grown36,'late'),resizedAgain=W.resizeDuration(reapplied,24);
assert.equal(resizedAgain.workCurveOriginalJson,grown36.workCurveOriginalJson,'reference stays immutable across model and duration changes');
const restored18=W.restore(copy(resizedAgain));
assert.equal(restored18.duration,18);assert.equal(restored18.workStart,4);assert.equal(restored18.curve,'custom');
assert.deepEqual(copy(restored18.workWeights),original18.workWeights,'exact original manual weights restore');

const original24={...E.defaults,workStart:3,duration:24,curve:'linear'},compressed18=W.resizeDuration(original24,18);
assert.equal(compressed18.duration,18);assert.equal(compressed18.workStart,3);assert.equal(compressed18.curve,'linear');
for(const weight of E.weights(compressed18))near(weight,1/18,'uniform new monthly weights');
assert.equal(W.restore(compressed18).duration,24);

// Equal durations are strict no-ops for the prepared schedule and original JSON.
for(const input of [original18,grown36,original24]){
 const same=W.resizeDuration(input,input.duration);
 assert.deepEqual(copy(same),copy(E.prepare(input)));
 assert.equal(same.workCurveOriginalJson,input.workCurveOriginalJson||'');
}

const oldStages=makeStages([
 stage('a',2,10,{budget:9000000,curve:'custom',weights:[1,0,2,0,3,3,0,2,0,1]}),
 stage('b',7,7,{budget:4000000,curve:'early'}),
 stage('c',21,5,{budget:2000000,curve:'late'})
]);
const preparedStages=E.prepare(oldStages),frozenStages=JSON.stringify(oldStages),shortStages=W.resizeDuration(oldStages,18);
assert.equal(JSON.stringify(oldStages),frozenStages);assert.equal(shortStages.workStart,2);assert.equal(shortStages.duration,18);
assert.deepEqual(copy(shortStages.workStages.map(({start,duration})=>({start,duration}))),[{start:2,duration:8},{start:6,duration:5},{start:16,duration:4}]);
assert.ok(shortStages.workStages[1].start<shortStages.workStages[0].start+shortStages.workStages[0].duration,'overlap retained approximately');
assert.ok(shortStages.workStages[2].start>shortStages.workStages[1].start+shortStages.workStages[1].duration,'gap retained approximately');
for(let index=0;index<3;index++)for(const key of ['id','name','budget','contingency','curve'])assert.equal(shortStages.workStages[index][key],preparedStages.workStages[index][key],key+' preserved');
const longStages=W.resizeDuration(oldStages,36);
assert.equal(longStages.workStart,2);assert.equal(longStages.duration,36);
assert.deepEqual(copy(longStages.workStages.map(({start,duration})=>({start,duration}))),[{start:2,duration:15},{start:10,duration:10},{start:31,duration:7}]);
const restoredStages=W.restore(copy(W.applyModel(W.resizeDuration(shortStages,30),'linear')));
const actualOriginal=geometry(restoredStages),expectedOriginal=geometry(preparedStages);
for(let index=0;index<3;index++){
 for(const key of ['id','start','duration','curve'])assert.equal(actualOriginal[index][key],expectedOriginal[index][key]);
 for(let month=0;month<actualOriginal[index].weights.length;month++)near(actualOriginal[index].weights[month],expectedOriginal[index].weights[month],'restored stage weights');
}
assert.equal(restoredStages.workCurveOriginalJson,shortStages.workCurveOriginalJson);

// Resize only the chosen stage, keeping other stages exactly prepared as before.
const selectedStage=W.resizeDuration(oldStages,12,'stage:b');
assert.equal(selectedStage.workStages[1].start,7);assert.equal(selectedStage.workStages[1].duration,12);
assert.deepEqual(copy(selectedStage.workStages[0]),copy(preparedStages.workStages[0]));assert.deepEqual(copy(selectedStage.workStages[2]),copy(preparedStages.workStages[2]));
assert.deepEqual(copy(W.resizeDuration(oldStages,7,'stage:b')),copy(preparedStages));
const selectedManual=W.resizeDuration(oldStages,20,'stage:a');
for(let index=0;index<10;index++)near(selectedManual.workStages[0].weights[index*2],preparedStages.workStages[0].weights[index]/2,'selected manual mass');
assert.equal(W.restore(selectedManual,'stage:a').workStages[0].duration,10);

// M120 may be an ending month, but the existing stage engine caps starts at M119.
const boundary=makeStages([stage('first',2,117),stage('last',118,1)]),at120=W.resizeDuration(boundary,119);
assert.equal(at120.workStart,2);assert.equal(at120.duration,119);assert.equal(at120.workStages[1].start,119);assert.equal(at120.workStages[1].duration,2);
assert.equal(at120.workStages[1].start+at120.workStages[1].duration-1,120);
const starts119=makeStages([stage('last',119,1)]),twoMonths=W.resizeDuration(starts119,2);
assert.equal(twoMonths.workStart,119);assert.equal(twoMonths.duration,2);assert.equal(twoMonths.workStages[0].start,119);
assert.throws(()=>W.resizeDuration(starts119,3),/M120/);assert.throws(()=>W.resizeDuration(starts119,3,'stage:last'),/M120/);
assert.throws(()=>W.resizeDuration(boundary,120),/M120/);
assert.throws(()=>W.resizeDuration(oldStages,120,'stage:c'),/M120/);
const single120=W.resizeDuration({...E.defaults,workStart:120,duration:1},2);
assert.equal(single120.workStart,120);assert.equal(single120.duration,2,'single retains its existing engine range');

// Compression to one month preserves all stages and budgets at the global start.
const oneMonth=W.resizeDuration(oldStages,1);
assert.equal(oneMonth.duration,1);assert.equal(oneMonth.workStart,2);assert.equal(oneMonth.workStages.length,3);
for(const item of oneMonth.workStages){assert.equal(item.start,2);assert.equal(item.duration,1);}
assert.deepEqual(copy(oneMonth.workStages[0].weights),[1]);
assert.deepEqual(copy(W.resizeDuration(original18,1).workWeights),[1]);

// All supported target durations preserve the exact aggregate interval, including gaps.
for(const n of [1,2,3,7,18,24,36,119]){
 const resized=W.resizeDuration(oldStages,n),starts=resized.workStages.map(item=>item.start),ends=resized.workStages.map(item=>item.start+item.duration);
 assert.equal(Math.min(...starts),2);assert.equal(Math.max(...ends),2+n);assert.equal(resized.duration,n);
 assert.ok(resized.workStages.every(item=>item.start<=119&&item.duration>=1&&item.start+item.duration<=121));
 for(const item of resized.workStages)if(item.curve==='custom')near(item.weights.reduce((sum,value)=>sum+value,0),1,'stage manual sums to 100%');
}
for(const invalid of [0,-1,121,18.5,'18',NaN,Infinity,null,undefined])assert.throws(()=>W.resizeDuration(original18,invalid),/prazo inteiro/);
assert.throws(()=>W.resizeDuration(original18,12,'stage:none'));
assert.throws(()=>W.resizeDuration(oldStages,12,'stage:none'));
const invalidManual=makeStages([stage('zero',0,3,{curve:'custom',weights:[0,0,0]})]),invalidBefore=JSON.stringify(invalidManual);
assert.throws(()=>W.resizeDuration(invalidManual,6),/soma.*maior que zero/i);assert.equal(JSON.stringify(invalidManual),invalidBefore);
assert.deepEqual(copy(W.resampleByMass([0,100,0],6)),[0,0,.5,.5,0,0]);
assert.deepEqual(copy(W.resampleByMass([0,100,0],1)),[1]);
assert.deepEqual(copy(W.resampleByMass([100,0],3)),[2/3,1/3,0]);

// Cost bases and user metadata remain unchanged; only timing changes nominal cost.
const protectedInput={...oldStages,deliveryRegisterJson:'{"version":1,"byStage":{"a":[{"id":"item","title":"Rede","status":"pending"}]}}',buyerPlansJson:JSON.stringify(E.buyerPlans.starter(E.defaults)),workInflation:5};
const changed=W.resizeDuration(protectedInput,36);
assert.equal(changed.deliveryRegisterJson,protectedInput.deliveryRegisterJson);assert.equal(changed.buyerPlansJson,E.prepare(protectedInput).buyerPlansJson);
assert.equal(changed.work,E.prepare(protectedInput).work);assert.equal(changed.contingency,E.prepare(protectedInput).contingency);assert.equal(changed.workInflation,5);
const base=E.simulate({...protectedInput,workInflation:0},true),scaled=E.simulate({...changed,workInflation:0},true);
near(scaled.totals.work,base.totals.work,'budget conserved without inflation');near(scaled.totals.receipts,base.totals.receipts,'buyer receipts unaffected');
const report=E.performance.performance({id:'duration-test',params:scaled.p,actuals:{}},scaled,24);
assert.ok(Math.abs(report.cycle.identityResidual)<1e-5,'funding reconciles after changed duration');
assert.ok(E.simulate(changed,true).totals.work>E.simulate(protectedInput,true).totals.work,'inflation responds to longer schedule');
console.log('PASS: duration previews; 18→36 and 24→18; strict duration validation; conservative manual resampling; staged gaps/overlaps; exact consolidated period; stage isolation; M119/M120 boundary; one-month schedule; immutable original restore; preserved budgets/metadata and reconciled funding.');
