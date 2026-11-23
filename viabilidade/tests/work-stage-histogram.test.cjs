/* Run: node tests/work-stage-histogram.test.cjs */
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const context={console,crypto:require('node:crypto').webcrypto};context.window=context;context.globalThis=context;vm.createContext(context);
for(const name of ['engine','sacoc-engine','buyer-plans-engine','sacoc-plan-fields','work-stages-engine','performance-core','work-curves-core','work-stage-histogram'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name+'.js'),'utf8'),context,{filename:name});
const E=context.EvoraEngine,C=E.workCurves,H=context.EvoraWorkHistogram,copy=value=>JSON.parse(JSON.stringify(value));
const near=(a,b,label)=>{assert.ok(Number.isFinite(a),label+' must be finite');assert.ok(Math.abs(a-b)<=Math.max(1e-7,Math.abs(b)*1e-12),label+': '+a+' != '+b);};
const deepFreeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);Object.values(value).forEach(deepFreeze);}return value;};
const stage=(id,start,duration,extra={})=>({id,name:'Etapa '+id,budget:1000000,start,duration,contingency:5,curve:'s',...extra});
const paramsFor=(stages,extra={})=>({...E.defaults,workMode:'stages',workStagesJson:JSON.stringify(stages),...extra});
assert.equal(typeof H.buildData,'function');assert.equal(typeof H.render,'function');assert.equal(typeof H.bind,'function');
assert.ok(Array.isArray(H.COLORS)&&H.COLORS.length>=8,'stage legend has at least eight colors');

// Compare the visualization with independently calculated engine outputs. The
// tests never reimplement the histogram's aggregation or nominal-cost formula.
function verifyResult(result,label){
 const before=JSON.stringify(result),data=H.buildData(deepFreeze(result)),start=Math.min(...result.stages.map(item=>item.start)),end=Math.max(...result.stages.map(item=>item.end));
 assert.equal(JSON.stringify(result),before,label+' does not mutate the source simulation');
 assert.equal(data.start,start);assert.equal(data.end,end);assert.equal(data.months.length,end-start+1);
 assert.equal(data.stages.length,result.stages.length);near(data.total,result.totals.work,label+' total matches the financial engine');
 const ids=Array.from(result.stages,item=>item.id);
 for(let index=0;index<data.months.length;index++){
  const row=data.months[index],month=start+index,engineRow=result.rows[month];
  assert.equal(row.month,month,label+' contiguous global months');
  near(row.total,engineRow.work,label+' monthly total M'+month);near(row.cumulative,engineRow.cumWork,label+' cumulative total M'+month);
  assert.deepEqual(Object.keys(row.byStage).sort(),ids.slice().sort(),label+' all stages represented including zeros');
  assert.deepEqual(Object.keys(row.cumulativeByStage).sort(),ids.slice().sort());
  for(const source of result.stages){
   const item=source.monthly.find(point=>point.month===month),expected=item?item.amount:0;
   assert.equal(row.byStage[source.id],expected,label+' nominal amount is not rounded, normalized or rebuilt');
   near(row.cumulativeByStage[source.id],source.monthly.filter(point=>point.month<=month).reduce((sum,point)=>sum+point.amount,0),label+' accumulated stage '+source.id);
   assert.ok(row.byStage[source.id]>=0,label+' nonnegative nominal amount');
  }
 }
 near(data.months.at(-1).cumulative,data.total,label+' last cumulative equals total');
 for(let index=0;index<result.stages.length;index++){
  const source=result.stages[index],shown=data.stages[index];
  for(const key of ['id','name','start','end'])assert.equal(shown[key],source[key],label+' metadata '+key);
  near(shown.total,source.nominalTotal,label+' stage nominal total');
  assert.equal(shown.color,H.COLORS[index%H.COLORS.length],label+' stable stage color');
  const maximum=Math.max(...source.monthly.map(point=>point.amount));
  if(maximum===0)assert.equal(shown.peak,null,label+' zero-cost stage has no positive financial peak');
  else{assert.equal(shown.peak.month,source.monthly.find(point=>point.amount===maximum).month);near(shown.peak.amount,maximum,label+' stage peak');}
 }
 const maxWork=Math.max(...result.rows.slice(start,end+1).map(row=>row.work));
 if(maxWork===0)assert.equal(data.peak,null,label+' zero total has no positive peak');
 else{assert.equal(data.peak.month,result.rows.find(row=>row.t>=start&&row.t<=end&&row.work===maxWork).t);near(data.peak.amount,maxWork,label+' total peak');}
 const html=H.render(result);
 assert.equal(typeof html,'string');assert.match(html,/data-work-histogram/);assert.ok(!/\b(?:NaN|Infinity)\b/.test(html),label+' finite rendered chart');
 assert.equal(JSON.stringify(result),before,label+' rendering leaves the source untouched');
 return {data,html};
}

