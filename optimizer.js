
'use strict';
/* Scenario search in temporary project copies; no mutation of the active study. */
let optCandidates=[],optSelected=-1,optSource=null,optToken=0,optRunning=false;

/* One shared validation contract, with locale-aware numeric fields and actionable diagnostics. */
const OPT_NUMERIC={f:{id:'optFront',label:'Testada',lo:2,hi:200,unit:'m'},d:{id:'optDepth',label:'Profundidade',lo:2,hi:300,unit:'m'},min:{id:'optMin',label:'Área mínima',lo:4,hi:60000,unit:'m²'},wmin:{id:'optRoadMin',label:'Largura mínima das vias',lo:1,hi:100,unit:'m'},wmax:{id:'optRoadMax',label:'Largura máxima das vias',lo:1,hi:100,unit:'m'},maxBlock:{id:'optBlockLen',label:'Comprimento máximo da quadra',lo:2,hi:2000,unit:'m'}};
function optNumber(raw){
 let x=String(raw??'').trim().replace(/\u00a0/g,' ');
 if(!x)return NaN;
 // Brazilian grouping is accepted only when the decimal comma disambiguates it.
 if(/^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/.test(x))x=x.replace(/\./g,'').replace(',','.');
 else if(/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(x))x=x.replace(',','.');
 else return NaN;
 const v=Number(x);return Number.isFinite(v)?v:NaN;
}
function optRoundUp(x){return Math.ceil((x-1e-9)*100)/100}
function optInputs(){
 const v={mode:$('optMode').value,rows:optNumber($('optRows').value),objective:$('optObjective').value,rotate:$('optRotate').checked,flex:$('optFlex').checked};
 for(const [k,r] of Object.entries(OPT_NUMERIC))v[k]=optNumber($(r.id).value);
 v.roadShare=optNumber($('optRoadShare').value);v.morphology=$('optMorphology').value;v.bendMode=$('optBend').value;v.adaptive=$('optAdaptiveLots').checked;v.cornerRadius=optNumber($('optCornerRadius').value);v.finishCorners=$('optFinishCorners').checked;v.accessEdge=$('optAccess').value===''?null:Number($('optAccess').value);return urbanInputs(v);
}
function optDiagnostics(s){
 const issues=[],add=(keys,message,fix)=>issues.push({keys,message,fix}),ok=k=>Number.isFinite(s[k])&&s[k]>=OPT_NUMERIC[k].lo&&s[k]<=OPT_NUMERIC[k].hi;
 for(const [k,r] of Object.entries(OPT_NUMERIC)){
  if(!Number.isFinite(s[k]))add([k],r.label+': informe um número válido (ex.: 12,5).');
  else if(!ok(k))add([k],r.label+': use de '+fmt(r.lo,0)+' a '+fmt(r.hi,0)+' '+r.unit+'.');
 }
 if(s.roadShare!==undefined&&(!Number.isFinite(s.roadShare)||s.roadShare<5||s.roadShare>85))add(['roadShare'],'Ocupação viária máxima: informe um percentual de 5 a 85.');
 if(s.cornerRadius!==undefined&&(!Number.isFinite(s.cornerRadius)||s.cornerRadius<0||s.cornerRadius>20))add(['cornerRadius'],'Raio de esquina: informe um valor de 0 a 20 m.');
 if(!['new','keep'].includes(s.mode))add(['mode'],'Selecione uma estratégia.');
 if(!['area','lots','balance','urban'].includes(s.objective))add(['objective'],'Selecione uma prioridade.');
 if(![1,2].includes(s.rows))add(['rows'],'Selecione uma ou duas fileiras.');
 if(ok('wmin')&&ok('wmax')&&s.wmax<s.wmin-1e-8)add(['wmax'],'Via máxima ('+fmt(s.wmax,2)+' m) não pode ser menor que a mínima ('+fmt(s.wmin,2)+' m).','width');
 if(ok('f')&&ok('d')&&ok('min')){
  const nominal=s.f*s.d,cap=nominal*(s.flex?1.2:1);
  if(s.min>cap+1e-6){
   const d=optRoundUp(s.min/s.f),f=optRoundUp(s.min/s.d);
   const suggestion=d<=300?' Para manter a área mínima, a profundidade sugerida é '+fmt(d,2)+' m.':f<=200?' Para manter a área mínima, a testada sugerida é '+fmt(f,2)+' m.':' Revise as dimensões em conjunto.';
   add(['f','d','min'],'Área mínima de '+fmt(s.min,2)+' m² incompatível com '+fmt(s.f,2)+' × '+fmt(s.d,2)+' m (capacidade '+fmt(cap,2)+' m²'+(s.flex?' com ajuste de testada':'')+').'+suggestion,d<=300||f<=200?'area':null);
  }
 }
 if(ok('f')&&ok('maxBlock')){
  const required=ok('d')&&ok('min')&&s.flex?Math.max(s.f,s.min/s.d):s.f;
  if(s.maxBlock<required-1e-7)add(['maxBlock'],'Comprimento máximo da quadra ('+fmt(s.maxBlock,2)+' m) precisa comportar ao menos uma testada de '+fmt(optRoundUp(required),2)+' m.','block');
 }
 return issues.concat(urbanDiagnostics(s));
}
function optValid(s){return optDiagnostics(s).length===0}
function optSuggested(s){
 const q={...s},changes=[],diagnostics=optDiagnostics(s);
 if(diagnostics.some(x=>x.fix==='area')){
  let depth=optRoundUp(q.min/q.f),front=optRoundUp(q.min/q.d);
  if(depth>=2&&depth<=300){q.d=depth;changes.push('profundidade: '+fmt(depth,2)+' m')}
  else if(front>=2&&front<=200){q.f=front;changes.push('testada: '+fmt(front,2)+' m')}
 }
 if(diagnostics.some(x=>x.fix==='width')){q.wmax=q.wmin;changes.push('via máxima: '+fmt(q.wmax,2)+' m')}
 const needed=q.flex&&Number.isFinite(q.min)&&q.d>0?Math.max(q.f,q.min/q.d):q.f;
 if(Number.isFinite(q.maxBlock)&&q.maxBlock<needed&&needed<=2000&&needed>=2&&q.maxBlock>=2){q.maxBlock=optRoundUp(needed);changes.push('quadra máxima: '+fmt(q.maxBlock,2)+' m')}
 return {values:q,changes};
}
function optRefreshValidation(){
 const s=optInputs(),issues=optDiagnostics(s),keys=new Set(issues.flatMap(i=>i.keys));
 for(const [k,r] of Object.entries(OPT_NUMERIC))$(r.id).setAttribute('aria-invalid',keys.has(k)?'true':'false');
 $('optRoadShare').setAttribute('aria-invalid',keys.has('roadShare')?'true':'false');
 $('optRoadWarning').textContent=s.wmax>24?'Atenção: vias acima de 24 m são uma escolha excepcional nesta malha. Confira a hierarquia viária e os custos.':s.wmax>s.d?'Confira a proporção entre faixa viária e profundidade do lote.':'';
 urbanRefreshForm(s,keys);
 $('optCornerRadius').setAttribute('aria-invalid',keys.has('cornerRadius')?'true':'false');const info=$('optAreaInfo');
 if(Number.isFinite(s.f)&&Number.isFinite(s.d)&&s.f>0&&s.d>0){
  const nominal=s.f*s.d,extra=s.flex?nominal*1.2:nominal;
  info.innerHTML='<b>Área nominal: '+fmt(nominal,2)+' m²</b>'+(s.flex?'<small>Com flexibilidade de testada: até '+fmt(extra,2)+' m² na profundidade indicada.</small>':'')+(s.flex&&Number.isFinite(s.min)&&s.min>nominal+1e-6&&s.min<=extra+1e-6?'<small>Serão necessárias testadas de pelo menos '+fmt(optRoundUp(s.min/s.d),2)+' m.</small>':'');
 }else info.textContent='Informe a testada e a profundidade para calcular a área.';
 $('optValidation').classList.toggle('hidden',!issues.length);
 $('optValidation').innerHTML=issues.length?'<b>Confira os parâmetros:</b><ul>'+issues.map(x=>'<li>'+esc(x.message)+'</li>').join('')+'</ul>':'';
 $('optFix').classList.toggle('hidden',!optSuggested(s).changes.length);
 return issues;
}
function optSyncLinkedArea(){if(!$('optLinkArea').checked)return;const f=optNumber($('optFront').value),d=optNumber($('optDepth').value);if(Number.isFinite(f)&&Number.isFinite(d)&&f>0&&d>0)$('optMin').value=String(Math.round(f*d*1000000)/1000000)}
function optFixForm(){
 const result=optSuggested(optInputs());
 if(!result.changes.length)return;
 optReset();for(const [k,r] of Object.entries(OPT_NUMERIC))if(Number.isFinite(result.values[k]))$(r.id).value=String(result.values[k]);
 $('optLinkArea').checked=false;$('optPreset').value='custom';
 const errors=optRefreshValidation();
 optStatus('Ajustes aplicados no formulário: '+result.changes.join('; ')+'. Área mínima e largura mínima preservadas.'+(errors.length?' Revise os campos restantes.':' Clique em Gerar alternativas.'),!!errors.length);
}

