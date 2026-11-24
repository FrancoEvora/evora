
'use strict';
/* Rectangular lots from arbitrary simple regions. Polygon clipping validates containment and exclusions. */
const parcelDefaults={parcelMinArea:300,parcelDirection:'auto',parcelAngle:0,parcelInset:0,parcelRoadRequired:true,parcelRoadTolerance:3,parcelFit:false,parcelReplace:true,parcelFlexDepth:true};
const standardPresets=[
 {name:'200 m² · 10 × 20',f:10,d:20,min:200,rows:2},{name:'250 m² · 10 × 25',f:10,d:25,min:250,rows:2},{name:'300 m² · 12 × 25',f:12,d:25,min:300,rows:2},
 {name:'360 m² · 12 × 30',f:12,d:30,min:360,rows:2},{name:'450 m² · 15 × 30',f:15,d:30,min:450,rows:2},{name:'600 m² · 20 × 30',f:20,d:30,min:600,rows:2},{name:'1.000 m² · 25 × 40',f:25,d:40,min:1000,rows:2}];
let parcelIds=new Set(),parcelPlan=null,parcelPicking=false;
function validParcelOptions(s){return s&&[s.f,s.d,s.min,s.angle,s.inset,s.tolerance].every(Number.isFinite)&&s.f>=2&&s.f<=200&&s.d>=2&&s.d<=300&&s.min>=4&&s.min<=60000&&[1,2].includes(s.rows)&&Math.abs(s.angle)<=360&&s.inset>=0&&s.inset<=20&&s.tolerance>=.1&&s.tolerance<=15;}
function normalizeParcel(q){q.params={...parcelDefaults,...q.params};const a=q.params;for(const k of ['parcelMinArea','parcelAngle','parcelInset','parcelRoadTolerance'])if(!Number.isFinite(a[k]))a[k]=parcelDefaults[k];if(!['auto','angle'].includes(a.parcelDirection))a.parcelDirection='auto';}
function parcelAreas(){return p.blocks.length?p.blocks.map(o=>({o,t:'block'})):(p.boundary?[{o:p.boundary,t:'boundary'}]:[])}
function parcelAreaById(id){return parcelAreas().find(x=>x.o.id===id)?.o}
function parcelSavedPresets(){try{const a=JSON.parse(localStorage.getItem('tracado-parcel-presets-v1')||'[]');return Array.isArray(a)?a.filter(x=>x&&typeof x.name==='string'&&[x.f,x.d,x.min].every(Number.isFinite)&&x.f>=2&&x.f<=200&&x.d>=2&&x.d<=300&&x.min>=4&&x.min<=60000&&[1,2].includes(x.rows)).slice(0,50):[]}catch{return []}}
function parcelPresets(){return [...standardPresets,...parcelSavedPresets()]}
function renderParcelPresets(){const a=parcelPresets();$('parcelPreset').innerHTML='<option value="custom">Personalizado / atual</option>'+a.map((s,i)=>'<option value="'+i+'">'+esc(s.name)+'</option>').join('');$('parcelPreset').value='custom'}
function readParcelOptions(){return {f:Number($('parcelFront').value),d:Number($('parcelDepth').value),min:Number($('parcelMin').value),rows:Number($('parcelRows').value),direction:$('parcelDirection').value,angle:Number($('parcelAngle').value),inset:Number($('parcelInset').value),road:$('parcelRoad').checked,tolerance:Number($('parcelTolerance').value),fit:$('parcelFit').checked,replace:$('parcelReplace').checked,flexDepth:$('parcelFlexDepth').checked}}
function renderParcelFields(){const a=p.params;$('parcelFront').value=a.lotFront;$('parcelDepth').value=a.lotDepth;$('parcelRows').value=String(a.lotRows);$('parcelMin').value=a.parcelMinArea??a.lotFront*a.lotDepth;$('parcelDirection').value=a.parcelDirection;$('parcelAngle').value=a.parcelAngle;$('parcelInset').value=a.parcelInset;$('parcelRoad').checked=a.parcelRoadRequired;$('parcelTolerance').value=a.parcelRoadTolerance;$('parcelFit').checked=a.parcelFit;$('parcelReplace').checked=a.parcelReplace;$('parcelFlexDepth').checked=a.parcelFlexDepth!==false;parcelNominal()}
function parcelNominal(){let s=readParcelOptions();$('parcelNominal').textContent=fmt(s.f*s.d,2)+' m²';$('parcelAngle').disabled=s.direction!=='angle';$('parcelTolerance').disabled=!s.road}
function renderParcelTargets(){let a=parcelAreas();parcelIds=new Set([...parcelIds].filter(id=>a.some(x=>x.o.id===id)));$('parcelTargets').innerHTML=a.length?a.map(({o,t})=>'<label class="parcel-target '+(parcelIds.has(o.id)?'on':'')+'"><input type="checkbox" data-parcel-id="'+esc(o.id)+'" '+(parcelIds.has(o.id)?'checked':'')+'><span>'+esc(o.name||'Área sem nome')+(t==='boundary'?' · gleba':'')+'</span><small>'+fmt(polyArea(o))+' m²</small></label>').join(''):'<p class="hint">Ainda não existem áreas. Desenhe um perímetro ou extraia quadras da gleba.</p>';}
function parcelResetNotice(message='Defina os parâmetros e clique em Pré-visualizar.'){parcelPlan=null;$('parcelApply').disabled=true;$('parcelResult').classList.remove('warn');$('parcelResult').textContent=message}
function invalidateParcel(){if(parcelPlan)parcelResetNotice('O desenho foi alterado. Gere uma nova prévia.')}
function refreshParcel(){parcelResetNotice();renderParcelTargets();renderOverlay()}
function openParcel(){normalizeParcel(p);const s=selected(),a=parcelAreas();parcelIds=new Set(s&&a.some(x=>x.o.id===s[1].id)?[s[1].id]:s?.[0]==='lot'&&a.some(x=>x.o.id===s[1].blockId)?[s[1].blockId]:a.length===1?[a[0].o.id]:[]);renderParcelPresets();renderParcelFields();renderParcelTargets();parcelResetNotice();parcelPicking=true;if(!$('parcelDialog').open)$('parcelDialog').show();setMode('parcelpick');}
function closeParcel(){parcelPicking=false;parcelPlan=null;parcelIds.clear();if($('parcelDialog').open)$('parcelDialog').close();if(mode==='parcelpick')setMode('select');else renderOverlay()}
function toggleParcelAt(raw,id){const a=parcelAreas();let o=a.find(x=>x.o.id===id)?.o;const obj=id&&find(id);if(!o&&obj?.[0]==='lot')o=a.find(x=>x.o.id===obj[1].blockId)?.o;if(!o)o=a.filter(x=>pointInOrEdge(raw,x.o)).sort((x,y)=>polyArea(x.o)-polyArea(y.o))[0]?.o;if(!o){toast('Clique dentro de uma quadra ou área loteável.');return;}if(parcelIds.has(o.id))parcelIds.delete(o.id);else parcelIds.add(o.id);refreshParcel()}
function startParcelArea(){closeParcel();setMode('parcelArea');toast('Desenhe a área loteável. Enter conclui e abre o parcelamento.')}
function finishParcelArea(){let pts=draft.filter((x,i)=>!i||dist(x,draft[i-1])>.05);if(pts.length>2&&dist(pts[0],pts.at(-1))<.05)pts.pop();if(!simple(pts)){toast('Desenhe um perímetro de três ou mais vértices, sem cruzamentos.');return;}let before=snapshot(),o={id:uid(),name:'Área loteável '+String(p.blocks.length+1).padStart(2,'0'),pts};p.blocks.push(o);selection=o.id;draft=[];mode='select';commit(before);openParcel();}
function parcelIntervalsAt(rings,y){const hits=[];for(const ring of rings)for(let i=0;i<ring.length;i++){let a=ring[i],b=ring[(i+1)%ring.length];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))hits.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]))}hits.sort((a,b)=>a-b);const out=[];for(let i=0;i+1<hits.length;i+=2)if(hits[i+1]-hits[i]>1e-7)out.push([hits[i],hits[i+1]]);return out;}
function intersectIntervals(a,b){let out=[],i=0,k=0;while(i<a.length&&k<b.length){let lo=Math.max(a[i][0],b[k][0]),hi=Math.min(a[i][1],b[k][1]);if(hi-lo>1e-7)out.push([lo,hi]);if(a[i][1]<b[k][1])i++;else k++}return out}
function parcelBandIntervals(rings,y0,y1){if(y1-y0<1e-5)return [];const eps=Math.min(1e-5,(y1-y0)/100000),events=[y0,y1];for(const ring of rings)for(const v of ring)if(v[1]>y0+eps&&v[1]<y1-eps)events.push(v[1]);const ys=[...new Set(events)].sort((a,b)=>a-b);let out=null;for(let i=1;i<ys.length;i++){let a=ys[i-1],b=ys[i];if(b-a<1e-9)continue;let e=Math.min(eps,(b-a)/4);for(const y of [a+e,(a+b)/2,b-e]){let v=parcelIntervalsAt(rings,y);out=out===null?v:intersectIntervals(out,v);if(!out.length)return []}}return out||[];}
function parcelClip(ring,axis,limit,positive){let out=[];if(!ring.length)return out;const insideV=v=>positive?v[axis]>=limit-1e-9:v[axis]<=limit+1e-9;let a=ring.at(-1),ai=insideV(a);for(const b of ring){let bi=insideV(b);if(ai!==bi){let den=b[axis]-a[axis];if(Math.abs(den)>1e-12)out.push(lerp(a,b,(limit-a[axis])/den))}if(bi)out.push(b);a=b;ai=bi}return out;}
function parcelClipArea(ring,r){let a=parcelClip(ring,0,r[0],true);a=parcelClip(a,0,r[2],false);a=parcelClip(a,1,r[1],true);a=parcelClip(a,1,r[3],false);return a.length>=3?Math.abs(area(a.map(v=>sub(v,[r[0],r[1]])))):0;}
function parcelPolyAreaIn(poly,r){if(!poly||poly.b[2]<r[0]||poly.b[0]>r[2]||poly.b[3]<r[1]||poly.b[1]>r[3])return 0;return Math.max(0,parcelClipArea(poly.rings[0],r)-poly.rings.slice(1).reduce((a,h)=>a+parcelClipArea(h,r),0))}
function parcelLocalPoly(o,uv){let rings=[o.pts,...(o.holes||[])].map(a=>a.map(uv));return {rings,b:bbox(rings[0])}}
function rectCorners(r){return [[r[0],r[1]],[r[2],r[1]],[r[2],r[3]],[r[0],r[3]]]}
function pointRectDistance(v,r){return Math.hypot(Math.max(r[0]-v[0],0,v[0]-r[2]),Math.max(r[1]-v[1],0,v[1]-r[3]))}
function segmentRectDistance(a,b,r){const corners=rectCorners(r);if(inBox(a,r)||inBox(b,r)||corners.some((c,i)=>segmentIntersection(a,b,c,corners[(i+1)%4])))return 0;return Math.min(pointRectDistance(a,r),pointRectDistance(b,r),...corners.map(c=>dist(c,nearest(c,a,b))));}
function parcelDirection(o,s,prep){const a=o.pts;if(s.direction==='angle'){const angle=s.angle*Math.PI/180,u=[Math.cos(angle),-Math.sin(angle)],v=perp(u),start=a[0];return {u,v,start,edge:false}}const candidates=a.map((q,i)=>{const b=a[(i+1)%a.length],l=dist(q,b);return {i,l,score:[.15,.4,.6,.85].filter(t=>roadEdgeDistance(lerp(q,b,t),prep)<=s.tolerance+.5).length}});let chosen=Number.isInteger(o.front)&&o.front>=0&&o.front<a.length?candidates[o.front]:candidates.filter(x=>x.score>=2&&x.l>.05).sort((a,b)=>b.l-a.l)[0];if(!chosen)chosen=candidates.sort((a,b)=>b.l-a.l)[0];const start=a[chosen.i],u=norm(sub(a[(chosen.i+1)%a.length],start)),v=mul(perp(u),area(a)>0?1:-1);return {start,u,v,edge:true};}
function parcelFrontNearRoad(face,normal,s,prep){let len=dist(face[0],face[1]),samples=Math.max(3,Math.min(25,Math.ceil(len/4)));for(let i=0;i<samples;i++){let q=lerp(face[0],face[1],(i+.5)/samples);if(roadEdgeDistance(q,prep)>s.tolerance+1e-5)return false;let found=false;for(let k=0;k<=12;k++){let v=add(q,mul(normal,s.tolerance*k/12+.001));if(onRoad(v,prep)){found=true;break}}if(!found)return false}return true;}

