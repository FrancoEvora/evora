/* Applied stage timing, monthly intensity and the financial histogram must agree.
   Run with Playwright installed and optional EVORA_TEST_URL / EVORA_PLAYWRIGHT_MODULE.
   All mutations are confined to a new browser context with synthetic projects. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.EVORA_PLAYWRIGHT_MODULE||'playwright');
const targetURL=process.env.EVORA_TEST_URL||'http://127.0.0.1:8765/#works';
const STORE='evora.viabilidade.v1';
const near=(actual,expected,label='amount')=>assert.ok(Number.isFinite(actual)&&Number.isFinite(expected)&&Math.abs(actual-expected)<=Math.max(1e-7,Math.abs(expected)*1e-12),`${label}: ${actual} differs from ${expected}`);
const displayedMoney=text=>Number(String(text).replace(/[^\d,−-]/g,'').replace('−','-').replace(',','.'));
const monthsBetween=(start,end)=>Array.from({length:end-start+1},(_,index)=>start+index);
const periods=stages=>stages.map(stage=>({id:stage.id,start:stage.start,end:stage.end,duration:stage.duration}));

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const state=()=>page.evaluate(()=>{
  const s=EvoraApp.getState(),r=s.result;
  return {projectId:s.projectId,error:s.error,params:s.params,totals:r?.totals,stages:r?.stages,rows:r?.rows.map(row=>({month:row.t,amount:row.work}))};
 });
 const stored=()=>page.evaluate(key=>localStorage.getItem(key),STORE);
 const histogram=()=>page.locator('[data-work-histogram]');
 const filter=()=>page.locator('[data-wh-stage]');
 const settle=async()=>{
  await histogram().waitFor({state:'visible'});
  await page.waitForFunction(()=>{
   const s=EvoraApp.getState(),rows=Array.from(document.querySelectorAll('[data-wh-row]'));
   if(!s.result?.stages?.length||rows.length!==s.params.duration)return false;
   return Number(rows[0]?.dataset.month)===s.params.workStart&&Number(rows.at(-1)?.dataset.month)===s.result.totals.workEnd&&s.result.stages.every(stage=>{
    const row=Array.from(document.querySelectorAll('.stage-timeline-row[data-stage-id]')).find(item=>item.dataset.stageId===stage.id);
    return row?.querySelectorAll('.stage-intensity-cell').length===stage.duration;
   });
  });
 };
 const chooseFilter=async id=>{await filter().selectOption(id==='all'?'all':'stage:'+id);await settle();};
 const snapshot=()=>page.evaluate(()=>{
  const section=document.querySelector('[data-work-histogram]');
  const number=(element,key)=>{const value=element?.getAttribute('data-'+key);return value===null||value===undefined?null:Number(value);};
  const monthly=selector=>Array.from(section.querySelectorAll(selector),element=>({month:number(element,'month'),amount:number(element,'amount'),cumulative:number(element,'cumulative'),amountText:element.querySelector('[data-wh-value="amount"]')?.textContent??null,cumulativeText:element.querySelector('[data-wh-value="cumulative"]')?.textContent??null}));
  return {
   filter:section.querySelector('[data-wh-stage]').value,
   rows:monthly('[data-wh-row]'),hits:monthly('[data-wh-month]'),
   bars:Array.from(section.querySelectorAll('[data-wh-bar]'),element=>({stageId:element.getAttribute('data-stage-id'),month:number(element,'month'),amount:number(element,'amount'),height:Number(element.getAttribute('height'))})),
   total:number(section.querySelector('[data-wh-total]'),'amount'),
   peak:{month:section.querySelector('[data-wh-peak]').getAttribute('data-month'),amount:number(section.querySelector('[data-wh-peak]'),'amount')},
   tracks:Array.from(document.querySelectorAll('.stage-timeline-row[data-stage-id]'),row=>({
    id:row.dataset.stageId,name:Array.from(row.querySelector('strong').childNodes).filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join(''),
    cells:Array.from(row.querySelectorAll('.stage-intensity-cell'),element=>({
     month:number(element,'month'),weight:number(element,'weight'),amount:number(element,'amount'),
     title:element.getAttribute('title'),label:element.getAttribute('aria-label'),
     opacity:getComputedStyle(element).opacity,background:getComputedStyle(element).backgroundColor
    }))
   }))
  };
 });
 const reconcile=async(selected='all')=>{
  const applied=await state(),dom=await snapshot();
  assert.equal(applied.error,'');assert.equal(dom.filter,selected==='all'?'all':'stage:'+selected);
  assert.equal(await histogram().count(),1,'Only one applied histogram may be mounted');
  const months=monthsBetween(applied.params.workStart,applied.totals.workEnd),stage=applied.stages.find(item=>item.id===selected);
  assert.deepEqual(dom.rows.map(row=>row.month),months,'Table includes every month, including gaps and its final month');
  assert.deepEqual(dom.hits.map(hit=>hit.month),months,'Chart includes every month, including gaps and its final month');
  let cumulative=0,peak=null;
  for(const [index,month] of months.entries()){
   const expected=selected==='all'?applied.rows.find(row=>row.month===month).amount:stage.monthly.find(row=>row.month===month)?.amount||0;
   cumulative+=expected;
   if(expected>0&&(!peak||expected>peak.amount))peak={month,amount:expected};
   near(dom.rows[index].amount,expected,'Table M'+month);
   near(dom.rows[index].cumulative,cumulative,'Table cumulative M'+month);
   assert.ok(dom.rows[index].amountText?.includes('R$')&&Math.abs(displayedMoney(dom.rows[index].amountText)-expected)<=.011,'Visible table money M'+month);
   assert.ok(dom.rows[index].cumulativeText?.includes('R$')&&Math.abs(displayedMoney(dom.rows[index].cumulativeText)-cumulative)<=.011,'Visible cumulative money M'+month);
   near(dom.hits[index].amount,expected,'Chart hit M'+month);
   near(dom.bars.filter(bar=>bar.month===month).reduce((sum,bar)=>sum+bar.amount,0),expected,'Stacked bars M'+month);
  }
  near(dom.total,cumulative,'Displayed selected total');
  assert.equal(dom.peak.month,peak?String(peak.month):'','A zero-cost selection has no invented peak month');
  near(dom.peak.amount,peak?.amount||0,'Displayed selected peak');
  dom.bars.forEach(bar=>{
   assert.ok(Number.isFinite(bar.amount)&&bar.amount>=0&&Number.isFinite(bar.height)&&bar.height>=0,'Bars must have finite nonnegative geometry');
   assert.ok(months.includes(bar.month),'No bar may lie outside the applied range');
   if(selected!=='all')assert.equal(bar.stageId,selected,'The filter must not retain another stage in the stack');
   const source=applied.stages.find(item=>item.id===bar.stageId);
   assert.ok(source,'Each stacked segment belongs to an applied stage');
   near(bar.amount,source.monthly.find(row=>row.month===bar.month)?.amount||0,'Segment '+bar.stageId+' M'+bar.month);
  });
  assert.deepEqual(dom.tracks.map(track=>track.id),applied.stages.map(item=>item.id));
  for(const calculated of applied.stages){
   const track=dom.tracks.find(item=>item.id===calculated.id);
   assert.equal(track.name,calculated.name,'Stage names must remain literal text');
   assert.deepEqual(track.cells.map(cell=>cell.month),calculated.monthly.map(row=>row.month));
   for(const [index,cell] of track.cells.entries()){
    const expected=calculated.monthly[index];
    near(cell.weight,expected.weight,'Stage physical weight '+calculated.id+' M'+cell.month);
    near(cell.amount,expected.amount,'Stage payment '+calculated.id+' M'+cell.month);
    assert.ok(cell.title?.includes('M'+cell.month)&&cell.title.includes('R$'),'Monthly hover text includes time and nominal cost');
    assert.ok(cell.label?.includes('M'+cell.month)&&cell.label.includes('R$'),'Monthly accessible text includes time and nominal cost');
   }
  }
  return {applied,dom};
 };
 const seed=async kind=>{
  await page.evaluate(({key,kind})=>{
   const E=EvoraEngine;
   let stages=[
    {id:'infra',name:'Infra <b data-qa-injected>obra</b> & "rede"',budget:1200000,start:2,duration:6,contingency:5,curve:'custom',weights:[1,0,3,2,0,4]},
    {id:'rede',name:'Rede de água',budget:600000,start:5,duration:3,contingency:0,curve:'s',weights:[]},
    {id:'lazer',name:'Lazer e portaria',budget:800000,start:12,duration:8,contingency:15,curve:'early',weights:[]},
    {id:'zero',name:'Etapa sem orçamento',budget:0,start:8,duration:1,contingency:30,curve:'linear',weights:[]}
   ];
   if(kind==='one')stages=[{id:'one',name:'Entrega única',budget:120000,start:7,duration:1,contingency:5,curve:'s',weights:[]}];
   if(kind==='long')stages=[{id:'long',name:'Implantação em 120 meses',budget:1200000,start:1,duration:120,contingency:5,curve:'linear',weights:[]}];
   const params=E.prepare({...E.defaults,name:'QA histograma '+kind,work:2400000,workMode:kind==='single'?'single':'stages',workStagesJson:kind==='single'?'[]':JSON.stringify(stages),workCurveOriginalJson:'',workInflation:12});
   const other=E.prepare({...E.defaults,name:'QA outro histograma',workMode:'stages',workStagesJson:JSON.stringify([{id:'other',name:'Outro cronograma',budget:500000,start:0,duration:3,contingency:0,curve:'late',weights:[]}]),workCurveOriginalJson:'',workInflation:0});
   const project=(id,params)=>({id,params,actuals:{sales:{},work:{},plan:null},updated:'2026-11-23T00:00:00.000Z'});
   localStorage.setItem(key,JSON.stringify({active:'qa-histogram-'+kind,projects:[project('qa-histogram-'+kind,params),project('qa-histogram-other',other)]}));
   location.hash='works';
  },{key:STORE,kind});
  await page.reload({waitUntil:'networkidle'});
  if(kind==='single')await page.locator('[data-stage-action="mode-stages"]').waitFor({state:'visible'});
  else await settle();
 };
 const apply=async()=>{
  const button=page.locator('[data-wc-action="apply"]');assert.equal(await button.isEnabled(),true);await button.click();await settle();
 };
 const readout=async locator=>locator.evaluate(element=>({month:Number(element.dataset.month),amount:Number(element.dataset.amount),weight:element.dataset.weight===undefined?null:Number(element.dataset.weight),cumulative:element.dataset.cumulative===undefined?null:Number(element.dataset.cumulative)}));
 const noPageOverflow=async()=>{
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(size.scroll<=size.width+1,'Horizontal page overflow: '+JSON.stringify(size));
 };
 try{
  await page.goto(targetURL,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.EvoraApp&&!!window.EvoraWorkHistogram&&!!window.EvoraEngine?.workCurves);

  // Exercise the actual mode buttons: single-mode result.p need not contain a derived workStages array.
  await seed('single');
  const single=await state();assert.equal(single.params.workMode,'single');assert.equal(single.params.workStagesJson,'[]');
  assert.equal(await histogram().count(),0);
  await page.locator('[data-stage-action="mode-stages"]').click();await settle();
  const enabled=await reconcile();
  assert.equal(enabled.applied.params.workMode,'stages');assert.equal(enabled.applied.stages.length,1);
  assert.equal(enabled.applied.stages[0].budget,single.params.work);
  assert.equal(enabled.applied.stages[0].start,single.params.workStart);
  assert.equal(enabled.applied.stages[0].duration,single.params.duration);
  await page.locator('[data-stage-action="preset"]').click();await settle();
  const preset=await reconcile();
  assert.equal(preset.applied.stages.length,3);assert.equal(preset.applied.params.work,single.params.work);
  near(preset.applied.stages.reduce((sum,stage)=>sum+stage.budget,0),single.params.work,'Three-stage base budget');
  const savedStages=preset.applied.params.workStagesJson;
  await page.locator('[data-stage-action="mode-single"]').click();
  await page.waitForFunction(()=>EvoraApp.getState().params.workMode==='single');
  await page.locator('[data-stage-action="mode-stages"]').waitFor({state:'visible'});
  await histogram().waitFor({state:'detached'});
  assert.equal((await state()).params.work,single.params.work);
  assert.equal((await state()).params.workStagesJson,savedStages,'Disabling stage mode must retain its saved stages');
  await page.locator('[data-stage-action="mode-stages"]').click();await settle();
  const reenabled=await reconcile();
  assert.equal(reenabled.applied.params.work,single.params.work);
  assert.equal(reenabled.applied.params.workStagesJson,savedStages);
  assert.deepEqual(reenabled.applied.stages,preset.applied.stages,'Re-enabling stages preserves their periods, budgets, curves and monthly schedule');
  assert.deepEqual(errors,[]);
  console.log('PASS real mode controls: single → staged → three-stage preset → single → staged, with preserved budget and stages.');

  await seed('normal');
  const initial=await reconcile(),original=initial.applied,initialStorage=await stored();
  assert.equal(original.params.duration,18);assert.equal(original.totals.workEnd,19);
  for(const month of [9,10,11])near(initial.dom.rows.find(row=>row.month===month).amount,0,'Global gap M'+month);
  const manual=initial.dom.tracks.find(track=>track.id==='infra');
  for(const month of [3,6])near(manual.cells.find(cell=>cell.month===month).weight,0,'Manual zero M'+month);
  assert.notEqual(manual.cells[0].opacity,manual.cells[5].opacity,'Different physical weights must produce different visible intensity');
  const zero=manual.cells.find(cell=>cell.month===3);
  assert.ok(Number(zero.opacity)===0||zero.background==='rgba(0, 0, 0, 0)'||zero.background==='transparent','A zero physical weight must not have colored intensity');
  assert.equal(await page.locator('[data-qa-injected]').count(),0,'Stage names must not inject HTML into the chart, table or Gantt');
  const placement=await histogram().evaluate(section=>{
   const panel=Array.from(document.querySelectorAll('section.panel')).find(item=>item.querySelector('h2')?.textContent.trim()==='Cronograma consolidado por etapas');
   return !!panel&&(panel.contains(section)||!!(panel.compareDocumentPosition(section)&Node.DOCUMENT_POSITION_FOLLOWING));
  });
  assert.equal(placement,true,'The monthly histogram must follow the consolidated stage schedule');
  console.log('PASS monthly reconciliation: stage segments, contingency/inflation, manual zeros, global gaps, escaped names and placement.');

  // Filtering changes only the view, keeping the shared month axis and the applied study.
  for(const id of ['infra','lazer','zero','all']){
   await chooseFilter(id);await reconcile(id);assert.equal(await stored(),initialStorage,'Histogram filtering must not persist project data');
   assert.deepEqual((await state()).params,original.params,'Histogram filtering must not mutate the model');
  }
  await chooseFilter('zero');
  assert.match(await page.locator('[data-wh-peak]').innerText(),/sem desembolso/i);
  assert.equal(/NaN|Infinity/.test(await histogram().innerText()),false);
  await chooseFilter('all');
  console.log('PASS filters: independent stage totals, stable axis, zero-cost selection without NaN or a false peak, no state mutation.');

  // Both charts expose the same exact monthly values by pointer and keyboard.
  await page.locator('[data-wh-month][data-month="12"]').hover();
  let shown=await readout(page.locator('[data-wh-readout]'));
  assert.equal(shown.month,12);near(shown.amount,original.rows.find(row=>row.month===12).amount);
  const chart=page.locator('[data-wh-chart]');await chart.focus();await chart.press('End');
  shown=await readout(page.locator('[data-wh-readout]'));assert.equal(shown.month,19);
  await chart.press('Home');shown=await readout(page.locator('[data-wh-readout]'));assert.equal(shown.month,2);
  await chart.press('ArrowRight');shown=await readout(page.locator('[data-wh-readout]'));assert.equal(shown.month,3);
  near(shown.amount,original.rows.find(row=>row.month===3).amount);
  const track=page.locator('.stage-timeline-row[data-stage-id="infra"]'),trackControl=track.locator('[data-stage-track]');
  await track.locator('.stage-intensity-cell[data-month="5"]').hover();
  shown=await readout(track.locator('[data-stage-readout]'));assert.equal(shown.month,5);
  near(shown.weight,original.stages.find(stage=>stage.id==='infra').monthly.find(row=>row.month===5).weight);
  await trackControl.focus();await trackControl.press('End');
  shown=await readout(track.locator('[data-stage-readout]'));assert.equal(shown.month,7);
  await trackControl.press('Home');shown=await readout(track.locator('[data-stage-readout]'));assert.equal(shown.month,2);
  await trackControl.press('ArrowRight');shown=await readout(track.locator('[data-stage-readout]'));assert.equal(shown.month,3);near(shown.amount,0);near(shown.weight,0);
  assert.equal(await stored(),initialStorage,'Pointer and keyboard inspection must not persist project data');
  console.log('PASS interaction: hover, arrows and endpoints reveal actual monthly values without modifying the study.');

  // A model proposal is separate from the applied schedule and its two visualizations.
  const beforePreview=await snapshot();
  await page.locator('[data-wc-scope]').selectOption('stage:infra');await page.locator('[data-wc-model="early"]').click();
  assert.deepEqual(await snapshot(),beforePreview,'A curve preview must leave the applied histogram and Gantt unchanged');
  assert.equal(await stored(),initialStorage);assert.deepEqual((await state()).params,original.params);
  await apply();await chooseFilter('all');const modeled=await reconcile();
  assert.deepEqual(periods(modeled.applied.stages),periods(original.stages),'Changing intensity alone preserves stage timing');
  assert.notDeepEqual(modeled.dom.rows,initial.dom.rows,'Applying a different curve must change monthly payments');
  assert.notDeepEqual(modeled.dom.tracks.find(row=>row.id==='infra').cells,manual.cells,'Applying a different curve must refresh monthly intensity');
  const originalReference=modeled.applied.params.workCurveOriginalJson;assert.ok(originalReference);
  await page.locator('[data-wc-scope]').selectOption('all');
  const beforeResize=await snapshot(),beforeResizeStorage=await stored();
  await page.locator('[data-wc-duration]').fill('36');await page.locator('[data-wc-action="update-preview"]').click();
  assert.deepEqual(await snapshot(),beforeResize,'A duration preview must leave the applied final month unchanged');
  assert.equal(await stored(),beforeResizeStorage);
  await apply();await chooseFilter('all');const resized=await reconcile();
  assert.equal(resized.applied.params.duration,36);assert.equal(resized.applied.totals.workEnd,37);
  assert.equal(resized.dom.rows.length,36);assert.equal(resized.dom.rows.at(-1).month,37);
  assert.equal(resized.applied.params.workCurveOriginalJson,originalReference);
  await page.reload({waitUntil:'networkidle'});await settle();const reloaded=await reconcile();
  assert.equal(reloaded.applied.params.duration,36);assert.equal(reloaded.dom.rows.at(-1).month,37);
  await page.locator('[data-wc-action="restore"]').click();await apply();await chooseFilter('all');const restored=await reconcile();
  assert.deepEqual(periods(restored.applied.stages),periods(original.stages));
  assert.equal(restored.applied.params.duration,18);assert.equal(restored.dom.rows.at(-1).month,19);
  for(const stage of restored.applied.stages){
   const expected=original.stages.find(item=>item.id===stage.id);
   for(const field of ['id','name','start','duration','budget','contingency','curve'])assert.equal(stage[field],expected[field],'Restored '+field);
   stage.monthly.forEach((row,index)=>{near(row.weight,expected.monthly[index].weight,'Restored physical weight');near(row.amount,expected.monthly[index].amount,'Restored payment');});
  }
  assert.equal(restored.applied.params.workCurveOriginalJson,originalReference);
  console.log('PASS applied-state synchronization: preview isolation, changed intensity, 18 → 36 months, reload and complete original restoration.');

  // A stage filter cannot leak into another study, and both views fit narrow screens.
  await chooseFilter('infra');const protectedProject=(JSON.parse(await stored())).projects.find(project=>project.id===original.projectId);
  await page.locator('[data-control="project"]').selectOption('qa-histogram-other');await settle();
  const other=await reconcile();assert.equal(other.applied.projectId,'qa-histogram-other');assert.equal(other.dom.rows.length,3);
  assert.deepEqual(other.dom.tracks.map(row=>row.id),['other']);
  assert.deepEqual((JSON.parse(await stored())).projects.find(project=>project.id===original.projectId),protectedProject,'Switching projects must preserve the prior study');
  await page.locator('[data-control="project"]').selectOption(original.projectId);await settle();await reconcile();
  await page.setViewportSize({width:390,height:844});await noPageOverflow();await chooseFilter('infra');await reconcile('infra');await noPageOverflow();
  console.log('PASS project isolation and width390: no stale stage filter, data leakage or page overflow.');

  // Edge ranges include their final month; the long timeline scrolls within its panel.
  await seed('one');const one=await reconcile();
  assert.equal(one.dom.rows.length,1);assert.equal(one.dom.rows[0].month,7);assert.equal(one.dom.tracks[0].cells.length,1);
  await noPageOverflow();
  await seed('long');const long=await reconcile();
  assert.equal(long.dom.rows.length,120);assert.equal(long.dom.rows.at(-1).month,120);
  assert.equal(long.dom.tracks[0].cells.length,120);assert.equal(long.dom.tracks[0].cells.at(-1).month,120);
  await noPageOverflow();
  const longChart=page.locator('[data-wh-chart]');await longChart.focus();await longChart.press('End');
  assert.equal((await readout(page.locator('[data-wh-readout]'))).month,120);
  const longTrack=page.locator('.stage-timeline-row[data-stage-id="long"] [data-stage-track]');await longTrack.focus();await longTrack.press('End');
  assert.equal((await readout(page.locator('.stage-timeline-row[data-stage-id="long"] [data-stage-readout]'))).month,120);
  assert.deepEqual(errors,[]);
  console.log('PASS range limits: one month, all 120 months through M120, keyboard endpoints and no JavaScript errors.');
  console.log('WORK_STAGE_HISTOGRAM_BROWSER_PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exit(1);});
