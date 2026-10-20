import test from 'node:test';import assert from 'node:assert/strict';
import {chooseWorkspace} from '../src/workspace-selection.ts';
const empty={id:'operation',is_demo:false,asset_count:0},demo={id:'examples',is_demo:true,asset_count:6};
test('primeiro acesso abre exemplos disponíveis quando a operação está vazia',()=>{assert.equal(chooseWorkspace([empty,demo]),'examples')});
test('operações com ativos têm prioridade sobre a demonstração',()=>{assert.equal(chooseWorkspace([{...empty,asset_count:1},demo]),'operation')});
test('troca explícita e preferência de cada conta são respeitadas',()=>{assert.equal(chooseWorkspace([empty,demo],{current:'operation',saved:'examples'}),'operation');assert.equal(chooseWorkspace([empty,demo],{saved:'operation'}),'operation');assert.equal(chooseWorkspace([empty,demo],{requested:'examples',saved:'operation'}),'examples')});
test('preferências nunca dão acesso a organizações fora da lista autorizada',()=>{assert.equal(chooseWorkspace([empty],{current:'foreign',requested:'examples',saved:'foreign'}),'operation');assert.equal(chooseWorkspace([],{saved:'examples'}),'')});
