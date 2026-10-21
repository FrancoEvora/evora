import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBusinesses,businessGroups,summarizeTerritory} from '../shared/market-data.mjs';
import {buildHeatmap,circleGeometry,geometryArea} from '../shared/heatmap.mjs';
import {businessReference,fetchBusinessSource} from '../api/_lib/business-sources.js';
const latitude=-18.72,longitude=-47.49;
const geometry={type:'Polygon',coordinates:[[[-47.7,-18.9],[-47.2,-18.9],[-47.2,-18.5],[-47.7,-18.5],[-47.7,-18.9]]]};
const area=geometryArea(geometry),p={area_km2:area,population:area*100,occupied:area*30,vacant:area*5,occasional:area*2,income:2453.03};
const spatial={scope:{radius_km:7},features:[{type:'Feature',id:'test',geometry,properties:p}]};
test('rendimento conserva V06004 original e não é convertido em densidade ou renda familiar',()=>{
 const result=buildHeatmap(spatial,{latitude,longitude,metric:'income'});
 assert.equal(result.features[0].properties.value,2453.03);assert.equal(result.features[0].properties.modeled,false);
 assert.match(result.methodology,/Não é renda familiar/);
 assert.throws(()=>buildHeatmap(spatial,{latitude,longitude,metric:'income',mode:'hexagons'}),/setores originais/);
});
test('comparação conserva estimativas de ocupados, vagos e uso ocasional, sem inferir demanda',()=>{
 const summary=summarizeTerritory(spatial,{latitude,longitude,radius:5}),circleArea=geometryArea(circleGeometry(latitude,longitude,5));
 assert.ok(Math.abs(summary.occupied-circleArea*30)<.001);
 assert.ok(Math.abs(summary.vacancy_share-5/37)<.0001);
 assert.equal(summary.income_sector_median,2453.03);assert.match(summary.methodology,/não ponderada/);
 const absent=structuredClone(spatial);absent.features[0].properties.occupied=null;
 assert.equal(summarizeTerritory(absent,{latitude,longitude,radius:5}).occupied,null);
 absent.features[0].properties.occupied=0;assert.equal(summarizeTerritory(absent,{latitude,longitude}).occupied,0);
 assert.equal(summarizeTerritory({...spatial,scope:{radius_km:3}},{latitude,longitude,radius:7}),null);
});
test('CNPJ identifica estabelecimentos, remove duplicatas e não persiste sócios nem contatos',()=>{
 const row={cnpj:'11.111.111/0001-11',codigo_municipio_ibge:3143104,nome_fantasia:'Teste',situacao_cadastral:2,cnae_fiscal:6810201,cnae_fiscal_descricao:'Atividade de teste',qsa:[{cpf:'sigiloso'}],ddd_telefone_1:'contato',email:'privado'};
 const data=normalizeBusinesses([row,row,{...row,cnpj:'11111111000222'}, {...row,cnpj:'22222222000122',codigo_municipio_ibge:3170206}],'3143104');
 assert.equal(data.records.length,2);assert.equal(data.duplicates,1);assert.equal(data.rejected,1);
 assert.ok(!JSON.stringify(data).includes('sigiloso'));assert.ok(!JSON.stringify(data).includes('privado'));assert.equal(businessGroups(data.records)[0].count,2);
 data.records[1].status=8;assert.equal(businessGroups(data.records)[0].count,1);
});
test('data-base empresarial mensal é preservada sem inventar um dia',()=>{
 assert.equal(businessReference({message:'2026-10'},'2026-10-21'),'2026-10');
 assert.throws(()=>businessReference({message:'2026-99'},'2026-10-21'));
 assert.throws(()=>businessReference({message:'2027-01'},'2026-10-21'));
 assert.throws(()=>businessReference({message:'2026-02-31'},'2026-10-21'));
});
test('paginação CNPJ utiliza cursor opaco, valida município e remove dados fora do escopo',async t=>{
 const urls=[];t.mock.method(globalThis,'fetch',async input=>{
  const u=new URL(input);urls.push(u.href);
  if(u.pathname==='/updated')return new Response(JSON.stringify({message:'2026-10'}));
  const second=u.searchParams.has('cursor');
  if(second)assert.equal(u.searchParams.get('cursor'),'opaque/next+cursor');
  return new Response(JSON.stringify({data:[{cnpj:second?'11111111000222':'11111111000111',codigo_municipio_ibge:3143104,situacao_cadastral:2,cnae_fiscal:6810201}],cursor:second?null:'opaque/next+cursor'}));
 });
 const result=await fetchBusinessSource({config:{municipality:'3143104'}});
 assert.equal(result.business.complete,true);assert.equal(result.business.records.length,2);assert.equal(urls.length,3);assert.ok(urls.every(u=>u.startsWith('https://minhareceita.org/')));
});

test('setores sem domicílios ocupados não reduzem artificialmente a cobertura residencial de rendimento',()=>{
 const rect=(w,e)=>({type:'Polygon',coordinates:[[[w,-18.9],[e,-18.9],[e,-18.5],[w,-18.5],[w,-18.9]]]});
 const left=rect(-47.7,longitude),right=rect(longitude,-47.2);
 const data={scope:{radius_km:7},features:[{type:'Feature',geometry:left,properties:{...p,area_km2:geometryArea(left)}},{type:'Feature',geometry:right,properties:{...p,area_km2:geometryArea(right),occupied:0,income:null}}]};
 const result=summarizeTerritory(data,{latitude,longitude,radius:3});
 assert.equal(result.coverage.income,1);assert.ok(result.coverage.income_area<.51);assert.equal(result.income_sector_median,2453.03);
});
test('limite empresarial nunca transforma uma coleção truncada em coleta completa',async t=>{
 const row=i=>({cnpj:String(20000000000000+i),name:'Teste',municipality:'3143104',cnae:'6810201',activity:'Teste',status:2});
 const previous={reference:'2026-10',municipality:'3143104',complete:false,records:Array.from({length:9999},(_,i)=>row(i)),cursor:'next',rejected:0,duplicates:0,pages:40};
 t.mock.method(globalThis,'fetch',async input=>new URL(input).pathname==='/updated'?new Response(JSON.stringify({message:'2026-10'})):new Response(JSON.stringify({data:[9999,10000].map(i=>({cnpj:row(i).cnpj,codigo_municipio_ibge:3143104,situacao_cadastral:2})),cursor:null})));
 const result=await fetchBusinessSource({config:{municipality:'3143104'},snapshot:{business:previous}});
 assert.equal(result.business.records.length,10000);assert.equal(result.business.complete,false);
});
