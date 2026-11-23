/* Run: node tests/work-curves.test.cjs */
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const chain=['engine','sacoc-engine','buyer-plans-engine','sacoc-plan-fields','work-stages-engine','performance-core'];
function load(withCurves=true){
 const context={console,crypto:require('node:crypto').webcrypto};context.window=context;context.globalThis=context;vm.createContext(context);
 for(const name of [...chain,...(withCurves?['work-curves-core']:[])])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name+'.js'),'utf8'),context,{filename:name});
 return context.EvoraEngine;
}
const E=load(),W=E.workCurves,old=load(false),copy=value=>JSON.parse(JSON.stringify(value));
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<Math.max(1e-5,Math.abs(b)*1e-11),label+': '+a+' != '+b);
const stages=[
 {id:'infra',name:'Infraestrutura',budget:14000000,start:2,duration:12,contingency:5,curve:'custom',weights:[2,4,8,12,20,25,15,8,3,1,1,1]},
 {id:'lazer',name:'Lazer',budget:8000000,start:14,duration:8,contingency:8,curve:'s'}
];
const stageParams={...E.defaults,workMode:'stages',workStagesJson:JSON.stringify(stages)};
function checkFinance(result){
 const sum=key=>result.rows.reduce((total,row)=>total+row[key],0);
 near(sum('work'),result.totals.work,'total work');
 near(sum('net'),result.totals.profit,'total operating net');
 near(sum('draw'),result.totals.draw,'draws');near(sum('repay'),result.totals.repay,'repayments');
 let priorBank=result.p.equity,priorDebt=0;
 for(const row of result.rows){
  near(row.net,row.cashForWork-row.work,'operating identity M'+row.t);
  near(row.bank,priorBank+row.net+row.draw+row.extraEquity-row.interest-row.fee-row.repay-row.distribution,'funding identity M'+row.t);
  near(row.debt,priorDebt+row.draw-row.repay,'debt identity M'+row.t);
  priorBank=row.bank;priorDebt=row.debt;
 }
 const report=E.performance.performance({id:'qa',params:result.p,actuals:{}},result,24);
 near(report.cycle.identityResidual,0,'cycle reconciliation');
}

// Loading the feature alone changes no legacy calculation and creates no reference.
for(const workMode of ['single','stages'])for(const curve of ['s','linear','early','custom']){
 const input={...stageParams,workMode,curve,workWeights:Array.from({length:24},(_,index)=>index+1)};
 const a=old.simulate(input,true),b=E.simulate(input,true);
 for(const key of ['work','vpl','peak','extra','draw','repay','interest','distribution','landVpl'])assert.equal(b.totals[key],a.totals[key],workMode+' '+curve+' legacy '+key);
 for(let index=0;index<a.rows.length;index++)for(const key of ['work','net','cumulative','bank','debt'])assert.equal(b.rows[index][key],a.rows[index][key],workMode+' '+curve+' legacy row');
 assert.equal(W.readOriginal(b.p),null);
}

for(const duration of [1,2,3,12,120])for(const model of ['s','linear','early','late']){
 const input={...E.defaults,duration,curve:'linear'},frozen=JSON.stringify(input);
 const next=W.applyModel(input,model),weights=E.simulate(next,true).workWeights;
 assert.equal(JSON.stringify(input),frozen,'preview must be pure');
 assert.equal(weights.length,duration);assert.ok(weights.every(weight=>Number.isFinite(weight)&&weight>=0));
 near(weights.reduce((a,b)=>a+b,0),1,'100 percent');
 if(duration===1)assert.equal(weights[0],1);
 if(model==='linear')for(const weight of weights)near(weight,1/duration,'linear');
 if(model==='s')for(let index=0;index<duration;index++)near(weights[index],weights[duration-1-index],'S symmetry');
 if(model==='early')for(let index=1;index<duration;index++)assert.ok(weights[index]<=weights[index-1]);
 if(model==='late')for(let index=1;index<duration;index++)assert.ok(weights[index]>=weights[index-1]);
}

const originalSingle={...E.defaults,curve:'custom',workStart:4,duration:5,workWeights:[0,10,35,50,5],deliveryRegisterJson:'{"version":1,"byStage":{"single":[]}}'};
const frozenSingle=JSON.stringify(originalSingle),preview=W.applyModel(originalSingle,'early');
assert.equal(JSON.stringify(originalSingle),frozenSingle);
assert.equal(W.hasOriginal(originalSingle),false);assert.equal(W.hasOriginal(preview),true);
const appliedAgain=W.applyModel(preview,'late');
assert.equal(appliedAgain.workCurveOriginalJson,preview.workCurveOriginalJson,'original must not be replaced by second model');
const restoredSingle=W.restore(copy(appliedAgain));
assert.equal(restoredSingle.curve,'custom');assert.equal(restoredSingle.workStart,4);assert.equal(restoredSingle.duration,5);
assert.deepEqual(copy(restoredSingle.workWeights),[0,10,35,50,5]);
assert.equal(restoredSingle.deliveryRegisterJson,originalSingle.deliveryRegisterJson);
assert.equal(restoredSingle.workCurveOriginalJson,preview.workCurveOriginalJson,'restore does not delete reference');
const changedPeriod={...appliedAgain,workStart:10,duration:18,work:33000000,contingency:20,workInflation:7};
const restoredPeriod=W.restore(changedPeriod);
assert.equal(restoredPeriod.duration,5);assert.equal(restoredPeriod.workStart,4);
assert.equal(restoredPeriod.work,33000000);assert.equal(restoredPeriod.contingency,20);assert.equal(restoredPeriod.workInflation,7);