/* Evaluate each street-facing side independently; all candidates are checked against actual polygons. */
function parcelFrames(o,s,prep){
 const a=o.pts,sign=area(a)>=0?1:-1,frames=[];
 for(let i=0;i<a.length;i++){const start=a[i],end=a[(i+1)%a.length],len=dist(start,end);if(len<Math.max(.05,s.f*.15))continue;const u=norm(sub(end,start)),v=mul(perp(u),sign),mid=lerp(start,end,.5),roadScore=[.18,.5,.82].filter(t=>roadEdgeDistance(lerp(start,end,t),prep)<=s.tolerance+.5).length;frames.push({start,u,v,mid,len,i,roadScore})}
 frames.sort((x,y)=>(s.road?y.roadScore-x.roadScore:0)||y.len-x.len);
 if(s.direction==='angle'){
  const rad=s.angle*Math.PI/180,u=[Math.cos(rad),-Math.sin(rad)],v=perp(u),origin=a[0],uv=pt=>[dot(sub(pt,origin),u),dot(sub(pt,origin),v)],b=bbox(a.map(uv));
  const make=(y,sign)=>({start:add(origin,mul(v,y)),u:mul(u,sign),v:mul(v,sign),mid:add(origin,add(mul(v,y),mul(u,(b[0]+b[2])/2))),len:b[2]-b[0],i:-1,roadScore:0});
  return {fronts:[make(b[1],1)],backs:[make(b[3],-1)],fixed:true};
 }
 let fronts=frames;const selected=frames.find(f=>f.i===o.front);
 if(Number.isInteger(o.front)&&selected)fronts=[selected];
 else {const unique=[];for(const f of frames){if(unique.some(x=>dot(x.v,f.v)>.999&&Math.abs(dot(sub(f.start,x.start),x.v))<.05))continue;unique.push(f)}fronts=unique.slice(0,s.quick?2:6)}
 return {fronts,backs:frames,fixed:false};
}
function parcelReverseFrame(o,f){const vv=o.pts.map(q=>dot(sub(q,f.start),f.v)),max=Math.max(...vv),start=add(f.start,mul(f.v,max));return {start,u:mul(f.u,-1),v:mul(f.v,-1),mid:start,len:f.len,i:-1,roadScore:0}}
function parcelOneRow(o,s,frame,depth,workingLots,prep,limit,rowIndex){
 const {u,v,start}=frame,uv=q=>[dot(sub(q,start),u),dot(sub(q,start),v)],xy=(x,y)=>add(start,add(mul(u,x),mul(v,y)));
 const region=parcelLocalPoly(o,uv),b=region.b,gleba=p.boundary&&p.boundary.id!==o.id?parcelLocalPoly(p.boundary,uv):null,zones=p.zones.map(z=>parcelLocalPoly(z,uv)),existing=workingLots.map(z=>parcelLocalPoly(z,uv));
 const segments=prep.road.flatMap(road=>road.pts.slice(1).map((pt,i)=>{let a=uv(road.pts[i]),b=uv(pt);return {a,b,w:road.w,box:[Math.min(a[0],b[0])-road.w,Math.min(a[1],b[1])-road.w,Math.max(a[0],b[0])+road.w,Math.max(a[1],b[1])+road.w]}}));
 const rounds=prep.round.map(r=>({c:uv(r.c),r:r.r}));
 const result={row:rowIndex,lots:[],area:0,depth,rejected:{shape:0,road:0,access:0,occupied:0,minimum:0},limit:false,reason:''};let tried=0;
 let front=s.f;if(s.flexDepth)front=Math.max(front,s.min/depth);
 if(front>s.f*1.2+1e-6||front*depth<s.min-1e-5&&!s.fit){result.reason='Área mínima incompatível com as dimensões.';return result}
 const y=s.inset;if(y<b[1]-1e-5||y+depth>b[3]+1e-5){result.reason='Profundidade insuficiente nesta divisa.';return result}
 for(const interval of parcelBandIntervals(region.rings,y,y+depth)){
  let lo=interval[0]+s.inset,hi=interval[1]-s.inset,span=hi-lo,count=Math.floor((span+1e-5)/front);if(count<=0)continue;
  let w=s.fit&&span/count<=s.f*1.2+1e-6?span/count:front,margin=Math.max(0,(span-count*w)/2);if(w*depth<s.min-1e-5){result.rejected.minimum+=count;continue}
  for(let i=0;i<count;i++){
   if(result.lots.length>=limit||++tried>30000){result.limit=true;return result}
   const x=lo+margin+i*w,r=[x,y,x+w,y+depth],A=w*depth;
   if(parcelPolyAreaIn(region,r)<A-1e-4||(gleba&&parcelPolyAreaIn(gleba,r)<A-1e-4)){result.rejected.shape++;continue}
   if(zones.some(z=>parcelPolyAreaIn(z,r)>1e-4)||existing.some(z=>parcelPolyAreaIn(z,r)>1e-4)){result.rejected.occupied++;continue}
   if(rounds.some(z=>pointRectDistance(z.c,r)<z.r-1e-6)||segments.some(z=>z.box[2]>r[0]&&z.box[0]<r[2]&&z.box[3]>r[1]&&z.box[1]<r[3]&&segmentRectDistance(z.a,z.b,r)<z.w-1e-6)){result.rejected.road++;continue}
   const pts=rectCorners(r).map(q=>xy(q[0],q[1]));if(s.road&&!parcelFrontNearRoad([pts[0],pts[1]],mul(v,-1),s,prep)){result.rejected.access++;continue}
   result.lots.push({id:uid(),name:'Lote',pts,blockId:o.id,auto:true,frontage:w,depth,frontEdge:0,parcelRow:rowIndex,parcelV:5});result.area+=A;
  }
 }
 if(!result.lots.length)result.reason=result.rejected.access?'Frente sem proximidade de via.':result.rejected.occupied?'Interferência com a outra fileira, lotes ou restrições.':result.rejected.road?'Interferência com faixa viária.':result.rejected.minimum?'Área mínima não atendida.':'Dimensões insuficientes nesta divisa.';
 return result;
}
function planParcelArea(o,s,workingLots,prep,limit){
 const frames=parcelFrames(o,s,prep),empty=()=>({id:o.id,name:o.name,lots:[],area:0,rows:[],rejected:{shape:0,road:0,access:0,occupied:0,minimum:0},limit:false});let best=null;
 function record(rows,adjusted){
  const r=empty();r.rows=rows.map(a=>({row:a.row,count:a.lots.length,area:a.area,depth:a.depth,reason:a.reason}));r.lots=rows.flatMap(a=>a.lots);r.area=rows.reduce((n,a)=>n+a.area,0);r.limit=rows.some(a=>a.limit);r.adjusted=adjusted;
  for(const a of rows)for(const k in a.rejected)r.rejected[k]+=a.rejected[k];
  const score=[s.rows===2&&r.rows.length===2&&r.rows.every(a=>a.count>0)?1:0,r.lots.length,r.area,adjusted?0:1];
  if(!best||score.some((v,i)=>v>best.score[i]+1e-7&&score.slice(0,i).every((x,k)=>Math.abs(x-best.score[k])<=1e-7)))best={r,score};
 }
 for(const a of frames.fronts){
  const first=parcelOneRow(o,s,a,s.d,workingLots,prep,limit,1);
  if(s.rows===1){record([first],false);continue}
  let backs=frames.fixed?frames.backs:frames.backs.filter(b=>b.i!==a.i&&dot(a.v,b.v)<-.78&&dot(sub(b.mid,a.start),a.v)>s.inset+.1).sort((x,y)=>(s.road?y.roadScore-x.roadScore:0)||y.len-x.len).slice(0,s.quick?1:3);
  if(!backs.length)backs=[parcelReverseFrame(o,a)];
  for(const b of backs){
   const second=parcelOneRow(o,s,b,s.d,[...workingLots,...first.lots],prep,Math.max(0,limit-first.lots.length),2);record([first,second],false);
   if(s.flexDepth&&(!first.lots.length||!second.lots.length)){
    const span=Math.min(dot(sub(b.mid,a.start),a.v),dot(sub(a.mid,b.start),b.v)),suggested=Math.floor((span-2*s.inset)*50+1e-7)/100;
    const candidates=[Math.min(s.d,suggested),s.d*.95,s.d*.9,s.d*.85].filter((x,i,arr)=>x>=s.d*.85-1e-7&&x<s.d-1e-7&&arr.findIndex(y=>Math.abs(x-y)<.005)===i);
    for(const d of (s.quick?candidates.slice(0,1):candidates)){
     const f1=parcelOneRow(o,s,a,d,workingLots,prep,limit,1),f2=parcelOneRow(o,s,b,d,[...workingLots,...f1.lots],prep,Math.max(0,limit-f1.lots.length),2);record([f1,f2],true);if(f1.lots.length&&f2.lots.length)break;
    }
   }
  }
 }
 return best?.r||empty();
}