const fixtures=[
 stage('infra',2,8,{name:'Infraestrutura',budget:9123456.78,contingency:3.7,curve:'s'}),
 stage('lazer',5,10,{name:'Lazer e portaria',budget:2345678.91,contingency:17.3,curve:'early'}),
 stage('final',17,3,{name:'Acabamentos',budget:987654.32,contingency:31.5,curve:'late'}),
 stage('sem-custo',2,18,{name:'Marco sem custo alocado',budget:0,contingency:95,curve:'linear'})
];
const base=paramsFor(fixtures,{workInflation:9.7});
const baseResult=E.simulate(base,true),first=verifyResult(baseResult,'unequal costs, contingencies and inflation');
assert.equal(first.data.months.length,18);
for(const month of [15,16]){
 const row=first.data.months.find(item=>item.month===month);assert.equal(row.total,0,'financial gap remains an explicit month');
 assert.ok(Object.values(row.byStage).every(amount=>amount===0));
 assert.equal(row.cumulative,first.data.months.find(item=>item.month===month-1).cumulative,'cumulative stays flat during gap');
}
assert.equal(first.data.stages.find(item=>item.id==='sem-custo').total,0,'zero base is never replaced with a nominal fallback');
assert.ok(baseResult.stages[0].monthly.some(item=>Math.abs(item.amount*100-Math.round(item.amount*100))>1e-6),'fixture contains sub-cent values to detect premature rounding');

for(const model of ['s','early','late','linear'])verifyResult(E.simulate(C.applyModel(base,model),true),'model '+model);
const manual=paramsFor([
 stage('manual-a',2,8,{budget:7800000,contingency:6,curve:'custom',weights:[0,1,0,3,4,0,2,0]}),
 stage('manual-b',5,10,{budget:1650000,contingency:22,curve:'custom',weights:[0,0,2,0,1,0,0,4,0,0]}),
 stage('manual-c',17,3,{budget:380000,contingency:12,curve:'custom',weights:[0,7,0]})
],{workInflation:11});
const manualResult=E.simulate(manual,true),manualData=verifyResult(manualResult,'manual models with zero months').data;
for(const source of manualResult.stages)for(const point of source.monthly)if(point.weight===0)assert.equal(manualData.months.find(row=>row.month===point.month).byStage[source.id],0,'manual zero remains exact');

const grown=C.resizeDuration(manual,36),grownResult=E.simulate(grown,true),grownData=verifyResult(grownResult,'18 to 36 months').data;
assert.equal(grownData.start,2);assert.equal(grownData.end,37);assert.equal(grownData.months.length,36);
assert.ok(grownData.total>manualData.total,'longer timing reflects positive inflation');
assert.equal(C.restore(grown).duration,18);verifyResult(E.simulate(C.restore(grown),true),'restored original schedule');