// Stage operations use stable IDs, include the whole first reference, and preserve costs.
const originalStages=E.prepare(stageParams),oneStage=W.applyModel(originalStages,'late','stage:lazer');
assert.equal(oneStage.workStages[0].curve,'custom');assert.equal(oneStage.workStages[1].curve,'late');
const originalRef=W.readOriginal(oneStage);assert.deepEqual(Object.keys(originalRef.stages),['infra','lazer']);
const allStages=W.applyModel(oneStage,'linear');
assert.equal(allStages.workCurveOriginalJson,oneStage.workCurveOriginalJson);
assert.ok(allStages.workStages.every(stage=>stage.curve==='linear'));
for(let index=0;index<stages.length;index++)for(const key of ['id','budget','contingency','start','duration'])assert.equal(allStages.workStages[index][key],stages[index][key]);
const reordered={...allStages,workStagesJson:JSON.stringify([
 {...allStages.workStages[1],name:'Lazer atualizado',budget:9000000,start:20,duration:5},
 {...allStages.workStages[0],start:0,duration:20},
 {id:'new',name:'Etapa nova',budget:1000000,start:25,duration:3,contingency:2,curve:'early'}
])};
const onlyLazer=W.restore(reordered,'stage:lazer');
assert.equal(onlyLazer.workStages[0].curve,'s');assert.equal(onlyLazer.workStages[0].start,14);assert.equal(onlyLazer.workStages[0].duration,8);
assert.equal(onlyLazer.workStages[0].name,'Lazer atualizado');assert.equal(onlyLazer.workStages[0].budget,9000000);
assert.equal(onlyLazer.workStages[1].curve,'linear');assert.equal(onlyLazer.workStages[1].duration,20);
const restoredStages=W.restore(copy(reordered));
assert.deepEqual(restoredStages.workStages.map(stage=>stage.id).join(','),'lazer,infra,new');
assert.equal(restoredStages.workStages[1].curve,'custom');assert.equal(restoredStages.workStages[1].start,2);assert.equal(restoredStages.workStages[1].duration,12);
for(let index=0;index<12;index++)near(restoredStages.workStages[1].weights[index],originalStages.workStages[0].weights[index],'original stage weight');
assert.equal(restoredStages.workStages[2].curve,'early');assert.equal(restoredStages.workStages[2].duration,3);
assert.equal(W.hasOriginal(restoredStages,'stage:new'),false);
const addedReference=W.applyModel(restoredStages,'late','stage:new'),extendedRef=W.readOriginal(addedReference);
assert.equal(extendedRef.savedAt,originalRef.savedAt);assert.equal(extendedRef.stages.new.curve,'early');
assert.deepEqual(copy(extendedRef.stages.infra),copy(originalRef.stages.infra));
assert.equal(W.restore(addedReference,'stage:new').workStages.find(stage=>stage.id==='new').curve,'early');

// Both modes can be modeled separately without replacing each other's reference.
const singleFromStages=W.applyModel({...oneStage,workMode:'single'},'early');
assert.ok(W.readOriginal(singleFromStages).single);
assert.deepEqual(copy(W.readOriginal(singleFromStages).stages),copy(originalRef.stages));
const backToStages=W.restore({...singleFromStages,workMode:'stages'});
assert.equal(backToStages.workMode,'stages');assert.equal(backToStages.workStages[1].curve,'s');

// Financial projection uses selected weights; inflation changes nominal timing only.
for(const input of [originalSingle,stageParams])for(const model of ['linear','s','early','late']){
 const next=W.applyModel(input,model),result=E.simulate(next,true);checkFinance(result);
 const zeroInflation=E.simulate({...next,workInflation:0},true);
 const expected=next.workMode==='stages'?next.workStages.reduce((sum,stage)=>sum+stage.budget*(1+stage.contingency/100),0):next.work*(1+next.contingency/100);
 near(zeroInflation.totals.work,expected,'budget and contingency conserved');
 assert.equal(result.p.workCurveOriginalJson,next.workCurveOriginalJson,'reference survives simulation');
 if(next.workMode==='stages')for(const row of result.rows)near(Object.values(row.stageWork).reduce((sum,value)=>sum+value,0),row.work,'stage sum');
}
const early=E.simulate(W.applyModel(originalSingle,'early'),true),late=E.simulate(W.applyModel(originalSingle,'late'),true);
assert.ok(early.totals.work<late.totals.work,'positive inflation reflects timing');
assert.ok(early.workWeights[0]>late.workWeights[0]);
const weighted=E.prepare({...stageParams,workStagesJson:JSON.stringify([{id:'a',name:'A',budget:900,start:0,duration:2,contingency:0,curve:'early'},{id:'b',name:'B',budget:100,start:1,duration:2,contingency:0,curve:'late'}])});
const aggregate=W.weightsFor(weighted);near(aggregate[0],.6,'weighted consolidated month 0');near(aggregate[1],1/3,'weighted consolidated month 1');near(aggregate[2],1/15,'weighted consolidated month 2');

