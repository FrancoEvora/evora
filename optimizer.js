
'use strict';
/* Scenario search in temporary project copies; no mutation of the active study. */
let optCandidates=[],optSelected=-1,optSource=null,optToken=0,optRunning=false;
function optInputs(){return {mode:$('optMode').value,f:Number($('optFront').value),d:Number($('optDepth').value),min:Number($('optMin').value),wmin:Number($('optRoadMin').value),wmax:Number($('optRoadMax').value),maxBlock:Number($('optBlockLen').value),rows:Number($('optRows').value),objective:$('optObjective').value,rotate:$('optRotate').checked,flex:$('optFlex').checked}}
function optValid(s){return ['new','keep'].includes(s.mode)&&['area','lots','balance'].includes(s.objective)&&[s.f,s.d,s.min,s.wmin,s.wmax,s.maxBlock].every(Number.isFinite)&&s.f>=2&&s.f<=100&&s.d>=5&&s.d<=150&&s.min>=10&&s.min<=20000&&s.wmin>=5&&s.wmax>=s.wmin&&s.wmax<=40&&s.maxBlock>=Math.max(25,s.f)&&s.maxBlock<=500&&[1,2].includes(s.rows)&&(s.f*s.d>=s.min-1e-6||s.flex&&s.f*1.2*s.d>=s.min-1e-6)}
function optAngle(a){return ((a%180)+180)%180}
function optSpecs(q,s){
 const ring=q.boundary.pts,edges=ring.map((a,i)=>({a,b:ring[(i+1)%ring.length],l:dist(a,ring[(i+1)%ring.length])})).sort((a,b)=>b.l-a.l),base=optAngle(bearing(edges[0].a,edges[0].b)),angles=[base];
 if(s.rotate)for(const x of [base+90,base+15,base-15,0,90]){const a=optAngle(x);if(angles.every(b=>Math.min(Math.abs(a-b),180-Math.abs(a-b))>4))angles.push(a);if(angles.length>=4)break}
 const widths=s.wmax-s.wmin>.01?[s.wmin,s.wmax]:[s.wmin],short=Math.max(s.f*2,Math.floor(s.maxBlock*.72/s.f)*s.f),lens=[s.maxBlock];if(short<s.maxBlock-1)lens.push(short);
 const a=[];for(const w of widths)for(const angle of angles)for(const maxBlock of lens)for(const phase of [0,.5])a.push({angle,w,maxBlock,phase});
 return a.length<=24?a:Array.from({length:24},(_,i)=>a[Math.round(i*(a.length-1)/23)]);
}
function optSubtract(a,lo,hi){return a.flatMap(([x,y])=>hi<=x||lo>=y?[[x,y]]:[...(lo>x+1e-6?[[x,Math.min(lo,y)]]:[]),...(hi<y-1e-6?[[Math.max(hi,x),y]]:[])])}
function optPositions(lo,hi,w,target,minClear,phase,longRows){
 const span=hi-lo;if(span<2*w+minClear-1e-6)return [];
 let n=longRows?Math.max(1,Math.floor((span-w)/(target+w)+1e-8)):Math.max(1,Math.ceil((span-w)/(target+w)-1e-8));if(n>80)throw Error('Divida a gleba em setores.');
 while(n>1&&(span-(n+1)*w)/n<minClear-1e-6)n--;
 const available=(span-(n+1)*w)/n,clear=longRows?Math.min(target,available):available;
 if(clear<minClear-1e-6||!longRows&&clear>target+.01)return [];
 const extra=Math.max(0,span-((n+1)*w+n*clear)),start=lo+w/2+extra*phase;
 return Array.from({length:n+1},(_,i)=>start+i*(clear+w));
}
function optDuplicate(a,b,r,w){const u=norm(sub(b,a)),pts=roadPts(r);for(let i=1;i<pts.length;i++){const x=pts[i-1],y=pts[i];if(Math.abs(dot(u,norm(sub(y,x))))<.995)continue;if([a,b,lerp(a,b,.5)].every(v=>dist(v,nearest(v,x,y))<(w+r.width)/2+.01))return true}return false}
function optGenerateRoads(q,s,spec){
 const origin=q.boundary.pts[0],rad=spec.angle*Math.PI/180,u=[Math.cos(rad),-Math.sin(rad)],v=perp(u),uv=pt=>[dot(sub(pt,origin),u),dot(sub(pt,origin),v)],xy=pt=>add(origin,add(mul(u,pt[0]),mul(v,pt[1])));
 const rings=[q.boundary.pts,...(q.boundary.holes||[])].map(a=>a.map(uv)),b=bbox(rings[0]),w=spec.w,half=w/2;
 // Expanded bounding boxes provide conservative clearance around restrictions and retained properties.
 const restrictions=[...q.zones,...q.blocks.filter(b=>!b.auto),...q.lots].map(o=>bbox(o.pts.map(uv))).concat(rings.slice(1).map(bbox));
 const xs=optPositions(b[0],b[2],w,spec.maxBlock,s.f,spec.phase,false),ys=optPositions(b[1],b[3],w,s.rows*s.d,s.rows*s.d*(s.flex?.85:1),spec.phase,true);
 if(xs.length<2||ys.length<2)return [];
 let roads=[],seq=q.roads.length;
 function line(axis,value){
  const r=axis===1?rings:rings.map(a=>a.map(v=>[v[1],v[0]])),bounds=bbox(r[0]),eps=1e-7,py=clamp(value,bounds[1]+eps,bounds[3]-eps);
  let intervals=parcelIntervalsAt(r,py);
  for(const z of restrictions){const box=axis===1?z:[z[1],z[0],z[3],z[2]];if(value>box[1]-half-.05&&value<box[3]+half+.05)intervals=optSubtract(intervals,box[0]-half-.05,box[2]+half+.05)}
  for(const [lo,hi] of intervals){if(hi-lo<Math.max(w*1.5,s.f))continue;const a=xy(axis===1?[lo,value]:[value,lo]),b=xy(axis===1?[hi,value]:[value,hi]);if(q.roads.some(r=>optDuplicate(a,b,r,w)))continue;roads.push({id:uid(),name:'Via proposta '+String(++seq).padStart(2,'0'),pts:[a,b],width:w,cls:'Local',smooth:false,optimized:true})}
 }
 for(const y of ys)line(1,y);for(const x of xs)line(0,x);
 if(roads.length>160)throw Error('Mais de 160 trechos; divida a gleba em setores.');
 return roads;
}
function optNetwork(q){
 const roads=q.roads,parents=roads.map((_,i)=>i),root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i]}return i};
 const segs=roads.map(r=>{let pts=roadPts(r);return {w:r.width/2,a:pts.slice(1).map((b,i)=>[pts[i],b]),b:bbox(pts)}});
 for(let i=0;i<roads.length;i++)for(let j=i+1;j<roads.length;j++){let a=segs[i],b=segs[j],w=a.w+b.w;if(a.b[2]+w<b.b[0]||b.b[2]+w<a.b[0]||a.b[3]+w<b.b[1]||b.b[3]+w<a.b[1])continue;let connected=a.a.some(([x,y])=>b.a.some(([z,t])=>segmentIntersection(x,y,z,t)||Math.min(dist(x,nearest(x,z,t)),dist(y,nearest(y,z,t)),dist(z,nearest(z,x,y)),dist(t,nearest(t,x,y)))<=w+.01));if(connected)parents[root(i)]=root(j)}
 for(const r of q.rounds){let hits=[];for(let i=0;i<segs.length;i++)if(segs[i].a.some(([a,b])=>dist(r.c,nearest(r.c,a,b))<=r.r+segs[i].w))hits.push(i);for(let i=1;i<hits.length;i++)parents[root(hits[i])]=root(hits[0])}
 return new Set(roads.map((_,i)=>root(i))).size;
}
function optRoadArea(q,prep){const B=q.boundary,A=polyArea(B),b=bbox(B.pts),dx=b[2]-b[0],dy=b[3]-b[1],step=Math.max(.5,Math.sqrt(dx*dy/9000),dx/180,dy/180);let n=0,r=0;for(let y=b[1]+step/2;y<b[3];y+=step)for(let x=b[0]+step/2;x<b[2];x+=step){const v=[x,y];if(insideObj(v,B)){n++;if(onRoad(v,prep))r++}}return n?A*r/n:0}
function optEvaluate(source,s,spec){
 const q=cp({...source,image:null});q.image=source.image;
 if(s.mode==='new'){q.roads=[];q.rounds=[];q.blocks=[];q.lots=[]}
 // In keep mode, keep previous automatic blocks for stable IDs during reconciliation.
 q.params={...q.params,autoQuadras:true,edgeQuadras:true,minQuadra:Math.max(1,Math.min(q.params.minQuadra||100,s.min*.5))};
 const generated=spec.baseline?[]:optGenerateRoads(q,s,spec);if(!spec.baseline&&!generated.length)return null;
 q.roads.push(...generated);
 const original=p;try{
  p=q;if(!syncBlocks(q)||!q.blocks.length)return null;
  const opts={f:s.f,d:s.d,min:s.min,rows:s.rows,direction:'auto',angle:0,inset:0,road:true,tolerance:Math.max(1,Math.min(3,q.params.parcelRoadTolerance||3)),fit:!!s.flex,flexDepth:!!s.flex,replace:false,quick:true};
  const oldCount=q.lots.length,plan=computeParcel(q.blocks.map(b=>b.id),opts);if(plan.truncated)return null;
  q.lots.push(...plan.lots);if(!q.lots.length)return null;
  // Also relink preserved manually drawn lots that had no block association.
  if(s.mode==='keep')for(const l of q.lots.slice(0,oldCount)){const b=q.blocks.find(b=>b.id===l.blockId&&qLotFits(l,b))||q.blocks.find(b=>qLotFits(l,b));if(b){l.blockId=b.id;delete l.blockConflict;delete l.previousBlockId}else{l.previousBlockId=l.blockId||l.previousBlockId;delete l.blockId;l.blockConflict=true}}
  Object.assign(q.params,{lotFront:s.f,lotDepth:s.d,lotRows:s.rows,parcelMinArea:s.min,parcelFlexDepth:!!s.flex,parcelFit:!!s.flex});
  const A=polyArea(q.boundary),validLots=q.lots.filter(l=>!l.blockConflict),lotArea=validLots.reduce((n,l)=>n+polyArea(l),0),roadLen=q.roads.reduce((n,r)=>n+length(roadPts(r)),0),roadArea=optRoadArea(q,prepared()),components=optNetwork(q),conflicts=q.lots.length-validLots.length;
  return {spec,q,lotCount:validLots.length,newLots:plan.lots.length,blockCount:q.blocks.length,lotArea,roadLen,roadArea,yield:lotArea/A*100,roadPct:roadArea/A*100,components,conflicts,area:A,rows2:plan.results.filter(r=>r.rows?.length===2&&r.rows.every(a=>a.count>0)).length};
 }finally{p=original}
}
function optRank(a,s){const score=o=>s.objective==='lots'?o.lotCount:s.objective==='balance'?o.lotArea-.4*o.roadArea:o.lotArea,rank=o=>[o.conflicts,o.components>1?1:0,-score(o),-o.lotArea,o.components,o.roadLen];return a.slice().sort((x,y)=>{let a=rank(x),b=rank(y);for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>1e-7)return a[i]-b[i];return 0})}
function optDistinct(a){const keys=new Set();return a.filter(o=>{let key=[Math.round(o.lotArea*100),o.lotCount,o.blockCount,Math.round(o.roadLen*10),Math.round(o.roadArea*10),o.components].join('|');if(keys.has(key))return false;keys.add(key);return true})}
function optRenderPreview(c){
 const svg=$('optPreview');if(!c){svg.setAttribute('viewBox','0 0 500 280');svg.innerHTML='<text x="250" y="140" text-anchor="middle" fill="#6f8580" font-size="14">Gere alternativas para visualizar a implantação.</text>';return}
 const q=c.q,b=bbox(q.boundary.pts),dx=b[2]-b[0],dy=b[3]-b[1],pad=Math.max(dx,dy)*.045+2,z=520/Math.max(dx+2*pad,dy+2*pad),line=1/z;
 svg.setAttribute('viewBox',[b[0]-pad,b[1]-pad,dx+2*pad,dy+2*pad].join(' '));
 let h='<defs><clipPath id="optBoundaryClip"><path d="'+polyPath(q.boundary)+'" fill-rule="evenodd" clip-rule="evenodd"/></clipPath></defs><path d="'+polyPath(q.boundary)+'" fill="#dae5cf" fill-rule="evenodd" stroke="#55785b" stroke-width="'+line+'"/><g clip-path="url(#optBoundaryClip)">';
 for(const o of q.blocks)h+='<path d="'+polyPath(o)+'" fill="#c2d6ac" fill-rule="evenodd" stroke="#829a69" stroke-width="'+.5*line+'"/>';
 for(const o of q.zones)h+='<path d="'+polyPath(o)+'" fill="'+(zoneTypes[o.kind]||zoneTypes.other)[1]+'" fill-rule="evenodd" stroke="#567964" stroke-width="'+line+'"/>';
 for(const l of q.lots)h+='<path d="'+polyPath(l)+'" fill="'+(l.blockConflict?'#df927e':l.parcelRow===2?'#d5c28b':'#ead5a2')+'" stroke="#92794b" stroke-width="'+.42*line+'"/>';
 for(const r of q.roads)h+='<path d="'+path(roadPts(r))+'" fill="none" stroke="#f7f9f3" stroke-width="'+(r.width+line)+'" stroke-linecap="round" stroke-linejoin="round"/>';
 for(const r of q.roads)h+='<path d="'+path(roadPts(r))+'" fill="none" stroke="#8f9ca0" stroke-width="'+r.width+'" stroke-linecap="round" stroke-linejoin="round"/>';
 for(const r of q.rounds)h+='<circle cx="'+r.c[0]+'" cy="'+r.c[1]+'" r="'+r.r+'" fill="#8f9ca0"/><circle cx="'+r.c[0]+'" cy="'+r.c[1]+'" r="'+(r.r-r.w)+'" fill="#91ae79"/>';
 for(const o of q.blocks){const pt=blockStats(o).anchor;if(pt.clearance*z>14)h+='<text x="'+pt.v[0]+'" y="'+pt.v[1]+'" fill="#26473a" stroke="#f8faf5" paint-order="stroke" stroke-width="'+2*line+'" font-size="'+9*line+'" text-anchor="middle">'+esc(o.name)+'</text>'}
 svg.innerHTML=h+'</g>';
}
function optMetric(label,value){return '<div class="opt-metric"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>'}
function optRender(){
 $('optCount').textContent=optCandidates.length?optCandidates.length+' alternativas exibidas':'';
 $('optAlternatives').innerHTML=optCandidates.map((c,i)=>'<button class="opt-choice '+(i===optSelected?'on':'')+'" data-opt-index="'+i+'"><span class="opt-tag">'+(i===0?'Melhor encontrada':'Alternativa '+(i+1))+'</span><strong>'+fmt(c.lotCount)+' lotes · '+fmt(c.yield,1)+'%</strong><span>'+(c.spec.baseline?'Traçado atual':fmt(c.spec.angle,0)+'° · via '+fmt(c.spec.w,1)+' m')+'<br>'+c.blockCount+' quadras · '+fmt(c.roadLen,0)+' m de vias'+(c.components>1?' · '+c.components+' redes':'')+'</span></button>').join('');
 const c=optCandidates[optSelected];optRenderPreview(c);
 $('optMetrics').innerHTML=c?[optMetric('Área em lotes',fmt(c.lotArea,0)+' m²'),optMetric('Aproveitamento',fmt(c.yield,1)+'%'),optMetric('Quadras / lotes',c.blockCount+' / '+c.lotCount),optMetric('Área viária estimada',fmt(c.roadPct,1)+'%'),optMetric('Extensão viária',fmt(c.roadLen,0)+' m'),optMetric('Quadras com duas fileiras novas',String(c.rows2)),optMetric('Redes internas',String(c.components)),optMetric('Lotes preservados em conflito',String(c.conflicts)),optMetric('Novos lotes',String(c.newLots))].join(''):'';
 $('optApply').disabled=!c||optRunning;$('optExport').disabled=!c||optRunning;
 $('optApplyNote').textContent=c&&c.components>1?'Atenção: faixas viárias desconectadas. Revise as conexões. Original será arquivado.':'Seu projeto original ficará arquivado em Projetos ao aplicar.';
}
function optReset(){optToken++;optRunning=false;optCandidates=[];optSelected=-1;optSource=null;$('optRun').disabled=false;$('optCancel').disabled=true;optRender()}
function optStatus(message,warn=false){$('optStatus').textContent=message;$('optStatus').classList.toggle('warn',warn)}
function openOptimizer(){
 if(!p.boundary){toast('Desenhe ou importe o perímetro da gleba antes de otimizar.');return}
 closeParcel();setMode('select');optReset();
 $('optPreset').innerHTML='<option value="custom">Personalizado / atual</option>'+parcelPresets().map((s,i)=>'<option value="'+i+'">'+esc(s.name)+'</option>').join('');$('optPreset').value='custom';
 $('optMode').value='new';$('optFront').value=p.params.lotFront||12;$('optDepth').value=p.params.lotDepth||30;$('optMin').value=p.params.parcelMinArea||Number($('optFront').value)*Number($('optDepth').value);
 $('optRoadMin').value=clamp(n(p.params.width,14),5,40);$('optRoadMax').value=clamp(n(p.params.width,14)+2,5,40);$('optBlockLen').value=120;$('optRows').value=String(p.params.lotRows||2);$('optObjective').value='area';$('optRotate').checked=true;$('optFlex').checked=true;
 $('optModeNote').textContent='Preserva gleba e áreas especiais. O original permanece intacto durante a busca.';optStatus('Defina os parâmetros e gere as alternativas.');$('optimizerDialog').showModal();
}
function closeOptimizer(){optReset();if($('optimizerDialog').open)$('optimizerDialog').close()}
function optRun(){
 if(optRunning)return;const s=optInputs();if(!optValid(s)){optStatus('Revise dimensões, área mínima e limites das vias.',true);return}if(!p.boundary){optStatus('A gleba não está definida.',true);return}
 const source=cp(p);let specs=optSpecs(source,s);if(s.mode==='keep')specs=[{baseline:true,angle:0,w:s.wmin,maxBlock:s.maxBlock,phase:0},...specs];
 optReset();optSource=snapshot();const token=++optToken;optRunning=true;$('optRun').disabled=true;$('optCancel').disabled=false;optStatus('Analisando '+specs.length+' configurações…');
 let idx=0,found=[],errors=0;
 function step(){
  if(token!==optToken)return;
  if(idx>=specs.length){optRunning=false;$('optRun').disabled=false;$('optCancel').disabled=true;optCandidates=optDistinct(optRank(found,s)).slice(0,6);optSelected=optCandidates.length?0:-1;optRender();optStatus(optCandidates.length?'Busca concluída: '+specs.length+' configurações avaliadas, '+found.length+' com lotes válidos'+(errors?' · '+errors+' não processadas':'')+'. A primeira é a melhor encontrada.':'Nenhuma alternativa com lotes válidos. Ajuste dimensões e restrições'+(errors?' ('+errors+' configurações não processadas)':'')+'.',!optCandidates.length);return}
  try{const c=optEvaluate(source,s,specs[idx]);if(c&&c.lotCount)found.push(c)}catch(e){errors++}
  idx++;optStatus('Analisando '+idx+' / '+specs.length+' · '+found.length+' válidas.');
  if(idx%3===0||idx===specs.length){optCandidates=optDistinct(optRank(found,s)).slice(0,6);optSelected=optCandidates.length?0:-1;optRender()}
  setTimeout(step,0);
 }
 setTimeout(step,0);
}
function optApply(){
 const c=optCandidates[optSelected];if(!c||optRunning)return;
 if(optSource!==snapshot()){optStatus('O projeto foi alterado. Gere novas alternativas.',true);return}
 if(!confirm('Aplicar esta alternativa como novo estudo? O original será arquivado e a operação poderá ser desfeita. '+(c.components>1?'Existem redes desconectadas. ':'')))return;
 try{const a=libraryRead();a.push({id:uid(),name:p.name+' · original',updated:Date.now(),data:snapshot()});localStorage.setItem(libraryKey,JSON.stringify(a))}catch(e){optStatus('Não foi possível arquivar o original. Exporte o JSON e libere armazenamento.',true);return}
 const q=cp(c.q);q.name=p.name+' · Alternativa '+(optSelected+1);closeOptimizer();openState(q);toast('Alternativa aplicada. Estudo original arquivado em Projetos.');
}
function installOptimizer(){
 $('optimizePlan').onclick=openOptimizer;$('optClose').onclick=closeOptimizer;$('optimizerDialog').addEventListener('cancel',e=>{e.preventDefault();closeOptimizer()});
 $('optPreset').onchange=()=>{let s=parcelPresets()[Number($('optPreset').value)];if(s&&$('optPreset').value!=='custom'){$('optFront').value=s.f;$('optDepth').value=s.d;$('optMin').value=s.min;$('optRows').value=String(s.rows)}optReset();optStatus('Parâmetros atualizados. Gere novas alternativas.')};
 for(const id of ['optMode','optFront','optDepth','optMin','optRoadMin','optRoadMax','optBlockLen','optRows','optObjective','optRotate','optFlex'])$(id).addEventListener('change',()=>{if(['optFront','optDepth','optMin','optRows'].includes(id))$('optPreset').value='custom';$('optModeNote').textContent=$('optMode').value==='keep'?'Mantém vias, rotatórias, lotes e quadras manuais. Novas vias evitam interferências.':'Preserva gleba e áreas especiais; o desenho atual ficará arquivado ao aplicar.';optReset();optStatus('Parâmetros atualizados. Gere novas alternativas.')});
 $('optRun').onclick=optRun;$('optCancel').onclick=()=>{optToken++;optRunning=false;$('optRun').disabled=false;$('optCancel').disabled=true;optRender();optStatus('Busca interrompida. Compare as alternativas já avaliadas.')};
 $('optAlternatives').onclick=e=>{let i=Number(e.target.closest('[data-opt-index]')?.dataset.optIndex);if(Number.isInteger(i)&&optCandidates[i]){optSelected=i;optRender()}};
 $('optExport').onclick=()=>{const c=optCandidates[optSelected];if(!c)return;let q=cp(c.q);q.name=p.name+' · Alternativa '+(optSelected+1);download(filename()+'_alternativa_'+(optSelected+1)+'.json',JSON.stringify(q,null,2),'application/json')};
 $('optApply').onclick=optApply;
}
