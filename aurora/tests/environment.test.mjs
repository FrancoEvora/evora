import test from 'node:test';
import assert from 'node:assert/strict';
import {intersects,environmentalSelection,environmentalDate} from '../shared/environment.mjs';
import {normalizeEnvironmentalFeature,fetchEnvironmentalSource} from '../api/_lib/environmental-sources.js';
const polygon={type:'Polygon',coordinates:[[[-48,-20],[-47,-20],[-47,-19],[-48,-19],[-48,-20]],[[-47.8,-19.8],[-47.2,-19.8],[-47.2,-19.2],[-47.8,-19.2],[-47.8,-19.8]]]};
test('interseção ambiental respeita buracos, pontos e polígonos, sem confundir proximidade com sobreposição',()=>{
 assert.equal(intersects({type:'Point',coordinates:[-47.9,-19.9]},polygon),true);
 assert.equal(intersects({type:'Point',coordinates:[-47.5,-19.5]},polygon),false);
 assert.equal(intersects({type:'MultiPoint',coordinates:[[-47.5,-19.5],[-47.9,-19.9]]},polygon),true);
 assert.equal(intersects({type:'Point',coordinates:[-46,-19.9]},polygon),false);
 assert.equal(intersects({type:'Polygon',coordinates:[[[-47.6,-19.6],[-47.4,-19.6],[-47.4,-19.4],[-47.6,-19.4],[-47.6,-19.6]]]},polygon),false);
});
test('normalização mantém rastreabilidade e exclui nomes de autuados, CPF, proprietários e contatos',()=>{
 const f=normalizeEnvironmentalFeature({id:'x',geometry:polygon,properties:{num_tad:'123',serie_tad:'A',cpf_cnpj_embargado:'secret',nome_embargado:'secret',PROPRIETARIO:'secret',telefone:'secret'}},'ibama',{id:'embargos',title:'Embargos',source_url:'https://example.org'},0);
 assert.equal(f.properties.title,'Termo 123/A');assert.equal(JSON.stringify(f).includes('secret'),false);
});
test('raios de 5 e 7 km selecionam somente as ocorrências do recorte',()=>{
 const snapshot={spatial:{features:[{type:'Feature',geometry:{type:'Point',coordinates:[-47.49,-18.72]}},{type:'Feature',geometry:{type:'Point',coordinates:[-47.49,-18.666]}}]}};
 assert.equal(environmentalSelection(snapshot,-18.72,-47.49,5).features.length,1);assert.equal(environmentalSelection(snapshot,-18.72,-47.49,7).features.length,2);
});
test('abrangência estadual não gera falsa contagem zero e não consulta rede fora da jurisdição',async()=>{
 const old=globalThis.fetch;globalThis.fetch=()=>{throw Error('Não deveria consultar')};try{for(const [source_key,state] of [['graprohab','MG'],['ide_sisema','SP']]){const s=await fetchEnvironmentalSource({source_key,asset_state:state,config:{latitude:-18.72,longitude:-47.49}});assert.equal(s.environment.applicable,false);assert.equal(s.rows[0].value,null);}}finally{globalThis.fetch=old;}
});

test('datas ambientais normalizam milissegundos ArcGIS e datas WFS sem inventar uma data-base',()=>{assert.equal(environmentalDate('1737571989000'),'2025-01-22T18:53:09.000Z');assert.equal(environmentalDate('2019-05-10Z'),'2019-05-10');assert.equal(environmentalDate(''), '');assert.equal(environmentalDate('edição não informada'),'edição não informada');});
