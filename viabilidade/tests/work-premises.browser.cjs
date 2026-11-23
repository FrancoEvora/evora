/* Work assumptions and applied schedules must describe the same study.
   Run with Playwright installed and optional EVORA_TEST_URL / EVORA_PLAYWRIGHT_MODULE.
   Every mutation is confined to a new browser context with synthetic projects. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.EVORA_PLAYWRIGHT_MODULE||'playwright');
const targetURL=process.env.EVORA_TEST_URL||'http://127.0.0.1:8765/#works';
const STORE='evora.viabilidade.v1';
const moneyValue=text=>Number(text.replace(/[^\d,−-]/g,'').replace('−','-').replace(',','.'));
const near=(actual,expected,tolerance=.011)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const state=()=>page.evaluate(()=>{const s=EvoraApp.getState();return {tab:s.tab,error:s.error,params:s.params,totals:s.result?.totals,work:s.result?.rows.map(row=>row.work)};});
 const settleWorks=()=>page.locator('[data-work-curves]').waitFor({state:'visible'});
 const summary=()=>page.locator('[data-work-summary]');
 const summaryValue=field=>page.locator(`[data-work-summary-field="${field}"]`).innerText();
 const navigate=async name=>{
  await page.locator(`nav.nav [data-action="navigate"][data-page="${name}"]`).click();
  await page.waitForFunction(expected=>EvoraApp.getState().tab===expected,name);
  if(name==='inputs')await summary().waitFor({state:'visible'});
  if(name==='works'&&!(await state()).error)await settleWorks();
 };
 const editWorks=async()=>{
  await summary().locator('[data-action="navigate"][data-page="works"]').click();
  await page.waitForFunction(()=>EvoraApp.getState().tab==='works');
  if(!(await state()).error)await settleWorks();
 };
 const setParam=async(key,value)=>{
  const field=page.locator(`#main [data-param="${key}"]`);
  await field.fill(String(value));await field.press('Tab');
 };
 const apply=async model=>{
  await page.locator(`[data-wc-model="${model}"]`).click();
  await page.locator('[data-wc-action="apply"]').click();await settleWorks();
 };
 const restore=async()=>{
  await page.locator('[data-wc-action="restore"]').click();
  assert.equal(await page.locator('[data-wc-action="apply"]').textContent(),'Aplicar restauração');
  await page.locator('[data-wc-action="apply"]').click();await settleWorks();
 };
 const seed=async kind=>{
  await page.evaluate(({store,kind})=>{
   const E=EvoraEngine;
   const params=E.prepare({...E.defaults,name:'QA premissas e implantação',work:2400000,workStart:3,duration:24,curve:'s',workCurveOriginalJson:'',
    ...(kind==='stages'?{workMode:'stages',workInflation:12,workStagesJson:JSON.stringify([
     {id:'infra',name:'Infraestrutura',budget:100000,start:1,duration:4,contingency:0,curve:'early'},
     {id:'lazer',name:'Lazer e portaria',budget:100000,start:5,duration:1,contingency:100,curve:'s'}
    ])}:{workMode:'single',workStagesJson:'[]'})});
   localStorage.setItem(store,JSON.stringify({active:'qa-premises',projects:[{id:'qa-premises',params,actuals:{sales:{},work:{},plan:null},updated:'2026-11-23T00:00:00.000Z'}]}));
  },{store:STORE,kind});
  await page.reload({waitUntil:'networkidle'});
  await navigate('works');
 };
 const assertReadOnly=async()=>{
  assert.equal(await summary().locator('input,select,textarea').count(),0);
  assert.equal(await page.locator('#main .work-stage-manager').count(),0,'Premissas must not recreate stage editors');
  for(const key of ['work','contingency','workStart','duration','workInflation','curve'])
   assert.equal(await page.locator(`#main [data-param="${key}"]`).count(),0,`Premissas still exposes editable ${key}`);
 };
 try{
  await page.goto(targetURL,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.EvoraApp&&!!window.EvoraEngine);
  await seed('single');
  const original=await state();
  const originalContext=await page.locator('[data-wc-current-schedule]').innerText();
  assert.match(originalContext,/M3\b/);assert.match(originalContext,/M26\b/);assert.match(originalContext,/24 meses/);
  assert.equal(await page.locator('[data-wc-end]').getAttribute('data-wc-end'),'26');
  await page.locator('[data-wc-action="edit-period"]').click();
  assert.equal(await page.locator('#main [data-param="duration"]').evaluate(element=>element===document.activeElement),true);
  assert.deepEqual((await state()).params,original.params,'The schedule shortcut must not alter the study');
  await navigate('inputs');await assertReadOnly();
  assert.equal(await summaryValue('duration'),'24 meses');
  assert.match(await summaryValue('start'),/^M3\b/);
  assert.match(await summaryValue('end'),/^M26\b/);
  assert.equal(await summaryValue('curve'),'Curva S');
  near(moneyValue(await summaryValue('work')),2400000);
  await editWorks();assert.equal(await page.locator('#main [data-param="duration"]').isEditable(),true);
  const previewBefore=await state();
  await page.locator('[data-wc-model="early"]').click();
  await navigate('inputs');assert.equal(await summaryValue('curve'),'Curva S');
  assert.deepEqual((await state()).work,previewBefore.work,'A preview must not change the applied summary');
  await editWorks();await apply('early');
  await navigate('inputs');assert.equal(await summaryValue('curve'),'Antecipada');
  assert.equal(await summaryValue('duration'),'24 meses');assert.match(await summaryValue('end'),/^M26\b/);
  console.log('PASS one edit location: assumptions are read-only, preview stays pending, applied model is reflected.');

  await editWorks();await setParam('duration',18);await settleWorks();
  const shortenedScope=await page.locator('.wc-scope-detail').innerText();
  assert.match(shortenedScope,/M3\b/);assert.match(shortenedScope,/M20\b/);
  await navigate('inputs');assert.equal(await summaryValue('duration'),'18 meses');assert.match(await summaryValue('end'),/^M20\b/);
  await page.reload({waitUntil:'networkidle'});await summary().waitFor({state:'visible'});
  await editWorks();await restore();
  assert.deepEqual((await state()).work,original.work);
  await navigate('inputs');assert.equal(await summaryValue('duration'),'24 meses');assert.match(await summaryValue('end'),/^M26\b/);assert.equal(await summaryValue('curve'),'Curva S');
  console.log('PASS duration and original restoration: 24 → 18 months → reload → exact original schedule and summary.');

  await editWorks();await setParam('duration','');
  assert.ok((await state()).error);
  await navigate('inputs');await assertReadOnly();
  assert.equal(await summary().locator('[data-work-summary-field]').count(),0,'Invalid assumptions must not show stale derived results');
  await editWorks();await setParam('duration',24);await settleWorks();
  assert.equal((await state()).error,'');
  console.log('PASS invalid input: summary withholds stale values and retains a working path to correct the schedule.');

  await seed('stages');
  const staged=await state();
  assert.equal(staged.params.curve,'linear','Fixture exercises the technical consolidated placeholder');
  assert.equal(staged.params.workStages[0].curve,'early');
  assert.equal(await page.locator('#main [data-param="curve"]').count(),0);
  assert.match(await page.locator('[data-work-distribution-summary]').innerText(),/Consolidada a partir das etapas/);
  assert.equal(await page.locator('[data-stage-field="curve"][data-stage-index="0"]').inputValue(),'early');
  await page.locator('[data-wc-scope]').selectOption('stage:infra');
  const totalContext=await page.locator('[data-wc-current-schedule]').innerText();
  const stageScope=await page.locator('.wc-scope-detail').innerText();
  assert.match(totalContext,/M1\b/);assert.match(totalContext,/M5\b/);assert.match(totalContext,/5 meses/);
  assert.match(stageScope,/Infraestrutura/);assert.match(stageScope,/M4\b/);assert.match(stageScope,/4 meses/);
  assert.equal(await page.locator('[data-wc-end]').getAttribute('data-wc-end'),'4');
  await page.locator('[data-wc-action="edit-period"]').click();
  assert.equal(await page.locator('[data-stage-field="duration"][data-stage-index="0"]').evaluate(element=>element===document.activeElement),true);
  assert.deepEqual((await state()).params,staged.params,'Changing graph scope and following the shortcut must not modify stage dates');
  await page.locator('[data-wc-scope]').selectOption('all');
  assert.equal(await page.locator('[data-wc-end]').getAttribute('data-wc-end'),'5');
  const detail=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Cronograma detalhado',exact:true})});
  const monthly=await detail.locator('tbody tr').evaluateAll(rows=>rows.map(row=>Array.from(row.querySelectorAll('td'),cell=>cell.textContent)));
  assert.deepEqual(monthly.map(cells=>cells[0]),['M1','M2','M3','M4','M5']);
  const expected=[40000,30000,20000,10000,200000];
  monthly.forEach((cells,index)=>{
   near(moneyValue(cells[4]),expected[index]);
   near(moneyValue(cells[5]),expected[index]*Math.pow(1.12,(index+1)/12));
  });
  near(monthly.reduce((sum,cells)=>sum+moneyValue(cells[4]),0),300000);
  await navigate('inputs');await assertReadOnly();
  assert.equal(await summaryValue('curve'),'Consolidada a partir das etapas');
  assert.equal(await summaryValue('duration'),'5 meses');assert.match(await summaryValue('end'),/^M5\b/);
  assert.equal(await summaryValue('stages'),'2 etapas');
  near(moneyValue(await summaryValue('work')),200000);near(moneyValue(await summaryValue('withContingency')),300000);
  console.log('PASS stages: total vs selected-stage periods, explicit endpoint, edit shortcut, truthful curves and unequal contingencies.');

  await editWorks();await apply('linear');
  assert.ok((await state()).params.workStages.every(stage=>stage.curve==='linear'));
  await navigate('inputs');assert.equal(await summaryValue('curve'),'Consolidada a partir das etapas');
  await editWorks();await restore();assert.deepEqual((await state()).work,staged.work);
  await navigate('inputs');assert.equal(await summaryValue('duration'),'5 meses');near(moneyValue(await summaryValue('withContingency')),300000);
  await page.setViewportSize({width:390,height:844});
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(size.scroll<=size.width+1,JSON.stringify(size));
  assert.deepEqual(errors,[]);
  console.log('PASS staged apply/restore and narrow-screen summary without page errors.');
  console.log('WORK_PREMISES_BROWSER_PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exit(1);});
