/* Browser workflow: run with Playwright installed, EVORA_TEST_URL optional.
   Uses isolated synthetic studies; does not change an existing user profile. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.EVORA_PLAYWRIGHT_MODULE||'playwright');
const targetURL=process.env.EVORA_TEST_URL||'http://127.0.0.1:8765/#works';
const STORE='evora.viabilidade.v1';
const near=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(1e-5,Math.abs(b)*1e-10),`${a} differs from ${b}`);
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const state=()=>page.evaluate(()=>{const s=EvoraApp.getState();return {projectId:s.projectId,params:s.params,totals:s.result?.totals,work:s.result?.rows.map(row=>row.work)};});
 const stored=()=>page.evaluate(key=>localStorage.getItem(key),STORE);
 const settle=()=>page.locator('[data-work-curves]').waitFor({state:'visible'});
 const choose=async model=>{await page.locator(`[data-wc-model="${model}"]`).click();};
 const apply=async()=>{await page.locator('[data-wc-action="apply"]').click();await settle();};
 const restore=async()=>{await page.locator('[data-wc-action="restore"]').click();assert.equal(await page.locator('[data-wc-action="apply"]').textContent(),'Aplicar restauração');await apply();};
 try{
  await page.goto(targetURL,{waitUntil:'networkidle'});
  await page.evaluate(()=>{location.hash='works';});
  await settle();
  const original=await state();assert.equal(await stored(),null);
  await choose('linear');assert.equal(await stored(),null);assert.equal((await state()).params.curve,original.params.curve);
  assert.ok((await page.locator('.wc-preview-status').textContent()).includes('100,00%'));
  await apply();const linear=await state();assert.equal(linear.params.curve,'linear');assert.ok(linear.params.workCurveOriginalJson);
  const reference=linear.params.workCurveOriginalJson;
  await choose('late');await apply();assert.equal((await state()).params.curve,'late');assert.equal((await state()).params.workCurveOriginalJson,reference);
  await page.reload({waitUntil:'networkidle'});await settle();assert.equal((await state()).params.workCurveOriginalJson,reference);
  const beforeRestore=await stored();await page.locator('[data-wc-action="restore"]').click();assert.equal(await stored(),beforeRestore);await apply();
  const recovered=await state();assert.equal(recovered.params.curve,original.params.curve);assert.deepEqual(recovered.work,original.work);
  console.log('PASS demo: preview is read-only; apply, second model, reload and original restoration.');

  // A manual draft cannot be applied until its edited values have been validated.
  await choose('custom');await page.locator('[data-wc-weight="0"]').fill('-2');
  assert.equal(await page.locator('[data-wc-action="apply"]').isDisabled(),true);
  await page.locator('[data-wc-action="update-manual"]').click();assert.equal(await page.locator('[data-wc-action="apply"]').isDisabled(),true);
  await page.locator('[data-wc-weight="0"]').fill('8');await page.locator('[data-wc-action="update-manual"]').click();await apply();
  assert.equal((await state()).params.curve,'custom');assert.equal((await state()).params.workCurveOriginalJson,reference);
  await restore();
  await page.locator('[data-param="duration"]').fill('6');await page.locator('[data-param="duration"]').press('Tab');await settle();
  await page.locator('[data-param="workStart"]').fill('4');await page.locator('[data-param="workStart"]').press('Tab');await settle();
  await restore();assert.equal((await state()).params.duration,original.params.duration);assert.equal((await state()).params.workStart,original.params.workStart);
  console.log('PASS manual: invalid weights blocked, edited weights apply, original start and duration restored.');

  // Move away from a preview: stale callers cannot apply it to another project.
  await page.evaluate(key=>{
   const E=EvoraEngine;
   const base={...E.defaults,name:'QA implantação por etapas',workMode:'stages',workCurveOriginalJson:'',workStagesJson:JSON.stringify([
    {id:'infra',name:'Infraestrutura',budget:12000000,start:2,duration:6,contingency:5,curve:'custom',weights:[2,4,6,8,7,3]},
    {id:'lazer',name:'Lazer e portaria',budget:7000000,start:10,duration:8,contingency:8,curve:'s'}
   ])};
   base.buyerPlansJson=JSON.stringify(E.buyerPlans.starter(base));
   base.deliveryRegisterJson=JSON.stringify({version:1,byStage:{infra:[{id:'delivery',title:'Drenagem',owner:'QA',dueMonth:7,status:'pending',completedMonth:null,criterion:'Conferência',notes:''}]}});
   const params=E.prepare(base),actuals={sales:{0:2},work:{2:3,4:5},plan:{params:JSON.parse(JSON.stringify(params)),savedAt:'2026-11-01T00:00:00.000Z'}};
   localStorage.setItem(key,JSON.stringify({active:'qa-stages',projects:[{id:'qa-stages',params,actuals,updated:'2026-11-23T00:00:00.000Z'},{id:'qa-other',params:{...E.defaults,name:'QA outro empreendimento',curve:'early'},actuals:{sales:{},work:{},plan:null},updated:'2026-11-23T00:00:00.000Z'}]}));
  },STORE);
  await page.reload({waitUntil:'networkidle'});await settle();
  const staged=await state(),stageLibrary=JSON.parse(await stored());
  await page.locator('[data-wc-scope]').selectOption('stage:lazer');await choose('late');
  assert.equal((await state()).params.workStagesJson,staged.params.workStagesJson);await apply();
  let current=await state();assert.equal(current.params.workStages.find(s=>s.id==='infra').curve,'custom');assert.equal(current.params.workStages.find(s=>s.id==='lazer').curve,'late');
  const stagesReference=current.params.workCurveOriginalJson;
  await page.locator('[data-wc-scope]').selectOption('all');await choose('linear');await apply();
  current=await state();assert.ok(current.params.workStages.every(s=>s.curve==='linear'));assert.equal(current.params.workCurveOriginalJson,stagesReference);
  for(const [index,stage] of current.params.workStages.entries())for(const field of ['id','start','duration','budget','contingency'])assert.equal(stage[field],staged.params.workStages[index][field]);
  await page.reload({waitUntil:'networkidle'});await settle();await restore();
  current=await state();for(let i=0;i<current.work.length;i++)near(current.work[i],staged.work[i]);
  assert.equal(current.params.buyerPlansJson,staged.params.buyerPlansJson);assert.equal(current.params.deliveryRegisterJson,staged.params.deliveryRegisterJson);
  assert.deepEqual(JSON.parse(await stored()).projects[0].actuals,stageLibrary.projects[0].actuals);
  console.log('PASS stages: one/all models, weighted schedule, exact original, buyer plans/deliverables/actual baseline preserved.');

  // Reordering and renaming stages never moves their stored reference to another ID.
  await page.locator('[data-stage-action="down"][data-stage-index="0"]').click();await settle();
  await page.locator('[data-wc-scope]').selectOption('stage:infra');await choose('early');await apply();
  await page.locator('[data-wc-scope]').selectOption('stage:infra');await restore();
  current=await state();assert.equal(current.params.workStages[0].id,'lazer');assert.equal(current.params.workStages.find(s=>s.id==='infra').curve,'custom');
  await page.locator('[data-wc-scope]').selectOption('all');await choose('custom');assert.equal(await page.locator('[data-wc-action="apply"]').isDisabled(),true);
  await page.locator('[data-wc-scope]').selectOption('stage:lazer');await choose('custom');await page.locator('[data-wc-weight="0"]').fill('20');await page.locator('[data-wc-action="update-manual"]').click();await apply();
  assert.equal((await state()).params.workStages.find(s=>s.id==='lazer').curve,'custom');
  console.log('PASS stage IDs: reorder restoration and manual per-stage editing.');

  await choose('s');
  const stale=await page.evaluate(()=>{const s=EvoraApp.getState();return {params:EvoraEngine.workCurves.applyModel(s.params,'s'),id:s.projectId,signature:JSON.stringify(s.params)};});
  await page.locator('[data-control="project"]').selectOption('qa-other');await settle();
  assert.equal(await page.locator('[data-wc-action="apply"]').isDisabled(),true);
  const rejected=await page.evaluate(input=>EvoraApp.commitWorkCurve(input.params,input.id,input.signature),stale);assert.equal(rejected.ok,false);
  assert.equal((await state()).params.curve,'early');assert.equal((await state()).params.workCurveOriginalJson,'');
  await page.locator('[data-stage-action="mode-stages"]').click();await settle();
  await page.locator('[data-stage-action="mode-single"]').click();await settle();await restore();
  assert.equal((await state()).params.curve,'early');
  console.log('PASS project isolation, stale preview rejection and single/stages/single restoration.');

  // Both comparison views expose accessible month values. No idle DOM loop.
  await page.locator('[data-wc-view="monthly"]').click();await page.locator('[data-wc-chart]').focus();await page.keyboard.press('Home');
  assert.ok((await page.locator('[data-wc-readout]').textContent()).includes('M1'));
  await page.locator('[data-wc-view="cumulative"]').click();
  await page.evaluate(()=>{window.__curveMutations=0;window.__curveObserver=new MutationObserver(items=>window.__curveMutations+=items.length);window.__curveObserver.observe(document.getElementById('app'),{subtree:true,childList:true});});
  await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.__curveMutations),0);await page.evaluate(()=>window.__curveObserver.disconnect());
  await page.setViewportSize({width:390,height:844});await page.reload({waitUntil:'networkidle'});await settle();
  await choose('late');
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+1,JSON.stringify(size));
  assert.equal(await page.locator('[data-work-curves]').count(),1);
  if(process.env.EVORA_SCREENSHOT_DIR){await page.locator('[data-work-curves]').screenshot({path:process.env.EVORA_SCREENSHOT_DIR+'/work-curves-mobile.png'});await page.setViewportSize({width:1440,height:1000});await page.locator('[data-work-curves]').screenshot({path:process.env.EVORA_SCREENSHOT_DIR+'/work-curves-desktop.png'});}
  assert.deepEqual(errors,[]);console.log('PASS accessible chart, zero idle mutations, mobile width390, no JavaScript errors.');
  console.log('WORK_CURVES_BROWSER_PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exit(1);});
