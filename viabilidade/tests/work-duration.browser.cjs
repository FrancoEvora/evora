/* Desired duration follows the same preview/apply/restore flow as work curves.
   Run with Playwright installed and optional EVORA_TEST_URL / EVORA_PLAYWRIGHT_MODULE.
   All mutations use isolated browser storage containing only synthetic studies. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.EVORA_PLAYWRIGHT_MODULE||'playwright');
const targetURL=process.env.EVORA_TEST_URL||'http://127.0.0.1:8765/#works';
const STORE='evora.viabilidade.v1';
const near=(actual,expected,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<=Math.max(tolerance,Math.abs(expected)*1e-10),`${actual} differs from ${expected}`);
// Loading an existing frozen plan calls E.prepare again. The legacy stage
// normalizer re-divides same-length weights by their floating-point sum.
// Permit that numerical noise only in weights; geometry and costs stay exact.
function assertStagesPreserved(actual,expected,label){
 assert.equal(actual.length,expected.length,label+' stage count');
 actual.forEach((stage,index)=>{
  const {weights,...fields}=stage,{weights:originalWeights,...originalFields}=expected[index];
  assert.deepEqual(fields,originalFields,label+' stage fields');
  assert.equal(weights.length,originalWeights.length,label+' weight count');
  weights.forEach((weight,i)=>assert.ok(Number.isFinite(weight)&&Number.isFinite(originalWeights[i])&&Math.abs(weight-originalWeights[i])<=1e-12,label+' weight '+index+':'+i));
 });
}
function assertParamsPreserved(actual,expected,label){
 const fields={...actual},originalFields={...expected};
 for(const key of ['workStages','workStagesJson']){
  assert.equal(Object.hasOwn(fields,key),Object.hasOwn(originalFields,key),label+' '+key+' presence');
  if(!Object.hasOwn(fields,key))continue;
  const parse=value=>key==='workStagesJson'?JSON.parse(value):value;
  assertStagesPreserved(parse(fields[key]),parse(originalFields[key]),label+' '+key);
  delete fields[key];delete originalFields[key];
 }
 assert.deepEqual(fields,originalFields,label+' non-weight parameters');
}
function assertActualsPreserved(actual,expected){
 const {plan,...measurements}=actual,{plan:originalPlan,...originalMeasurements}=expected;
 assert.deepEqual(measurements,originalMeasurements,'Recorded sales and physical progress remain exact');
 if(!plan||!originalPlan){assert.equal(plan,originalPlan);return;}
 const {params,...metadata}=plan,{params:originalParams,...originalMetadata}=originalPlan;
 assert.deepEqual(metadata,originalMetadata,'Frozen-plan metadata remains exact');
 assertParamsPreserved(params,originalParams,'Frozen plan');
}
const sameFinancial=(actual,expected)=>assert.ok(Number.isFinite(actual)&&Number.isFinite(expected)&&Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*1e-12,`Financial result ${actual} differs from ${expected}`);
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const state=()=>page.evaluate(()=>{const s=EvoraApp.getState();return {projectId:s.projectId,tab:s.tab,error:s.error,params:s.params,totals:s.result?.totals,work:s.result?.rows.map(row=>row.work)};});
 const stored=()=>page.evaluate(key=>localStorage.getItem(key),STORE);
 const library=async()=>JSON.parse(await stored());
 const settle=()=>page.locator('[data-work-curves]').waitFor({state:'visible'});
 const duration=()=>page.locator('[data-wc-duration]');
 const applyButton=()=>page.locator('[data-wc-action="apply"]');
 const draftDuration=async value=>{await duration().fill(String(value));};
 const updatePreview=async()=>{await page.locator('[data-wc-action="update-preview"]').click();};
 const choose=async model=>{await page.locator(`[data-wc-model="${model}"]`).click();};
 const apply=async()=>{assert.equal(await applyButton().isEnabled(),true);await applyButton().click();await settle();};
 const restore=async()=>{
  await page.locator('[data-wc-action="restore"]').click();
  assert.equal(await applyButton().textContent(),'Aplicar restauração');
  await apply();
 };
 const navigate=async tab=>{
  await page.locator(`nav.nav [data-action="navigate"][data-page="${tab}"]`).click();
  await page.waitForFunction(expected=>EvoraApp.getState().tab===expected,tab);
  if(tab==='works')await settle();
 };
 const summaryValue=field=>page.locator(`[data-work-summary-field="${field}"]`).innerText();
 const dashboardWorkPath=()=>page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Caixa disponível para obra × implantação',exact:true})}).locator('svg.chart path[stroke="#bb914a"]').getAttribute('d');
 const selectedProject=(data,id)=>data.projects.find(project=>project.id===id);
 const seed=async kind=>{
  await page.evaluate(({key,kind})=>{
   const E=EvoraEngine;
   const base={...E.defaults,name:'QA prazo pretendido '+kind,work:2400000,workMode:'single',workStagesJson:'[]',workCurveOriginalJson:'',workStart:2,duration:24,curve:'s',workWeights:[]};
   if(kind==='stages')Object.assign(base,{workMode:'stages',workStagesJson:JSON.stringify([
    {id:'infra',name:'Infraestrutura',budget:1200000,start:2,duration:12,contingency:5,curve:'custom',weights:[0,1,2,4,6,6,4,2,1,0,0,0]},
    {id:'lazer',name:'Lazer e portaria',budget:800000,start:10,duration:10,contingency:15,curve:'s',weights:[]}
   ])});
   if(kind==='manual')Object.assign(base,{duration:4,curve:'custom',workWeights:[50,0,0,50]});
   base.buyerPlansJson=JSON.stringify(E.buyerPlans.starter(base));
   base.deliveryRegisterJson=JSON.stringify({version:1,byStage:{[kind==='stages'?'infra':'single']:[{id:'delivery',title:'Entrega preservada',owner:'QA',dueMonth:10,status:'pending',completedMonth:null,criterion:'Conferir execução',notes:'Registro independente da modelagem'}]}});
   const params=E.prepare(base),id='qa-duration-'+kind;
   const actuals={sales:{0:2},work:{2:3},plan:{params:JSON.parse(JSON.stringify(params)),savedAt:'2026-11-23T00:00:00.000Z'}};
   const other=E.prepare({...E.defaults,name:'QA outro prazo',workMode:'single',workStagesJson:'[]',workCurveOriginalJson:'',workStart:0,duration:9,curve:'late',workWeights:[]});
   localStorage.setItem(key,JSON.stringify({active:id,projects:[{id,params,actuals,updated:'2026-11-23T00:00:00.000Z'},{id:'qa-duration-other',params:other,actuals:{sales:{},work:{},plan:null},updated:'2026-11-23T00:00:00.000Z'}]}));
   location.hash='works';
  },{key:STORE,kind});
  await page.reload({waitUntil:'networkidle'});await settle();
 };
 const assertProtected=async(before,id)=>{
  const saved=selectedProject(await library(),id),original=selectedProject(before,id);
  assert.equal(saved.params.buyerPlansJson,original.params.buyerPlansJson);
  assert.equal(saved.params.deliveryRegisterJson,original.params.deliveryRegisterJson);
  assertActualsPreserved(saved.actuals,original.actuals);
  if(saved.actuals.plan){
   const financial=await page.evaluate(({actual,expected})=>{
    const read=params=>{const result=EvoraEngine.simulate(params,true);return {totals:['work','peak','vpl','draw','extra','interest','fee'].map(key=>result.totals[key]),work:result.rows.map(row=>row.work)};};
    return {actual:read(actual),expected:read(expected)};
   },{actual:saved.actuals.plan.params,expected:original.actuals.plan.params});
   for(const key of ['totals','work']){
    assert.equal(financial.actual[key].length,financial.expected[key].length,'Frozen-plan financial horizon remains exact');
    financial.actual[key].forEach((value,index)=>sameFinancial(value,financial.expected[key][index]));
   }
  }
 };
 try{
  await page.goto(targetURL,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.EvoraApp&&!!window.EvoraEngine?.workCurves);

  // The requested duration belongs to the proposal until Apply is clicked.
  await seed('single');
  const single=await state(),singleLibrary=await library();
  await navigate('dashboard');const originalChart=await dashboardWorkPath();await navigate('works');
  assert.equal(await duration().inputValue(),'24');
  const beforeSinglePreview=await stored();
  await draftDuration(36);assert.equal(await applyButton().isDisabled(),true);await choose('s');
  assert.equal(await stored(),beforeSinglePreview,'Selecting a longer duration must not persist its preview');
  assert.equal((await state()).params.duration,24);
  assert.match(await page.locator('.wc-preview-status').innerText(),/M37\b/);
  assert.equal(await page.locator('[data-wc-end]').getAttribute('data-wc-end'),'25');
  assert.equal(await page.locator('[data-wc-proposed-end]').getAttribute('data-wc-proposed-end'),'37');
  await apply();
  let current=await state();assert.equal(current.params.duration,36);assert.equal(current.params.workStart,2);assert.equal(current.totals.workEnd,37);
  assert.equal(current.params.work,single.params.work);assert.equal(current.params.contingency,single.params.contingency);
  assert.notDeepEqual(current.work,single.work);
  await assertProtected(singleLibrary,single.projectId);
  const singleReference=current.params.workCurveOriginalJson;
  assert.equal(JSON.parse(singleReference).single.duration,24);
  await navigate('inputs');assert.equal(await summaryValue('duration'),'36 meses');assert.match(await summaryValue('end'),/^M37\b/);
  await navigate('dashboard');assert.notEqual(await dashboardWorkPath(),originalChart,'The executive work curve must use the applied duration');
  assert.notEqual((await state()).totals.work,single.totals.work,'Positive inflation must reflect the new payment dates');
  await navigate('works');await page.reload({waitUntil:'networkidle'});await settle();
  assert.equal(await duration().inputValue(),'36');assert.equal((await state()).params.workCurveOriginalJson,singleReference);
  console.log('PASS single duration: 24 → preview36 → apply → assumptions, executive chart and reload agree.');

  // Invalid or fractional drafts invalidate any preceding valid proposal.
  const beforeInvalid=await stored();
  await draftDuration(18);await choose('early');assert.equal(await applyButton().isEnabled(),true);
  for(const invalid of ['',0,-1,12.5,121]){
   await draftDuration(invalid);assert.equal(await applyButton().isDisabled(),true);
   await updatePreview();assert.equal(await applyButton().isDisabled(),true,`Invalid duration ${invalid} became applicable`);
   assert.equal(await stored(),beforeInvalid);assert.equal((await state()).params.duration,36);
  }
  await page.locator('[data-wc-action="restore"]').click();
  assert.equal(await duration().inputValue(),'24','Restoration must replace an invalid duration draft with the original period');
  assert.equal(await applyButton().textContent(),'Aplicar restauração');assert.equal(await stored(),beforeInvalid);
  await apply();current=await state();assert.equal(current.params.duration,24);assert.equal(current.params.curve,'s');assert.deepEqual(current.work,single.work);
  console.log('PASS invalid duration and restoration: no stale proposal, no storage mutation, exact original after reload.');

  // Resize the complete staged plan, then a single stage, preserving unrelated records.
  await seed('stages');
  const staged=await state(),stageLibrary=await library();assert.equal(staged.params.duration,18);
  const beforeAll=await stored();await draftDuration(36);await updatePreview();
  assert.equal(await stored(),beforeAll);assert.equal((await state()).params.duration,18);
  const proposedPeriods=await page.locator('[data-wc-stage-periods] tbody tr').evaluateAll(rows=>rows.map(row=>Array.from(row.querySelectorAll('td'),cell=>cell.textContent)));
  assert.deepEqual(proposedPeriods,[['Infraestrutura','M2–M13 · 12 meses','M2–M25 · 24 meses'],['Lazer e portaria','M10–M19 · 10 meses','M18–M37 · 20 meses']]);
  assert.equal(await page.locator('[data-wc-end]').getAttribute('data-wc-end'),'19');
  assert.equal(await page.locator('[data-wc-proposed-end]').getAttribute('data-wc-proposed-end'),'37');
  await apply();current=await state();
  assert.equal(current.params.workStart,2);assert.equal(current.params.duration,36);assert.equal(current.totals.workEnd,37);
  assert.deepEqual(current.params.workStages.map(stage=>[stage.id,stage.start,stage.duration]),[['infra',2,24],['lazer',18,20]]);
  for(const stage of current.params.workStages){
   const previous=staged.params.workStages.find(item=>item.id===stage.id);
   for(const field of ['id','name','budget','contingency','curve'])assert.equal(stage[field],previous[field],field+' must survive a period-only resize');
  }
  const stageReference=current.params.workCurveOriginalJson;
  assert.equal(JSON.parse(stageReference).stages.infra.duration,12);assert.equal(JSON.parse(stageReference).stages.lazer.start,10);
  await assertProtected(stageLibrary,staged.projectId);
  const beforeStage=current;
  await page.locator('[data-wc-scope]').selectOption('stage:lazer');assert.equal(await duration().inputValue(),'20');
  await draftDuration(6);await choose('late');assert.deepEqual((await state()).params,beforeStage.params);
  await apply();current=await state();
  assertStagesPreserved([current.params.workStages.find(stage=>stage.id==='infra')],[beforeStage.params.workStages.find(stage=>stage.id==='infra')],'Untargeted stage');
  const leisure=current.params.workStages.find(stage=>stage.id==='lazer');
  assert.equal(leisure.start,18);assert.equal(leisure.duration,6);assert.equal(leisure.curve,'late');
  assert.equal(current.params.duration,24);assert.equal(current.totals.workEnd,25);
  assert.equal(current.params.workCurveOriginalJson,stageReference);await assertProtected(stageLibrary,staged.projectId);
  await page.locator('[data-wc-scope]').selectOption('all');
  await page.reload({waitUntil:'networkidle'});await settle();await draftDuration('');await restore();
  current=await state();assert.equal(current.params.duration,18);assert.equal(current.totals.workEnd,19);
  assertStagesPreserved(current.params.workStages,staged.params.workStages,'Restored stages');
  assert.equal(current.work.length,staged.work.length);current.work.forEach((amount,index)=>sameFinancial(amount,staged.work[index]));
  assert.equal(current.params.workCurveOriginalJson,stageReference);await assertProtected(stageLibrary,staged.projectId);
  console.log('PASS stages: 18 → 36 months, proportional timing, one-stage resize, unchanged costs/records and exact original.');

  // Changing scope or project clears the proposal and initializes the matching duration.
  const restoredProject=selectedProject(await library(),staged.projectId);
  await draftDuration(30);await choose('early');
  await page.locator('[data-wc-scope]').selectOption('stage:infra');
  assert.equal(await duration().inputValue(),'12');assert.equal(await applyButton().isDisabled(),true);
  await draftDuration(7);await choose('s');
  await page.locator('[data-control="project"]').selectOption('qa-duration-other');await settle();
  assert.equal(await duration().inputValue(),'9');assert.equal(await applyButton().isDisabled(),true);
  assert.equal((await state()).params.curve,'late');assert.equal((await state()).params.workCurveOriginalJson,'');
  const storedProject=selectedProject(await library(),staged.projectId);
  const {params:storedParams,actuals:storedActuals,...storedMetadata}=storedProject;
  const {params:restoredParams,actuals:restoredActuals,...restoredMetadata}=restoredProject;
  assert.deepEqual(storedMetadata,restoredMetadata);
  assertParamsPreserved(storedParams,restoredParams,'Inactive project');assertActualsPreserved(storedActuals,restoredActuals);
  await page.locator('[data-control="project"]').selectOption(staged.projectId);await settle();
  assert.equal(await page.locator('[data-wc-scope]').inputValue(),'all');assert.equal(await duration().inputValue(),'18');assert.equal(await applyButton().isDisabled(),true);
  console.log('PASS scope/project isolation: duration and proposal never leak into another study or stage.');

  // Manual edits are retained; changing the period redistributes their mass visibly.
  await seed('manual');const manualOriginal=await state(),manualLibrary=await library();
  await choose('custom');assert.equal(await page.locator('[data-wc-weight]').count(),4);
  await page.locator('[data-wc-weight="0"]').fill('80');await page.locator('[data-wc-action="update-manual"]').click();
  near(Number(await page.locator('[data-wc-weight="0"]').inputValue()),80);
  const beforeManual=await stored();
  await draftDuration(8);assert.equal(await applyButton().isDisabled(),true);
  await updatePreview();
  assert.equal(await page.locator('[data-wc-weight]').count(),8,'Manual controls must match the proposed duration');
  const weights=await page.locator('[data-wc-weight]').evaluateAll(inputs=>inputs.map(input=>Number(input.value)));
  near(weights.reduce((sum,value)=>sum+value,0),100,1e-5);
  near(weights[0]+weights[1],80/130*100,1e-5);near(weights[6]+weights[7],50/130*100,1e-5);
  for(let index=2;index<=5;index++)near(weights[index],0);
  assert.match(await page.locator('[data-work-curves]').innerText(),/pesos[\s\S]*redistribuídos/i,'The UI must explain the redistribution of the edited weights');
  assert.equal(await stored(),beforeManual);assert.equal((await state()).params.duration,4);
  await draftDuration(7.5);assert.equal(await applyButton().isDisabled(),true);await updatePreview();
  assert.equal(await applyButton().isDisabled(),true);assert.equal(await stored(),beforeManual);
  await draftDuration(8);await updatePreview();await apply();current=await state();
  assert.equal(current.params.duration,8);assert.equal(current.params.workWeights.length,8);assert.equal(current.params.curve,'custom');
  const normalized=current.params.workWeights.map(value=>value/current.params.workWeights.reduce((sum,item)=>sum+item,0));
  near(normalized[0]+normalized[1],80/130);near(normalized[6]+normalized[7],50/130);
  await assertProtected(manualLibrary,manualOriginal.projectId);
  await page.reload({waitUntil:'networkidle'});await settle();await draftDuration('');await restore();
  current=await state();assert.equal(current.params.duration,4);assert.deepEqual(current.params.workWeights,manualOriginal.params.workWeights);assert.deepEqual(current.work,manualOriginal.work);
  console.log('PASS manual resize: edited weights retained, 100% mass, representable zero gaps, matching control count and original restore.');

  await page.setViewportSize({width:390,height:844});await page.reload({waitUntil:'networkidle'});await settle();
  await draftDuration(18);await choose('s');
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(size.scroll<=size.width+1,JSON.stringify(size));
  assert.equal(await page.locator('[data-work-curves]').count(),1);
  assert.deepEqual(errors,[]);
  console.log('PASS desired-duration control at width390, no inherited page overflow and no JavaScript errors.');
  console.log('WORK_DURATION_BROWSER_PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exit(1);});