function optAngle(a){return ((a%180)+180)%180}
function optSpecs(q,s){
 const ring=q.boundary.pts,edges=ring.map((a,i)=>({a,b:ring[(i+1)%ring.length],l:dist(a,ring[(i+1)%ring.length])})).sort((a,b)=>b.l-a.l),base=optAngle(bearing(edges[0].a,edges[0].b)),angles=[base];
 if(s.rotate)for(const x of [base+90,base+15,base-15,0,90]){const a=optAngle(x);if(angles.every(b=>Math.min(Math.abs(a-b),180-Math.abs(a-b))>4))angles.push(a);if(angles.length>=4)break}
 const widths=s.wmax-s.wmin>.01?[s.wmin,s.wmax]:[s.wmin],short=Math.max(s.f*2,Math.floor(s.maxBlock*.72/s.f)*s.f),lens=[s.maxBlock];if(short<s.maxBlock-1)lens.push(short);
 const a=[];for(const w of widths)for(const angle of angles)for(const maxBlock of lens)for(const pattern of ['perimeter','internal'])a.push({angle,w,maxBlock,phase:.5,pattern});
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

/* Internal streets need no redundant parallel street at the boundary. Edge blocks may be single-loaded. */
function optInteriorPositions(lo,hi,w,target,minClear,longRows){
 const span=hi-lo,margin=longRows?Math.max(minClear/2,target/2):Math.max(minClear,Math.min(target/2,span/3));
 if(span<w+2*margin-1e-6)return [];
 const available=span-2*margin-w,n=Math.max(1,Math.ceil(available/(target+w)-1e-8)+1);
 if(n>80)throw Error('Divida a gleba em setores.');
 const gap=n>1?available/(n-1):0;
 if(n>1&&gap-w<minClear-1e-6){let nn=Math.max(1,Math.floor(available/(minClear+w)+1e-8)+1);if(nn===1)return [(lo+hi)/2];return Array.from({length:nn},(_,i)=>lo+margin+w/2+i*available/(nn-1))}
 return n===1?[(lo+hi)/2]:Array.from({length:n},(_,i)=>lo+margin+w/2+i*gap);
}
function optGenerateRoads(q,s,spec){
 const origin=q.boundary.pts[0],rad=spec.angle*Math.PI/180,u=[Math.cos(rad),-Math.sin(rad)],v=perp(u),uv=pt=>[dot(sub(pt,origin),u),dot(sub(pt,origin),v)],xy=pt=>add(origin,add(mul(u,pt[0]),mul(v,pt[1])));
 const rings=[q.boundary.pts,...(q.boundary.holes||[])].map(a=>a.map(uv)),b=bbox(rings[0]),w=spec.w,half=w/2;
 const restrictions=[...q.zones,...q.blocks.filter(b=>!b.auto),...q.lots].map(o=>bbox(o.pts.map(uv))).concat(rings.slice(1).map(bbox));
 const minFront=s.flex?Math.max(s.f,s.min/s.d):s.f,minDepth=s.flex?Math.max(s.d*.85,s.min/(s.f*1.2)):s.d,internal=spec.pattern==='internal';
 const xs=internal?optInteriorPositions(b[0],b[2],w,spec.maxBlock,minFront,false):optPositions(b[0],b[2],w,spec.maxBlock,minFront,spec.phase,false);
 const ys=internal?optInteriorPositions(b[1],b[3],w,s.rows*s.d,s.rows*minDepth,true):optPositions(b[1],b[3],w,s.rows*s.d,s.rows*minDepth,spec.phase,true);
 if(!xs.length||!ys.length)return [];
 let roads=[],seq=q.roads.length;
 const collectorIndex=s.hierarchy?Math.floor(ys.length/2):-1;
 function line(axis,value,collector=false){
  const width=collector?Math.min(s.wmax,w+2):w,half=width/2;
  const r=axis===1?rings:rings.map(a=>a.map(v=>[v[1],v[0]])),bounds=bbox(r[0]);
  // Whole-width cross sections, not just the centerline, must fit in the domain.
  const y0=value-half,y1=value+half;if(y0<bounds[1]-1e-5||y1>bounds[3]+1e-5)return;
  let intervals=parcelBandIntervals(r,y0,y1);
  // Reserve room for round terminal caps. Interior networks connect at intersections.
  intervals=intervals.map(([a,b])=>[a+half,b-half]).filter(([a,b])=>b>a);
  for(const z of restrictions){const box=axis===1?z:[z[1],z[0],z[3],z[2]];if(value>box[1]-half-.05&&value<box[3]+half+.05)intervals=optSubtract(intervals,box[0]-half-.05,box[2]+half+.05)}
  for(const [lo,hi] of intervals){
   if(hi-lo<Math.max(w,s.f))continue;
   const a=xy(axis===1?[lo,value]:[value,lo]),b=xy(axis===1?[hi,value]:[value,hi]);
   if(q.roads.some(r=>optDuplicate(a,b,r,width)))continue;
   roads.push({id:uid(),name:(collector?'Via coletora ':'Via local ')+String(++seq).padStart(2,'0'),pts:[a,b],width,cls:collector?'Coletora':'Local',smooth:false,optimized:true});
  }
 }
 for(let i=0;i<ys.length;i++)line(1,ys[i],i===collectorIndex);for(const x of xs)line(0,x);
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
 if(s.mode==='new'){q.roads=[];q.rounds=[];q.blocks=[];q.lots=[];delete q.masterplan;if(s.publicProgram)q.zones=q.zones.filter(z=>!z.urbanGenerated)}
 // In keep mode, keep previous automatic blocks for stable IDs during reconciliation.
 q.params={...q.params,...(Number.isFinite(s.cornerRadius)?{junctionRadius:s.cornerRadius}:{}),autoQuadras:true,edgeQuadras:true,minQuadra:Math.max(1,Math.min(q.params.minQuadra||100,s.min*.5))};
 const generated=spec.baseline?[]:spec.organic?orgGenerate(q,s,spec):spec.master?mpGenerate(q,s,spec):optGenerateRoads(q,s,spec);if(!spec.baseline&&(!generated||!generated.length))return null;
 q.roads.push(...generated);
 const original=p;try{
  p=q;if(!syncBlocks(q)||!q.blocks.length)return null;
  if(spec.organic){if(!orgCore(q)||!syncBlocks(q)||!q.blocks.length)return null;}
  const edgeLots=spec.pattern==='active'?mpEdgeLots(q,s,prepared()):[];if(spec.pattern==='active'&&!edgeLots.length)return null;q.lots.push(...edgeLots);
  const program=urbanReserve(q,s);program.enabled=!!s.publicProgram;
  if(program.newZones.length&&(!syncBlocks(q)||!q.blocks.length))return null;
  const opts={f:s.f,d:s.d,min:s.min,rows:s.rows,direction:'auto',angle:0,inset:0,road:true,tolerance:Math.max(1,Math.min(3,q.params.parcelRoadTolerance||3)),fit:!!s.flex,flexDepth:!!s.flex,replace:false,quick:true,adaptive:!!s.adaptive&&s.flex,organic:!!spec.organic,edgeActive:spec.pattern==='active'};
  const oldCount=q.lots.length,plan=computeParcel(q.blocks.filter(b=>spec.pattern!=='active'||!b.edgeBlock).map(b=>b.id),opts);if(plan.truncated)return null;
  // Reject numerical inconsistencies before proposing lots, not after applying.
  const accepted=plan.lots.filter(l=>{const b=q.blocks.find(b=>b.id===l.blockId);return b&&qLotFits(l,b)});
  q.lots.push(...accepted);const infill=spec.pattern==='active'&&s.flex&&s.adaptive?mpInfill(q,s):[];const completion=s.finishCorners&&s.mode==='new'&&s.flex&&s.adaptive?jfComplete(q,s):{newLots:0,merged:0,area:0};if(!q.lots.length)return null;
  // Also relink preserved manually drawn lots that had no block association.
  if(s.mode==='keep')for(const l of q.lots.slice(0,oldCount)){const b=q.blocks.find(b=>b.id===l.blockId&&qLotFits(l,b))||q.blocks.find(b=>qLotFits(l,b));if(b){l.blockId=b.id;delete l.blockConflict;delete l.previousBlockId}else{l.previousBlockId=l.blockId||l.previousBlockId;delete l.blockId;l.blockConflict=true}}
  Object.assign(q.params,{lotFront:s.f,lotDepth:s.d,lotRows:s.rows,parcelMinArea:s.min,parcelFlexDepth:!!s.flex,parcelFit:!!s.flex});
  const A=polyArea(q.boundary),validLots=q.lots.filter(l=>!l.blockConflict),lotArea=validLots.reduce((n,l)=>n+polyArea(l),0),roadLen=q.roads.reduce((n,r)=>n+length(roadPts(r)),0),roadArea=optRoadArea(q,prepared()),components=optNetwork(q),conflicts=q.lots.length-validLots.length;
  if(s.publicProgram)q.urbanProgram={publicProgram:true,hierarchy:!!s.hierarchy,...Object.fromEntries(URBAN_CATEGORIES.map(c=>[c.key,s[c.key]]))};else if(s.publicProgram===false)q.urbanProgram={publicProgram:false,hierarchy:!!s.hierarchy,...Object.fromEntries(URBAN_CATEGORIES.map(c=>[c.key,s[c.key]]))};
  const access=urbanAccessibility(q,validLots);
  const c={spec,q,program,coverage:access.coverage,meanAccess:access.mean,lotCount:validLots.length,newLots:accepted.length+edgeLots.length+infill.length+completion.newLots,blockCount:q.blocks.length,lotArea,roadLen,roadArea,yield:lotArea/A*100,roadPct:roadArea/A*100,components,conflicts,area:A,rows2:q.blocks.filter(b=>accepted.some(l=>l.blockId===b.id&&l.parcelRow===1)&&accepted.some(l=>l.blockId===b.id&&l.parcelRow===2)).length};c.audit={...mpAudit(c),...orgStats(c),...jfStats(q),cornerCompletion:completion};if(spec.organic&&c.audit.curvedRoads<1)return null;if(spec.master&&(c.audit.ends>0||c.components!==1))return null;if(spec.pattern==='active'&&(conflicts||q.lots.some(l=>l.blockConflict)))return null;return c;
 }finally{p=original}
}
function optRank(a,s){const score=o=>s.objective==='lots'?o.lotCount:s.objective==='urban'?o.lotArea-.85*o.roadArea-.35*(o.program?.excess||0)+o.area*.14*(o.coverage||0)/100-.25*(o.audit?.residual||0)+.08*o.area*Math.min(1,(o.audit?.curvedLots||0)/Math.max(1,o.lotCount)):s.objective==='balance'?o.lotArea-.85*o.roadArea:o.lotArea,rank=o=>[o.program?.ok===false?1:0,o.conflicts,o.components>1?1:0,s.objective==='urban'?(o.audit?.ends||0):0,-score(o),-o.lotArea,o.components,o.roadLen];return a.slice().sort((x,y)=>{let a=rank(x),b=rank(y);for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>1e-7)return a[i]-b[i];return 0})}
function optDistinct(a){const keys=new Set();return a.filter(o=>{let key=[Math.round(o.lotArea*100),o.lotCount,o.blockCount,Math.round(o.roadLen*10),Math.round(o.roadArea*10),Math.round(o.coverage||0),o.components].join('|');if(keys.has(key))return false;keys.add(key);return true})}

