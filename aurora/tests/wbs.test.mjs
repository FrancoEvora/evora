import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {wbsMetrics,packageProgress,scopeDefinition,baselineChanges,dictionaryCsv} from '../shared/wbs.mjs';
const models=JSON.parse(readFileSync(new URL('../shared/wbs-templates.json',import.meta.url)));
test('Reference EAP covers 109 original packages, 218 specific deliveries and a valid dependency DAG',()=>{
 let total=0,deliveries=0;
 for(const [module,model] of Object.entries(models)){
  const packages=model.groups.flatMap(g=>g.packages),map=new Map(packages.map(p=>[p.code,p]));
  assert.equal(packages.length,module==='structuring'?47:62);assert.equal(map.size,packages.length);
  const done=new Set(),active=new Set();
  function visit(code){assert.ok(map.has(code),`Unknown predecessor ${code}`);assert.ok(!active.has(code),`Cycle at ${code}`);if(done.has(code))return;active.add(code);for(const id of map.get(code).dependencies)visit(id);active.delete(code);done.add(code);}
  for(const g of model.groups){assert.ok(g.owner&&g.accountable&&g.inputs&&g.exclusions&&g.risks);for(const p of g.packages){assert.ok(p.code.startsWith(g.code+'.'));assert.ok(p.acceptance.length>30);assert.ok(p.deliverables.every(d=>d.title.length>5&&d.criterion.length>20&&d.required&&!d.checked&&!d.evidence));visit(p.code);deliveries+=p.deliverables.length;}}
  total+=packages.length;
 }
 assert.equal(total,109);assert.equal(deliveries,218);
});
const item={id:'p1',wbs_code:'2.01.01',weight:2,scope_status:'included',status:'doing',deliverables:[{id:'d1',title:'Entrega',criterion:'Critério',required:true,checked:true,evidence:'Versão 1'},{id:'d2',title:'Entrega 2',criterion:'Critério 2',required:true,checked:false,evidence:''},{id:'d3',title:'Extra',criterion:'Complementar',required:false,checked:false,evidence:''}]};
test('Progress uses required deliverables and package weights; exclusions never inflate progress',()=>{
 assert.equal(packageProgress(item),50);
 const stats=wbsMetrics([item,{...item,id:'p2',weight:1,deliverables:item.deliverables.map(d=>({...d,checked:true})),status:'approved'}, {...item,id:'p3',weight:100,scope_status:'excluded'}]);
 assert.equal(stats.progress,67);assert.equal(stats.included,2);assert.equal(stats.excluded,1);assert.equal(stats.deliverables,4);assert.equal(stats.delivered,3);assert.equal(stats.approved,1);
});
test('Baseline changes ignore evidence/progress, detect scope changes and preserve before state',()=>{
 const baseline={snapshot:{packages:[scopeDefinition(item)]}};
 assert.equal(baselineChanges([{...item,status:'review',evidence:'New record',deliverables:item.deliverables.map(d=>({...d,checked:true,evidence:'Proof'}))}],baseline).changed.length,0);
 assert.deepEqual(baselineChanges([{...item,title:'Revised scope'}],baseline).changed,['p1']);
 assert.deepEqual(baselineChanges([],baseline).removed,['p1']);
});
test('Dictionary export has traceable dependencies and neutralizes spreadsheet formulas',()=>{
 const csv=dictionaryCsv([{...item,title:'=HYPERLINK("example")',predecessor_ids:['p2']}],[item,{id:'p2',wbs_code:'2.02.01'}]);
 assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('2.02.01'));assert.ok(csv.includes('Versão 1'));assert.ok(csv.startsWith('\uFEFF'));
});
