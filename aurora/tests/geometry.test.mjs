import test from 'node:test';import assert from 'node:assert/strict';
import {polygonGeometry,polygonSummary} from '../src/geometry.ts';
const square={type:'Polygon',coordinates:[[[-47,-19],[-46.99,-19],[-46.99,-18.99],[-47,-18.99],[-47,-19]]]};
test('poligonal é obrigatória: pontos, linhas, anéis abertos e coordenadas inválidas são rejeitados',()=>{
 for(const value of [null,{type:'Point',coordinates:[-47,-19]},{type:'LineString',coordinates:[[-47,-19],[-46,-18]]},{...square,coordinates:[square.coordinates[0].slice(0,-1)]},{type:'Polygon',coordinates:[[[181,0],[182,0],[182,1],[181,0]]]}])assert.throws(()=>polygonGeometry(value));
});
test('importação normaliza multipolígonos, preserva vazios interiores e remove propriedades não geográficas',()=>{
 const hole=[[-46.998,-18.998],[-46.994,-18.998],[-46.994,-18.994],[-46.998,-18.994],[-46.998,-18.998]];
 const g=polygonGeometry({type:'FeatureCollection',features:[{type:'Feature',properties:{unsafe:'<script>'},geometry:{...square,coordinates:[...square.coordinates,hole]}}]});
 assert.equal(g.type,'MultiPolygon');assert.equal(g.coordinates[0].length,2);assert.ok(polygonSummary(g).areaHa<polygonSummary(square).areaHa);assert.ok(!('properties' in g));
});
test('área e centro de referência são finitos; geometria excessiva e contorno sem área são rejeitados',()=>{
 const s=polygonSummary(square);assert.ok(s.areaHa>100&&s.areaHa<130);assert.equal(s.vertices,4);assert.ok(s.latitude< -18.99&&s.latitude> -19);
 assert.throws(()=>polygonSummary({type:'Polygon',coordinates:[[[0,0],[1,1],[2,2],[0,0]]]}));
 assert.throws(()=>polygonGeometry({type:'Polygon',coordinates:[Array.from({length:10002},(_,i)=>[i%3,0])]}));
});
