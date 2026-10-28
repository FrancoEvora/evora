/* Évora · Deliverables and investment performance: additive metadata, no financial-engine changes. */
(function(root){
'use strict';
const E=root.EvoraEngine;if(!E||E.performance)return;
E.defaults.deliveryRegisterJson='{"version":1,"byStage":{}}';
E.defaults.performanceCutoff='';
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:0;
const uid=()=>root.crypto?.randomUUID?.()||'d-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const statuses={pending:'Não iniciado',doing:'Em andamento',blocked:'Bloqueado',done:'Concluído'};
const key=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
const presets={
 preparation:{label:'Preparação e mobilização',items:[['Projetos executivos compatibilizados','Projetos revisados, compatibilizados e liberados pelos responsáveis técnicos.'],['Autorizações para início da etapa','Autorizações aplicáveis conferidas e registradas pela equipe responsável.'],['Levantamento e locação topográfica','Marcos e locação conferidos conforme projeto.'],['Canteiro e mobilização','Instalações provisórias e condições de operação verificadas.']]},
 infrastructure:{label:'Infraestrutura urbana',items:[['Terraplenagem e compactação','Cotas, estabilidade e ensaios de compactação verificados.'],['Drenagem pluvial','Redes, dispositivos e dissipadores executados e inspecionados conforme projeto.'],['Rede de abastecimento de água','Execução, testes e documentação de recebimento conferidos.'],['Rede de esgotamento sanitário','Execução, testes e interfaces com o sistema de destino conferidos.'],['Pavimentação, guias e sarjetas','Camadas, acabamento e ensaios pertinentes aceitos.'],['Energia e iluminação pública','Infraestrutura, testes e liberações aplicáveis registrados.'],['Calçadas, acessibilidade e sinalização','Rotas, travessias e sinalização conferidas conforme projeto.']]},
 leisure:{label:'Lazer, paisagismo e áreas comuns',items:[['Portaria e controle de acesso','Edificações e sistemas testados e aceitos.'],['Clube e espaços de convivência','Ambientes, instalações e equipamentos entregues conforme escopo.'],['Piscinas e instalações de apoio','Estruturas, tratamento e equipamentos testados.'],['Quadras e equipamentos esportivos','Pisos, iluminação e equipamentos inspecionados.'],['Paisagismo e áreas verdes','Plantio, irrigação prevista e plano de manutenção conferidos.'],['Playground, mobiliário e áreas de permanência','Instalação e verificações de segurança documentadas.']]},
 closing:{label:'Comissionamento e entrega',items:[['Testes e comissionamento','Testes dos sistemas concluídos e pendências tratadas.'],['Cadastro técnico e projetos as built','Documentação atualizada conforme a execução.'],['Vistorias e recebimentos aplicáveis','Vistorias, termos e liberações exigíveis verificados pela equipe.'],['Manuais, garantias e plano de manutenção','Documentação entregue ao responsável pela operação.'],['Encerramento de pendências da etapa','Lista de pendências verificada e aceite registrado.']]}
};
function readRegister(params){
 let raw;try{raw=JSON.parse(params?.deliveryRegisterJson||E.defaults.deliveryRegisterJson);}catch{throw new Error('O cadastro de entregáveis contém JSON inválido. Restaure o backup antes de editar.');}
 if(!raw||typeof raw!=='object'||!raw.byStage||typeof raw.byStage!=='object'||Array.isArray(raw.byStage))throw new Error('Formato do cadastro de entregáveis inválido.');
 return {version:1,byStage:raw.byStage};
}
function normalizeItems(items){
 if(!Array.isArray(items)||items.length>120)throw new Error('Cadastre até 120 entregáveis por etapa.');
 const ids=new Set();return items.map((item,i)=>{
  const title=String(item.title||'').trim();if(!title)throw new Error('Informe o nome do entregável '+(i+1)+'.');
  const month=(v,label)=>{if(v===''||v==null)return null;const n=Number(v);if(!Number.isInteger(n)||n<0||n>960)throw new Error(label+' deve ser um mês inteiro entre M0 e M960.');return n;};
  const dueMonth=month(item.dueMonth,'Prazo'),completedMonth=month(item.completedMonth,'Conclusão'),status=statuses[item.status]?item.status:'pending';
  if(status==='done'&&completedMonth===null)throw new Error('Informe o mês de conclusão de “'+title+'”.');
  const id=String(item.id||uid());if(ids.has(id))throw new Error('Há identificadores repetidos de entregáveis.');ids.add(id);
  return {id,title:title.slice(0,160),owner:String(item.owner||'').slice(0,120),dueMonth,status,completedMonth:status==='done'?completedMonth:null,criterion:String(item.criterion||'').slice(0,1200),notes:String(item.notes||'').slice(0,1600),templateId:String(item.templateId||'').slice(0,100),updatedAt:item.updatedAt||new Date().toISOString()};
 });
}
function addPreset(items,group,selected,dueMonth){
 if(!presets[group])throw new Error('Modelo de entregáveis desconhecido.');
 const existing=new Set(items.map(x=>key(x.title))),templates=new Set(items.map(x=>x.templateId).filter(Boolean));let added=0;
 const out=items.map(x=>({...x}));for(const i of selected){const sample=presets[group].items[i],tid=group+':'+i;if(!sample||existing.has(key(sample[0]))||templates.has(tid))continue;out.push({id:uid(),title:sample[0],owner:'',dueMonth,status:'pending',completedMonth:null,criterion:sample[1],notes:'',templateId:tid});existing.add(key(sample[0]));templates.add(tid);added++;}
 return {items:out,added};
}
function stageRefs(params,result){
 if(params.workMode==='stages')return (result?.stages||params.workStages||[]).map(s=>({...s,end:s.end??s.start+s.duration-1}));
 return [{id:'single',name:'Implantação',start:params.workStart,duration:params.duration,end:params.workStart+params.duration-1,budget:params.work,nominalTotal:result?.totals.work}];
}
function deliverables(params,result,cutoff){
 const register=readRegister(params),refs=stageRefs(params,result);let all=[];
 const stages=refs.map(stage=>{const items=Array.isArray(register.byStage[stage.id])?register.byStage[stage.id]:[];const decorated=items.map(item=>{
  const completed=Number.isInteger(item.completedMonth)&&item.completedMonth<=cutoff&&item.status==='done';
  const overdue=Number.isInteger(item.dueMonth)&&item.dueMonth<cutoff&&!completed;
  return {...item,stageId:stage.id,stageName:stage.name,completedAtCutoff:completed,overdue};
 });all.push(...decorated);return {...stage,items:decorated,total:items.length,done:decorated.filter(x=>x.completedAtCutoff).length,overdue:decorated.filter(x=>x.overdue).length};});
 return {stages,items:all,total:all.length,done:all.filter(x=>x.completedAtCutoff).length,overdue:all.filter(x=>x.overdue).length,blocked:all.filter(x=>x.status==='blocked').length,unassigned:all.filter(x=>!String(x.owner||'').trim()).length};
}
const sum=(rows,k)=>rows.reduce((n,r)=>n+number(r[k]),0);
function cashRows(result){let receipts=0,costs=0,capital=0,financeOut=0;return result.rows.map(r=>{
 const operatingCost=number(r.work)+number(r.land)+number(r.predev)+number(r.commission)+number(r.marketing)+number(r.tax)+number(r.servicing)+number(r.admin);
 const capitalIn=number(r.draw)+number(r.extraEquity)+(r.t===0?number(result.p.equity):0),capitalOut=number(r.interest)+number(r.fee)+number(r.repay)+number(r.distribution);
 receipts+=number(r.received);costs+=operatingCost;capital+=capitalIn;financeOut+=capitalOut;
 return {...r,operatingCost,capitalIn,capitalOut,cumOperatingCost:costs,cumCapitalIn:capital,cumCapitalOut:financeOut,cumTotalIn:receipts+capital,cumTotalOut:costs+financeOut};
 });}
function funding(result){let financeCost=0,best={value:0,month:0,costs:0,operatingGap:0},maxDebt=0;for(const r of result.rows){financeCost+=number(r.interest)+number(r.fee);const value=Math.max(0,financeCost-number(r.cumulative));if(value>best.value)best={value,month:r.t,costs:financeCost,operatingGap:-number(r.cumulative)};maxDebt=Math.max(maxDebt,number(r.debt));}return {...best,maxDebt};}
function defaultCutoff(project,result){const manual=project.params?.performanceCutoff;if(manual!==''&&manual!=null&&Number.isInteger(Number(manual)))return Math.min(result.totals.horizon,Math.max(0,Number(manual)));const months=[...Object.keys(project.actuals?.sales||{}),...Object.keys(project.actuals?.work||{})].map(Number).filter(Number.isInteger);if(months.length)return Math.min(result.totals.horizon,Math.max(...months));return 0;}
function actualComparison(map,plan,cutoff,type){
 const observations=Object.entries(map||{}).filter(([k,v])=>Number.isInteger(Number(k))&&Number(k)>=0&&Number(k)<=cutoff&&v!==''&&v!==null&&Number.isFinite(Number(v))&&Number(v)>=0).map(([k,v])=>[Number(k),Number(v)]).sort((a,b)=>a[0]-b[0]);
 const start=type==='sales'?plan.p.salesStart:plan.p.workStart,end=type==='sales'?cutoff:Math.min(cutoff,plan.totals.workEnd);const expected=Math.max(0,end-start+1),covered=observations.filter(([m])=>m>=start&&m<=end).length;
 const plannedAt=m=>type==='sales'?number(plan.rows[m]?.units):number(plan.workWeights[m-plan.p.workStart])*100;
 const actual=observations.reduce((a,x)=>a+x[1],0),comparable=observations.reduce((a,x)=>a+plannedAt(x[0]),0);let full=0;for(let m=0;m<=cutoff;m++)full+=plannedAt(m);
 return {observations,available:observations.length>0,actual:observations.length?actual:null,comparable:observations.length?comparable:null,variance:observations.length?actual-comparable:null,plannedFull:full,covered,expected,complete:covered===expected,lastMonth:observations.at(-1)?.[0]??null};
}
function performance(project,result,cutoff=defaultCutoff(project,result)){
 const rows=cashRows(result),t=result.totals,p=result.p,end=Math.min(rows.length-1,Math.max(0,cutoff));const period=rows.slice(0,end+1),row=rows[end],f=funding(result);
 let baseline=result,baselineLabel='Projeção atual (sem baseline congelado)',baselineError=null;
 if(project.actuals?.plan?.params){try{baseline=E.simulate(project.actuals.plan.params,true);baselineLabel='Baseline salvo em '+project.actuals.plan.savedAt;}catch(e){baselineError=e.message;baselineLabel='Baseline indisponível; comparação usa a projeção atual';}}
 const contributions=number(p.equity)+sum(rows,'extraEquity'),distributions=sum(rows,'distribution'),eqFlows=rows.map(r=>r.equityCF),completion=rows[t.workEnd];
 const baseEquity={vpl:E.npv(eqFlows,p.tma),irr:E.irr(eqFlows),contributions,distributions,multiple:contributions>0?distributions/contributions:null};
 let cumEq=0,lastEqNegative=-1;eqFlows.forEach((v,i)=>{cumEq+=v;if(cumEq<-.01)lastEqNegative=i;});baseEquity.payback=lastEqNegative===rows.length-1?null:lastEqNegative<0?0:lastEqNegative+1;
 return {project:{id:project.id,name:p.name,city:p.city,updated:project.updated},params:p,totals:t,cutoff:end,rows,row,funding:f,equity:baseEquity,completion,baselineLabel,baselineError,sales:actualComparison(project.actuals?.sales,baseline,end,'sales'),work:actualComparison(project.actuals?.work,baseline,end,'work'),deliverables:deliverables(p,result,end),period:{receipts:sum(period,'received'),operatingCosts:sum(period,'operatingCost'),capitalIn:sum(period,'capitalIn'),capitalOut:sum(period,'capitalOut'),bank:row.bank,identityResidual:sum(period,'received')+sum(period,'capitalIn')-sum(period,'operatingCost')-sum(period,'capitalOut')-number(row.bank)},cycle:{receipts:sum(rows,'received'),operatingCosts:sum(rows,'operatingCost'),capitalIn:sum(rows,'capitalIn'),capitalOut:sum(rows,'capitalOut'),bank:rows.at(-1).bank,identityResidual:sum(rows,'received')+sum(rows,'capitalIn')-sum(rows,'operatingCost')-sum(rows,'capitalOut')-number(rows.at(-1).bank)},paymentPlans:result.paymentPlans||[]};
}
E.performance={uid,statuses,presets,readRegister,normalizeItems,addPreset,stageRefs,deliverables,cashRows,funding,defaultCutoff,actualComparison,performance};
})(typeof window!=='undefined'?window:globalThis);
