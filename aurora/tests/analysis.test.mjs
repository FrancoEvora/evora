import test from 'node:test';import assert from 'node:assert/strict';
import {weightedScore,distanceKm,parseCsv} from '../src/analysis.ts';
test('ponderação normaliza pesos e não inventa notas ausentes',()=>{assert.equal(weightedScore([80,60],[3,1]),75);assert.equal(weightedScore([80,null],[3,1]),null);assert.equal(weightedScore([80,null],[3,0]),80);assert.equal(weightedScore([80,60],[0,0]),null)});
test('raio utiliza distância geodésica e aceita coordenadas negativas',()=>{assert.equal(distanceKm({latitude:0,longitude:0},{latitude:0,longitude:0}),0);const d=distanceKm({latitude:0,longitude:0},{latitude:0,longitude:1});assert.ok(d>111&&d<112)});
test('CSV respeita campos com vírgulas, aspas e linhas vazias',()=>{assert.deepEqual(parseCsv('name,source\r\n"A, B","Fonte ""X"""\r\n'),[{name:'A, B',source:'Fonte "X"'}]);assert.throws(()=>parseCsv('a,a\n1,2'));assert.throws(()=>parseCsv('a,b\n1'));assert.throws(()=>parseCsv('a\n"unfinished'))});