function computeParcel(ids,s){if(!validParcelOptions(s))throw Error('Verifique as dimensões, a área mínima, o ângulo e a tolerância.');const prep=prepared(),results=[],lots=[],replaceIds=new Set();let working=p.lots.slice(),truncated=false;
 for(const id of ids){const o=parcelAreaById(id);if(!o)continue;const old=s.replace?working.filter(l=>l.blockId===id&&l.auto):[],oldIds=new Set(old.map(l=>l.id)),other=working.filter(l=>!oldIds.has(l.id)),res=s.organic?orgParcelComplete(o,s,other,prep,Math.max(0,3000-lots.length)):s.adaptive?mpAdaptiveParcel(o,s,other,prep,Math.max(0,3000-lots.length)):planParcelArea(o,s,other,prep,Math.max(0,3000-lots.length));results.push(res);if(res.lots.length){for(const l of old)replaceIds.add(l.id);working=[...other,...res.lots];lots.push(...res.lots)}if(res.limit||lots.length>=3000){truncated=true;break}}
 let existingNames=new Set(p.lots.filter(l=>!replaceIds.has(l.id)).map(l=>l.name));let byArea=new Map();for(const l of lots){let o=parcelAreaById(l.blockId),prefix=o?.name||'Área',num=(byArea.get(l.blockId)||0)+1,name;do{name=prefix+' / L'+String(num++).padStart(2,'0')}while(existingNames.has(name));byArea.set(l.blockId,num-1);l.name=name;existingNames.add(name)}
 return {lots,results,replaceIds,truncated,area:results.reduce((a,b)=>a+b.area,0),snapshot:snapshot(),options:s};
}
function previewParcel(){parcelResetNotice();if(!parcelIds.size){$('parcelResult').textContent='Selecione pelo menos uma área.';$('parcelResult').classList.add('warn');renderOverlay();return}
 let s=readParcelOptions();try{parcelPlan=computeParcel([...parcelIds],s)}catch(e){$('parcelResult').textContent=e.message;$('parcelResult').classList.add('warn');renderOverlay();return}
 const plan=parcelPlan,selectedArea=[...parcelIds].reduce((a,id)=>a+polyArea(parcelAreaById(id)||{pts:[]}),0),rejected=plan.results.reduce((a,r)=>a+Object.values(r.rejected).reduce((x,y)=>x+y,0),0),access=plan.results.reduce((a,r)=>a+r.rejected.access,0);
 $('parcelResult').classList.toggle('warn',!plan.lots.length||plan.truncated||!s.road||plan.results.some(r=>s.rows===2&&r.rows.filter(x=>x.count>0).length<2));
 $('parcelResult').innerHTML='<b>'+fmt(plan.lots.length)+' lotes na prévia</b><div class="report-line"><span>Área dos novos lotes</span><strong>'+fmt(plan.area,2)+' m²</strong></div><div class="report-line"><span>Área selecionada</span><strong>'+fmt(selectedArea,2)+' m²</strong></div><div class="report-areas">'+plan.results.map(r=>'<div class="row-report"><div class="report-line"><strong>'+esc(r.name)+'</strong><strong>'+r.lots.length+' lote(s)</strong></div>'+r.rows.map(a=>'<small>Fileira '+a.row+': '+a.count+' lote(s) · '+fmt(a.depth,2)+' m'+(!a.count&&a.reason?' — '+esc(a.reason):'')+'</small>').join('')+(r.adjusted?'<small>Dimensões ajustadas; área mínima mantida.</small>':'')+'</div>').join('')+'</div>'+(plan.replaceIds.size?'<div>'+plan.replaceIds.size+' lote(s) automático(s) serão substituídos.</div>':'')+(rejected?'<div>'+rejected+' posições descartadas por restrições'+(access?' ('+access+' sem frente próxima à via)':'')+'.</div>':'')+(!s.road?'<div>Proximidade viária desativada. Conferir todos os acessos.</div>':'')+(!plan.lots.length?'<div>Nenhum lote gerado. Ajuste dimensões, ângulo, frente ou tolerância. Os lotes existentes não serão removidos.</div>':'')+(plan.truncated?'<div>Limite de processamento atingido. Processe menos áreas por vez.</div>':'');
 $('parcelApply').disabled=!plan.lots.length||plan.truncated;renderOverlay();
}
function applyParcel(){let plan=parcelPlan;if(!plan||!plan.lots.length||plan.truncated)return;if(plan.snapshot!==snapshot()){parcelResetNotice('O desenho foi alterado. Gere uma nova prévia.');renderOverlay();return}if(plan.replaceIds.size&&!confirm('Substituir '+plan.replaceIds.size+' lote(s) automático(s) pelas novas geometrias? Os lotes manuais serão mantidos.'))return;let before=snapshot(),s=plan.options,count=plan.lots.length;p.lots=p.lots.filter(l=>!plan.replaceIds.has(l.id)).concat(plan.lots);Object.assign(p.params,{lotFront:s.f,lotDepth:s.d,lotRows:s.rows,parcelMinArea:s.min,parcelDirection:s.direction,parcelAngle:s.angle,parcelInset:s.inset,parcelRoadRequired:s.road,parcelRoadTolerance:s.tolerance,parcelFit:s.fit,parcelReplace:s.replace,parcelFlexDepth:!!s.flexDepth});closeParcel();commit(before);toast(count+' lote(s) criado(s). Ctrl+Z desfaz toda a operação.');}
function parcelOverlay(){if(!$('parcelDialog').open)return '';let z=view.z,h='';for(const id of parcelIds){const o=parcelAreaById(id);if(o)h+='<path d="'+polyPath(o)+'" fill="#0c8bde" fill-opacity=".05" fill-rule="evenodd" stroke="#007ba5" stroke-width="'+2.2/z+'" stroke-dasharray="'+5/z+' '+3/z+'"/>'}if(parcelPlan)for(const l of parcelPlan.lots){h+='<path d="'+path(l.pts,true)+'" fill="'+(l.parcelRow===2?'#6bb7de':'#0bc3a4')+'" fill-opacity=".36" stroke="'+(l.parcelRow===2?'#26759c':'#087c74')+'" stroke-width="'+1.2/z+'"/>';if(view.z>1.6)h+=textAt(centroid(l.pts),fmt(l.frontage,1)+' × '+fmt(l.depth,1),9,'#04594e')}return h;}
function installParcel(){
 $('autoLots').onclick=openParcel;$('drawParcel').onclick=startParcelArea;$('parcelDraw').onclick=startParcelArea;$('parcelClose').onclick=closeParcel;$('parcelDialog').addEventListener('cancel',e=>{e.preventDefault();closeParcel()});
 $('parcelAll').onclick=()=>{parcelIds=new Set(parcelAreas().map(x=>x.o.id));refreshParcel()};$('parcelNone').onclick=()=>{parcelIds.clear();refreshParcel()};$('parcelPickMap').onclick=()=>{setMode('parcelpick');toast('Clique nas áreas no mapa para alternar a seleção.')};
 $('parcelTargets').onchange=e=>{let id=e.target.dataset.parcelId;if(!id)return;if(e.target.checked)parcelIds.add(id);else parcelIds.delete(id);refreshParcel()};
 $('parcelPreset').onchange=()=>{let k=$('parcelPreset').value;if(k!=='custom'){let s=parcelPresets()[Number(k)];if(s){$('parcelFront').value=s.f;$('parcelDepth').value=s.d;$('parcelMin').value=s.min;$('parcelRows').value=String(s.rows)}}parcelNominal();parcelResetNotice();renderOverlay()};
 for(const id of ['parcelFront','parcelDepth','parcelMin','parcelRows','parcelDirection','parcelAngle','parcelInset','parcelRoad','parcelTolerance','parcelFit','parcelFlexDepth','parcelReplace'])$(id).addEventListener('input',()=>{if(['parcelFront','parcelDepth','parcelMin','parcelRows'].includes(id))$('parcelPreset').value='custom';parcelNominal();parcelResetNotice();renderOverlay()});
 $('presetSave').onclick=()=>{const name=$('presetName').value.trim(),s=readParcelOptions();if(!name||!validParcelOptions(s))return toast('Informe um nome e dimensões válidas.');try{const a=parcelSavedPresets();if(a.length>=50)return toast('Limite de 50 modelos personalizados.');a.push({name,f:s.f,d:s.d,min:s.min,rows:s.rows});localStorage.setItem('tracado-parcel-presets-v1',JSON.stringify(a));renderParcelPresets();$('parcelPreset').value=String(parcelPresets().length-1);$('presetName').value='';toast('Modelo salvo neste navegador.')}catch{toast('Não foi possível salvar o modelo.')}};
 $('parcelPreview').onclick=previewParcel;$('parcelApply').onclick=applyParcel;
}