function optRenderPreview(c){const svg=$('optPreview');if(!c){svg.setAttribute('viewBox','0 0 500 280');svg.innerHTML='<text x="250" y="140" text-anchor="middle" fill="#6f8580" font-size="14">Gere as alternativas para visualizar a implantação.</text>';return}const q=c.q,b=bbox(q.boundary.pts),dx=b[2]-b[0],dy=b[3]-b[1],pad=Math.max(dx,dy)*.045+2,scale=720/Math.max(dx+2*pad,dy+2*pad);svg.setAttribute('viewBox',[b[0]-pad,b[1]-pad,dx+2*pad,dy+2*pad].join(' '));svg.innerHTML=$('optPreviewStyle').value==='human'?huGraphic(q,scale,'preview3'):mpGraphic(q,scale,'preview')}
function optMetric(label,value){return '<div class="opt-metric"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>'}
function optRender(){
 $('optCount').textContent=optCandidates.length?optCandidates.length+' alternativas exibidas':'';
 $('optAlternatives').innerHTML=optCandidates.map((c,i)=>'<button class="opt-choice '+(i===optSelected?'on':'')+'" data-opt-index="'+i+'"><span class="opt-tag">'+(i===0?'Melhor encontrada':'Alternativa '+(i+1))+'</span><strong>'+fmt(c.lotCount)+' lotes · '+fmt(c.yield,1)+'%</strong><span>'+(c.spec.baseline?'Traçado atual':fmt(c.spec.angle,0)+'° · via '+fmt(c.spec.w,1)+' m · '+(c.spec.master?(c.spec.organic?'bairro-jardim orgânico':c.spec.pattern==='active'?'bordas ativas':c.spec.pattern==='garden'?'bairro-jardim':'circuito compacto'):(c.spec.pattern==='internal'?'malha interna':'perimetral')))+'<br>'+c.blockCount+' quadras · '+fmt(c.roadLen,0)+' m de vias · '+fmt(c.roadPct,1)+'% viário'+(c.components>1?' · '+c.components+' redes':'')+'</span></button>').join('');
 const c=optCandidates[optSelected];optRenderPreview(c);urbanReport(c);
 $('optMetrics').innerHTML=c?[optMetric('Área em lotes',fmt(c.lotArea,0)+' m²'),optMetric('Aproveitamento',fmt(c.yield,1)+'%'),optMetric('Quadras / lotes',c.blockCount+' / '+c.lotCount),optMetric('Área viária estimada',fmt(c.roadPct,1)+'%'),optMetric('Extensão viária',fmt(c.roadLen,0)+' m'),optMetric('Quadras com duas fileiras novas',String(c.rows2)),optMetric('Redes internas',String(c.components)),optMetric('Lotes preservados em conflito',String(c.conflicts)),optMetric('Novos lotes',String(c.newLots)),optMetric('Espaços públicos',fmt(Object.values(c.program?.areas||{}).reduce((a,b)=>a+b,0)/c.area*100,1)+'%'),optMetric('Lotes adaptativos',String(c.audit?.adaptive||0)),optMetric('Lotes de perímetro',String(c.audit?.edgeLots||0)),optMetric('Frentes curvas',String(c.audit?.curvedLots||0)),optMetric('Vias curvilíneas',String(c.audit?.curvedRoads||0)),optMetric('Esquinas concordadas',String(c.audit?.cornerCount||0)),optMetric('Raio mínimo aplicado',c.audit?.cornerCount?fmt(c.audit.minCornerRadius,1)+' m':'—'),optMetric('Lotes de ponta / sobras resolvidas',String((c.audit?.cornerCompletion?.newLots||0)+(c.audit?.cornerCompletion?.merged||0))),optMetric('Pontas viárias livres',String(c.audit?.ends||0)),optMetric('Acessos indicados',String(c.audit?.accessCount||0)),optMetric('Saldo / demais usos',fmt(c.audit?.residualPct||0,1)+'%')].join(''):'';
 $('optApply').disabled=!c||optRunning;$('optExport').disabled=!c||optRunning;$('optSheet').disabled=!c||optRunning;$('optHumanSheet').disabled=!c||optRunning;$('optHumanPNG').disabled=!c||optRunning;
 $('optApplyNote').textContent=c?.spec.master?(c.audit?.accessCount?'Acesso indicado: verifique a conexão externa. Original será arquivado.':'Circuito interno fechado; defina acessos externos. Original será arquivado.'):c&&c.components>1?'Atenção: faixas viárias desconectadas. Revise as conexões. Original será arquivado.':'Seu projeto original ficará arquivado em Projetos ao aplicar.';
}
function optReset(){optToken++;optRunning=false;optCandidates=[];optSelected=-1;optSource=null;$('optRun').disabled=false;$('optCancel').disabled=true;optRender()}
function optStatus(message,warn=false){$('optStatus').textContent=message;$('optStatus').classList.toggle('warn',warn)}
function openOptimizer(){
 if(!p.boundary){toast('Desenhe ou importe o perímetro da gleba antes de otimizar.');return}
 closeParcel();setMode('select');optReset();
 $('optPreset').innerHTML='<option value="custom">Personalizado / atual</option>'+parcelPresets().map((s,i)=>'<option value="'+i+'">'+esc(s.name)+'</option>').join('');$('optPreset').value='custom';
 $('optMode').value='new';$('optAccess').innerHTML='<option value="">A definir no projeto</option>'+p.boundary.pts.map((pt,i)=>'<option value="'+i+'">Divisa '+(i+1)+' · '+fmt(dist(pt,p.boundary.pts[(i+1)%p.boundary.pts.length]),1)+' m · '+fmt(bearing(pt,p.boundary.pts[(i+1)%p.boundary.pts.length]),0)+'°</option>').join('');$('optAccess').value='';$('optMorphology').value='organic';$('optBend').value='all';$('optBendField').classList.remove('hidden');$('optPreviewStyle').value='human';$('optAdaptiveLots').checked=true;$('optCornerRadius').value='5';$('optFinishCorners').checked=true;$('optMorphologyNote').textContent='Parque estruturador, vias curvilíneas contínuas e parcelamento em leque. Acessos externos a confirmar.';$('optFront').value=p.params.lotFront??12;$('optDepth').value=p.params.lotDepth??30;
 const nominal=optNumber($('optFront').value)*optNumber($('optDepth').value),savedMin=p.params.parcelMinArea;
 $('optMin').value=Number.isFinite(optNumber(savedMin))&&optNumber(savedMin)>0?savedMin:nominal;
 $('optLinkArea').checked=Math.abs(optNumber($('optMin').value)-nominal)<1e-6;
 // Local-road study defaults must not inherit the editor's arbitrary selected width.
 $('optRoadMin').value='12';$('optRoadMax').value='16';$('optRoadShare').value='35';$('optBlockLen').value=Math.max(120,optRoundUp(optNumber($('optFront').value)||12));$('optRows').value=String(p.params.lotRows||2);$('optObjective').value='urban';$('optRotate').checked=true;$('optFlex').checked=true;urbanInitForm();
 $('optModeNote').textContent='Preserva gleba e áreas especiais. O original permanece intacto durante a busca.';
 const initial=optSuggested(optInputs());
 if(initial.changes.length){for(const [k,r] of Object.entries(OPT_NUMERIC))if(Number.isFinite(initial.values[k]))$(r.id).value=String(initial.values[k]);$('optLinkArea').checked=false;}
 const issues=optRefreshValidation();optStatus(initial.changes.length?'Parâmetros iniciais ajustados: '+initial.changes.join('; ')+'. Mínimos preservados. Revise antes de gerar.':issues.length?'Confira os campos destacados.':'Parâmetros válidos. Clique em Gerar alternativas.',!!issues.length);$('optimizerDialog').showModal();
}
function closeOptimizer(){optReset();if($('optimizerDialog').open)$('optimizerDialog').close()}
function optRun(){
 if(optRunning)return;const s=optInputs(),issues=optRefreshValidation();if(issues.length){optStatus(issues[0].message,true);return}if(!p.boundary){optStatus('A gleba não está definida.',true);return}if(s.wmax>30&&!confirm('A malha inclui vias de mais de 30 m. Confirma esse parâmetro excepcional para o estudo?'))return;
 if(s.mode==='new'&&s.morphology==='active'&&!s.adaptive){optStatus('O partido de bordas ativas utiliza lotes adaptativos. Habilite a opção ou selecione outro partido.',true);return;}const source=cp(p);let specs=orgSpecs(source,s);if(Number.isInteger(s.accessEdge)&&s.mode==='new')specs=specs.filter(x=>x.master);if(s.mode==='keep')specs=[{baseline:true,angle:0,w:s.wmin,maxBlock:s.maxBlock,phase:0},...specs];
 optReset();optSource=snapshot();const token=++optToken;optRunning=true;$('optRun').disabled=true;$('optCancel').disabled=false;optStatus('Analisando '+specs.length+' configurações…');
 let idx=0,found=[],errors=0,overShare=0,overProgram=0,bestDeficit=Infinity;
 function step(){
  if(token!==optToken)return;
  if(idx>=specs.length){optRunning=false;$('optRun').disabled=false;$('optCancel').disabled=true;optCandidates=optDistinct(optRank(found,s)).slice(0,6);optSelected=optCandidates.length?0:-1;optRender();optStatus(optCandidates.length?'Busca concluída: '+specs.length+' configurações avaliadas, '+found.length+' com lotes válidos'+(errors?' · '+errors+' não processadas':'')+(overShare?' · '+overShare+' acima do limite viário':'')+(overProgram?' · '+overProgram+' abaixo das reservas públicas':'')+'. A primeira é a melhor encontrada.':(overProgram?'Nenhuma alternativa atendeu simultaneamente às reservas públicas e demais condições. Menor déficit entre as propostas incompletas: '+fmt(bestDeficit,0)+' m². Revise o programa, o traçado ou as dimensões dos lotes.':overShare?'Nenhuma alternativa dentro do limite viário de '+fmt(s.roadShare,1)+'%. '+overShare+' configurações excederam esse limite. Reduza a largura das vias ou revise o limite.':'Nenhuma alternativa com lotes válidos. O circuito pode não caber nas reentrâncias ou junto às restrições. Teste Comparar adaptativo e ortogonal ou revise as premissas'+(errors?' ('+errors+' configurações não processadas)':'')+'.'),!optCandidates.length);return}
  try{const c=optEvaluate(source,s,specs[idx]);if(c&&c.lotCount){if(c.program&&!c.program.ok){overProgram++;bestDeficit=Math.min(bestDeficit,c.program.shortfall)}else if(c.roadPct>s.roadShare+.001)overShare++;else found.push(c)}}catch(e){errors++}
  idx++;optStatus('Analisando '+idx+' / '+specs.length+' · '+found.length+' válidas'+(overShare?' · '+overShare+' acima do limite viário':'')+(overProgram?' · '+overProgram+' abaixo das reservas':'')+'.');
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
 const refresh=()=>{$('optBendField').classList.toggle('hidden',$('optMode').value==='keep'||$('optMorphology').value!=='organic');$('optAccess').disabled=$('optMode').value==='keep'||$('optMorphology').value==='orthogonal';if($('optAccess').disabled)$('optAccess').value='';$('optMorphologyNote').textContent=$('optMode').value==='keep'?'Modo complementar utiliza o traçado existente; o novo circuito é próprio de Novo traçado.':$('optMorphology').value==='orthogonal'?'Alternativa anterior: malha interna ou perimetral.':$('optMorphology').value==='active'?'Circuito recuado e lotes de perímetro com frente interna. Requer gleba convexa.':$('optMorphology').value==='compact'?'Núcleo público menor e circuito ajustado às divisas.':$('optMorphology').value==='organic'?'Espinha curva, frentes adaptativas e núcleo paisagístico integrado.':'Parque estruturador, circuito de contorno e vias internas conectadas.';optReset();const issues=optRefreshValidation();optStatus(issues.length?'Confira os campos destacados.':'Parâmetros válidos. Gere novas alternativas.',!!issues.length)};
 $('optPreset').onchange=()=>{let s=parcelPresets()[Number($('optPreset').value)];if(s&&$('optPreset').value!=='custom'){$('optFront').value=s.f;$('optDepth').value=s.d;$('optMin').value=s.min;$('optRows').value=String(s.rows);$('optLinkArea').checked=Math.abs(s.min-s.f*s.d)<1e-6}refresh()};
 for(const id of [...Object.values(OPT_NUMERIC).map(r=>r.id),'optRoadShare','optCornerRadius',...URBAN_CATEGORIES.map(c=>c.id)])$(id).oninput=()=>{if(['optFront','optDepth','optMin'].includes(id)){$('optPreset').value='custom';if(id==='optMin')$('optLinkArea').checked=false;else optSyncLinkedArea()}refresh()};
 for(const id of ['optMode','optRows','optObjective','optRotate','optFlex','optPublic','optHierarchy','optMorphology','optAdaptiveLots','optAccess','optBend','optFinishCorners'])$(id).onchange=()=>{if(id==='optRows')$('optPreset').value='custom';$('optModeNote').textContent=$('optMode').value==='keep'?'Mantém vias, rotatórias, lotes e quadras manuais. Novas vias evitam interferências.':'Preserva gleba e áreas especiais; o desenho atual ficará arquivado ao aplicar.';refresh()};
 $('optLinkArea').onchange=()=>{if($('optLinkArea').checked){optSyncLinkedArea();$('optPreset').value='custom'}refresh()};
 $('optFix').onclick=optFixForm;$('optLocalProfile').onclick=()=>{$('optRoadMin').value='12';$('optRoadMax').value='16';$('optRoadShare').value='35';refresh()};
 $('optRun').onclick=optRun;$('optCancel').onclick=()=>{optToken++;optRunning=false;$('optRun').disabled=false;$('optCancel').disabled=true;optRender();optStatus('Busca interrompida. Compare as alternativas já avaliadas.')};
 $('optAlternatives').onclick=e=>{let i=Number(e.target.closest('[data-opt-index]')?.dataset.optIndex);if(Number.isInteger(i)&&optCandidates[i]){optSelected=i;optRender()}};
 $('optExport').onclick=()=>{const c=optCandidates[optSelected];if(!c)return;let q=cp(c.q);q.name=p.name+' · Alternativa '+(optSelected+1);download(filename()+'_alternativa_'+(optSelected+1)+'.json',JSON.stringify(q,null,2),'application/json')};
 $('optSheet').onclick=()=>{const c=optCandidates[optSelected];if(c)download(filename()+'_masterplan.svg',mpSheet(c),'image/svg+xml;charset=utf-8')};$('optApply').onclick=optApply;
}
