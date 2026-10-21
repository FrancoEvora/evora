import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHeatmap,circleGeometry,geometryArea,heatColor,legendBreaks} from '../shared/heatmap.mjs';
import {normalizeCensus,normalizeOsm,studyBounds,osmQuery,censusUrl} from '../api/_lib/geo-sources.js';

const latitude=-18.72,longitude=-47.49;
const geometry={type:'Polygon',coordinates:[[[-47.6,-18.8],[-47.4,-18.8],[-47.4,-18.6],[-47.6,-18.6],[-47.6,-18.8]]]};
const area=geometryArea(geometry);
const spatial={features:[{type:'Feature',id:'test',geometry,properties:{area_km2:area,population:area*100,households:area*40}}]};
test('hexágonos conservam a repartição por área e identificam estimativas',()=>{
 const result=buildHeatmap(spatial,{latitude,longitude,radius:2,metric:'population',mode:'hexagons',resolution:9});
 assert.ok(result.features.length>50);assert.equal(result.summary.issues,0);assert.ok(result.summary.coverage>.999);
 for(const f of result.features){assert.ok(Math.abs(f.properties.value-100)<.1);assert.equal(f.properties.modeled,true)}
 const expected=geometryArea(circleGeometry(latitude,longitude,2))*100,estimated=result.features.reduce((s,f)=>s+f.properties.count,0);
 assert.ok(Math.abs(estimated-expected)/expected<.001);
});
test('setores preservam o total original e não atribuem o total ao círculo recortado',()=>{
 const result=buildHeatmap(spatial,{latitude,longitude,radius:1,metric:'households',mode:'sectors'});
 assert.equal(result.features[0].properties.households,area*40);assert.ok(Math.abs(result.features[0].properties.value-40)<1e-9);assert.equal(result.features[0].properties.modeled,false);
 assert.ok(geometryArea(result.features[0].geometry)<area/10);
});
test('ausência é distinta de zero e não se transforma em demanda inexistente',()=>{
 const missing=structuredClone(spatial);missing.features[0].properties.population=null;
 const result=buildHeatmap(missing,{latitude,longitude,metric:'population',mode:'hexagons'});
 assert.equal(result.summary.coverage,0);assert.ok(result.features.every(f=>f.properties.value===null));
 missing.features[0].properties.population=0;const zero=buildHeatmap(missing,{latitude,longitude,metric:'population',mode:'sectors'});
 assert.equal(zero.features[0].properties.value,0);assert.notEqual(heatColor(null,[1,2,3,4]),heatColor(0,[1,2,3,4]));
});
test('pontos são contados uma vez na célula, respeitando categoria e raio',()=>{
 const data={features:[{geometry:{type:'Point',coordinates:[longitude,latitude]},properties:{name:'A',category:'health'}},{geometry:{type:'Point',coordinates:[longitude+.2,latitude]},properties:{name:'Fora',category:'health'}},{geometry:{type:'Point',coordinates:[longitude,latitude]},properties:{name:'B',category:'retail'}}]};
 const result=buildHeatmap(data,{latitude,longitude,metric:'points',radius:1,category:'health'});
 assert.equal(result.summary.source_features,1);assert.equal(result.features.reduce((s,f)=>s+f.properties.value,0),1);
});
test('escala fixa permite comparar lugares sem mudar os limites',()=>{
 assert.deepEqual(legendBreaks([], 'population'),legendBreaks([{properties:{value:200000}}],'population'));
 assert.throws(()=>buildHeatmap(spatial,{latitude,longitude,radius:100}),/recorte válido/);
});
test('IBGE associa o código completo e mantém setores sem correspondência nulos',async()=>{
 const raw={type:'FeatureCollection',features:[{geometry,properties:{cd_setor:'314310405000001',area_km2:.204166828,nm_mun:'Monte Carmelo'}},{geometry,properties:{cd_setor:'314310499999999',area_km2:1}}]};
 const result=await normalizeCensus(raw,{latitude,longitude});
 assert.equal(result.features[0].properties.population,361);assert.equal(result.features[0].properties.households,220);
 assert.equal(result.features[1].properties.population,null);assert.equal(result.unmatched,1);
});
test('OSM rejeita consulta incompleta e evita IDs duplicados',()=>{
 assert.throws(()=>normalizeOsm({elements:[],remark:'runtime error'},{latitude,longitude}));
 const e={type:'node',id:1,lat:latitude,lon:longitude,tags:{name:'Teste',amenity:'hospital'}};
 const result=normalizeOsm({elements:[e,e]},{latitude,longitude});
 assert.equal(result.features.length,1);assert.equal(result.features[0].properties.category,'health');
 assert.match(result.methodology,/não equivalem a empresas únicas/);
});
test('consultas geográficas têm limites fixos, coordenadas brasileiras e nenhuma URL fornecida pelo cliente',()=>{
 assert.throws(()=>studyBounds({latitude:'1);DROP',longitude}));assert.throws(()=>studyBounds({latitude:latitude,longitude:180}));
 assert.match(censusUrl({latitude,longitude}),/^https:\/\/geoservicos\.ibge\.gov\.br\//);
 assert.match(osmQuery({latitude,longitude}),/out center 1601/);assert.equal(studyBounds({latitude,longitude,radius_km:1000}).radius_km,3);
});