verifyResult(E.simulate(paramsFor([stage('one-a',7,1,{budget:90000,contingency:5}),stage('one-b',7,1,{budget:11000,contingency:22,curve:'late'})],{workInflation:0}),true),'single month');
verifyResult(E.simulate(paramsFor([stage('long',1,120,{budget:10000000,contingency:4,curve:'s'}),stage('end',119,2,{budget:300000,contingency:30,curve:'early'})],{workInflation:7.5}),true),'120 months through M120');
const flat=verifyResult(E.simulate(paramsFor([stage('flat',0,4,{budget:100,contingency:0,curve:'linear'})],{workInflation:0}),true),'equal peak months').data;
assert.equal(flat.peak.month,0,'a peak tie uses the first month');assert.equal(flat.stages[0].peak.month,0);
verifyResult(E.simulate(paramsFor(fixtures,{workInflation:-10}),true),'negative inflation');

// The current financial engine requires one positive stage budget. Derive a
// fully zero result from its real stage records to check the chart's zero case
// separately, without pretending the engine accepts an all-zero staged study.
const zeroResult=copy(baseResult);
for(const item of zeroResult.stages){item.budget=0;item.baseWithContingency=0;item.nominalTotal=0;for(const month of item.monthly)month.amount=0;}
for(const row of zeroResult.rows){row.work=0;row.cumWork=0;for(const id of Object.keys(row.stageWork||{}))row.stageWork[id]=0;}
zeroResult.totals.work=0;
const zero=verifyResult(zeroResult,'all-zero visualization');
assert.equal(zero.data.total,0);assert.equal(zero.data.peak,null);
assert.ok(zero.data.months.every(row=>row.total===0&&row.cumulative===0));
assert.ok(zero.data.stages.every(item=>item.total===0&&item.peak===null));

// Stage IDs are keys, not object prototypes; names are content, not markup.
const dangerousName='<img src=x onerror=alert(1)> " & \'Portaria\'';
const unsafeIds=paramsFor([stage('__proto__',0,3,{name:dangerousName,curve:'linear'}),stage('constructor',2,2,{name:'Rede <svg onload=alert(2)>',budget:700000,curve:'early'}),stage('all',1,1,{name:'Etapa com ID reservado',budget:12000}),stage('stage:all',3,1,{name:'Etapa com prefixo no ID',budget:9000})],{workInflation:0});
const unsafeResult=E.simulate(unsafeIds,true),unsafeData=verifyResult(unsafeResult,'escaped names and safe IDs');
assert.ok(unsafeData.html.includes('&lt;img'));assert.ok(unsafeData.html.includes('&lt;svg'));
assert.ok(!unsafeData.html.includes('<img src=x'));assert.ok(!unsafeData.html.includes('<svg onload='));
assert.ok(unsafeData.html.includes('&quot;')&&unsafeData.html.includes('&amp;'),'quoted names are escaped in HTML');
assert.ok(Object.prototype.hasOwnProperty.call(unsafeData.data.months[0].byStage,'__proto__'));
assert.ok(Object.prototype.hasOwnProperty.call(unsafeData.data.months[0].cumulativeByStage,'constructor'));
assert.match(unsafeData.html,/<option value="stage:all"/,'a stage named all does not share the All selector value');
assert.match(unsafeData.html,/<option value="stage:stage:all"/,'a prefix in the original ID remains unambiguous');
assert.ok(!/<option value="stage:all"[^>]*\bselected\b/.test(unsafeData.html),'the default All selection does not also select a stage with ID all');
assert.equal(H.buildData(baseResult).stages[0].color,first.data.stages[0].color,'rerender preserves the color mapping');
console.log('PASS: exact nominal monthly values; engine and cumulative reconciliation; unequal stage budgets/contingencies/inflation; S/early/late/linear/manual zero months; 18→36 and restoration; one/120-month horizons; zero-cost behavior; first tied peak; finite rendering; escaping and safe IDs; source immutability.');