// Metadata, buyer plans, deliverables, and actuals remain isolated from curve operations.
const buyerConfig=E.buyerPlans.starter({...E.defaults,system:'SACOC',sacocAnnualRate:6,sacocFrequency:12});
const protectedInput={...stageParams,system:'SACOC',sacocAnnualRate:6,sacocFrequency:12,buyerPlansJson:JSON.stringify(buyerConfig),deliveryRegisterJson:'{"version":1,"byStage":{"lazer":[{"id":"pool","title":"Piscina","status":"pending"}]}}'};
const project={id:'study-a',params:protectedInput,actuals:{sales:{0:4},work:{1:2},plan:{params:copy(protectedInput),savedAt:'2026-11-01'}}};
const before=JSON.stringify(project),changed=W.applyModel(project.params,'early'),recovered=W.restore(copy(changed));
assert.equal(JSON.stringify(project),before);assert.equal(recovered.buyerPlansJson,changed.buyerPlansJson);assert.equal(recovered.deliveryRegisterJson,protectedInput.deliveryRegisterJson);checkFinance(E.simulate(recovered,true));
assert.equal(W.readOriginal({...E.defaults,name:'Another project'}),null);

for(const invalid of [[],[1],[-1,0,1,2,3],[NaN,1,1,1,1],[Infinity,1,1,1,1],['1',2,3,4,5],[0,0,0,0,0]])assert.throws(()=>W.applyModel(originalSingle,'custom','all',invalid));
assert.throws(()=>W.applyModel(stageParams,'custom','all',Array(12).fill(1)),/selecione uma etapa/);
assert.throws(()=>W.applyModel(stageParams,'linear','stage:missing'));
assert.throws(()=>W.applyModel(originalSingle,'unknown'));
assert.throws(()=>W.restore(originalSingle));
assert.throws(()=>W.capture({...originalSingle,workCurveOriginalJson:'broken'}));
const manual=W.applyModel(originalSingle,'custom','all',[1,2,3,4,5]);assert.deepEqual(copy(manual.workWeights),[1,2,3,4,5]);
assert.deepEqual(copy(W.restore(manual).workWeights),[0,10,35,50,5]);
assert.equal(W.scopes(stageParams)[1].id,'stage:infra');assert.equal(W.scopes(originalSingle).length,1);
assert.deepEqual(copy(W.modelWeights('late',3)),[1/6,2/6,3/6]);
assert.deepEqual(copy(W.weightsFor('late',3)),copy(W.modelWeights('late',3)));
assert.deepEqual(copy(W.currentWeights(weighted)),copy(W.weightsFor(weighted)));
assert.throws(()=>W.modelWeights('custom',12));assert.throws(()=>W.modelWeights('linear',0));
// Legacy stage normalization accepts all-zero manual weights. Never replace this
// invalid original with a model that would leave the user unable to restore it.
const zeroStage={id:'zero',name:'Terraplenagem sem pesos',budget:1000000,start:0,duration:3,contingency:0,curve:'custom',weights:[0,0,0]};
const zeroInput={...E.defaults,workMode:'stages',workStagesJson:JSON.stringify([zeroStage])},zeroBefore=JSON.stringify(zeroInput);
assert.doesNotThrow(()=>E.prepare(zeroInput),'legacy acceptance is retained');
for(const operation of [()=>W.capture(zeroInput),()=>W.applyModel(zeroInput,'linear')])assert.throws(operation,error=>/Terraplenagem sem pesos/.test(error.message)&&/soma.*maior que zero/i.test(error.message));
assert.equal(JSON.stringify(zeroInput),zeroBefore,'failed capture/apply changes no input or backup');
const existingBackup={...oneStage,workStagesJson:JSON.stringify([...oneStage.workStages,zeroStage])},backupBefore=JSON.stringify(existingBackup);
assert.throws(()=>W.applyModel(existingBackup,'linear'),/Terraplenagem sem pesos/);
assert.equal(JSON.stringify(existingBackup),backupBefore,'an existing valid reference survives failure unchanged');
console.log('PASS: legacy parity; pure previews; 100% nonnegative models; immutable per-project/per-stage original; exact manual restore; period restoration; ID reorder/new-stage safety; financial timing and funding reconciliation; buyer/actual/deliverable isolation; strict manual validation.');
