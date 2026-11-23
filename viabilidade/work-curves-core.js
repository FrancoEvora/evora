/* Évora Viabilidade · Modelos de implantação e referência original por estudo. */
(function(){
'use strict';
const E=window.EvoraEngine,H=E&&E.workStageHelpers;
if(!E||!H||E.workCurves)return;
E.defaults.workCurveOriginalJson='';
const clone=value=>JSON.parse(JSON.stringify(value));
const owns=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const models=[
 {id:'s',label:'Curva S',description:'Mobilização gradual, maior execução no meio e desaceleração na conclusão.'},
 {id:'linear',label:'Linear',description:'Distribuição uniforme da execução ao longo do prazo.'},
 {id:'early',label:'Antecipada',description:'Maior execução no início, com redução gradual ao longo do prazo.'},
 {id:'late',label:'Postergada',description:'Execução menor no início e concentração gradual no final do prazo.'},
 {id:'custom',label:'Manual',description:'Pesos mensais definidos por você e normalizados para totalizar 100%.'}
];
const curveIds=new Set(models.map(model=>model.id));
const prepare=input=>E.prepare(clone(input||{}));

function validWeights(value,duration){
 if(!Array.isArray(value)||value.length!==duration||value.some(weight=>typeof weight!=='number'||!Number.isFinite(weight)||weight<0))throw new Error('Informe um peso numérico não negativo para cada mês do prazo selecionado.');
 const sum=value.reduce((total,weight)=>total+weight,0);
 if(!Number.isFinite(sum)||sum<=0)throw new Error('A soma dos pesos mensais deve ser maior que zero.');
 return value.slice();
}
function validateSnapshot(value,stage=false){
 if(!value||typeof value!=='object'||!Number.isInteger(value.start)||value.start<0||value.start>(stage?119:120)||!Number.isInteger(value.duration)||value.duration<1||value.duration>120||!curveIds.has(value.curve)||(stage&&value.start+value.duration-1>120))throw new Error('A referência original da implantação está inválida. Recupere um backup válido do estudo.');
 if(value.curve==='custom')validWeights(value.weights,value.duration);
 else if(!Array.isArray(value.weights))throw new Error('A referência original da implantação está inválida.');
 return {start:value.start,duration:value.duration,curve:value.curve,weights:clone(value.weights)};
}
function readOriginal(input){
 const value=input&&input.workCurveOriginalJson;
 if(value===undefined||value===null||value==='')return null;
 let original;
 try{original=typeof value==='string'?JSON.parse(value):clone(value);}catch{throw new Error('Não foi possível ler a implantação original. Recupere um backup válido antes de aplicar outro modelo.');}
 if(!original||original.version!==1||typeof original.savedAt!=='string'||!original.stages||typeof original.stages!=='object'||Array.isArray(original.stages))throw new Error('A referência original usa um formato inválido ou incompatível.');
 const stages=Object.create(null);
 for(const [id,snapshot] of Object.entries(original.stages))stages[id]=validateSnapshot(snapshot,true);
 return {version:1,savedAt:original.savedAt,...(original.single?{single:validateSnapshot(original.single)}:{}),stages};
}
function snapshot(value,single=false){
 const weights=single?value.workWeights:value.weights;
 return {start:single?value.workStart:value.start,duration:value.duration,curve:value.curve,weights:Array.isArray(weights)?clone(weights):[]};
}
function capture(input){
 const params=prepare(input),existing=readOriginal(params);
 const original=existing||{version:1,savedAt:new Date().toISOString(),stages:Object.create(null)};
 let changed=!existing||typeof params.workCurveOriginalJson!=='string';
 if(params.workMode==='stages'){
  for(const stage of params.workStages)if(!owns(original.stages,stage.id)){
   const saved=snapshot(stage);
   try{validateSnapshot(saved,true);}catch(error){throw new Error('A curva original da etapa “'+stage.name+'” não pode ser guardada. '+error.message);}
   original.stages[stage.id]=saved;changed=true;
  }
 }else if(!original.single){const saved=snapshot(params,true);validateSnapshot(saved);original.single=saved;changed=true;}
 // Preserve the original serialized reference exactly when no new scope is added.
 if(changed)params.workCurveOriginalJson=JSON.stringify(original);
 return params;
}
function selected(params,target){
 if(target==='all')return params.workMode==='stages'?params.workStages:[];
 if(params.workMode!=='stages'||typeof target!=='string'||!target.startsWith('stage:'))throw new Error('Selecione a obra ou uma etapa válida para modelar a implantação.');
 const id=target.slice(6),stage=params.workStages.find(item=>item.id===id);
 if(!stage)throw new Error('A etapa selecionada não existe mais. Selecione uma etapa atual.');
 return [stage];
}
function scopes(input){
 const params=prepare(input);
 if(params.workMode!=='stages')return [{id:'all',label:'Obra única',start:params.workStart,duration:params.duration,curve:params.curve}];
 return [{id:'all',label:'Todas as etapas',start:params.workStart,duration:params.duration,curve:null},...params.workStages.map(stage=>({id:'stage:'+stage.id,stageId:stage.id,label:stage.name,start:stage.start,duration:stage.duration,curve:stage.curve}))];
}
function hasOriginal(input,target='all'){
 const params=prepare(input),stages=selected(params,target),original=readOriginal(params);
 if(!original)return false;
 return params.workMode==='stages'?stages.some(stage=>owns(original.stages,stage.id)):!!original.single;
}
function applyModel(input,model,target='all',manualWeights){
 if(!curveIds.has(model))throw new Error('Escolha um modelo válido de implantação.');
 const current=prepare(input),targets=selected(current,target);
 if(model==='custom'&&current.workMode==='stages'&&new Set(targets.map(stage=>stage.duration)).size>1)throw new Error('Para editar os pesos manualmente, selecione uma etapa. As etapas possuem prazos diferentes.');
 if(model==='custom')validWeights(manualWeights,current.workMode==='stages'?targets[0].duration:current.duration);
 const params=capture(current);
 if(params.workMode==='stages'){
  const ids=new Set(targets.map(stage=>stage.id));
  const stages=params.workStages.map(stage=>ids.has(stage.id)?{...stage,curve:model,weights:model==='custom'?manualWeights.slice():[]}:stage);
  params.workStagesJson=JSON.stringify(H.serializeStages(stages));
 }else{
  params.curve=model;
  params.workWeights=model==='custom'?manualWeights.slice():[];
 }
 return prepare(params);
}
function restore(input,target='all'){
 const params=prepare(input),targets=selected(params,target),original=readOriginal(params);
 if(!original)throw new Error('A implantação original será guardada quando você aplicar o primeiro modelo.');
 if(params.workMode==='stages'){
  const ids=new Set(targets.map(stage=>stage.id));
  let count=0;
  const stages=params.workStages.map(stage=>{
   if(!ids.has(stage.id)||!owns(original.stages,stage.id))return stage;
   count++;
   return {...stage,...clone(original.stages[stage.id])};
  });
  if(!count)throw new Error('A etapa selecionada ainda não tem uma curva original guardada.');
  params.workStagesJson=JSON.stringify(H.serializeStages(stages));
 }else{
  if(!original.single)throw new Error('A obra única ainda não tem uma curva original guardada.');
  const saved=original.single;
  Object.assign(params,{workStart:saved.start,duration:saved.duration,curve:saved.curve,workWeights:clone(saved.weights)});
 }
 return prepare(params);
}
function modelWeights(model,duration){
 if(!curveIds.has(model)||model==='custom')throw new Error('Selecione um modelo padrão para gerar pesos mensais.');
 if(!Number.isInteger(duration)||duration<1||duration>120)throw new Error('O prazo da curva deve ter de 1 a 120 meses.');
 return H.standardWeights(model,duration);
}
function currentWeights(input,target='all'){
 const params=prepare(input),targets=selected(params,target);
 if(params.workMode!=='stages')return E.weights(params);
 if(target==='all')return H.buildSchedule(params).aggregateWeights;
 const stage=targets[0];
 return stage.curve==='custom'?H.resampleWeights(stage.weights,stage.duration):H.standardWeights(stage.curve,stage.duration);
}
function weightsFor(input,target='all'){
 return typeof input==='string'?modelWeights(input,target):currentWeights(input,target);
}

E.workCurves={models,scopes,readOriginal,capture,hasOriginal,applyModel,restore,weightsFor,modelWeights,currentWeights};
})();
