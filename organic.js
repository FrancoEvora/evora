
'use strict';
/* Curvilinear design: a single coherent deformation of the street graph, followed by
   face extraction and frontage-chain subdivision. No random displacement of lots. */
const orgSmooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
function orgCurveMap(q,s,spec){
 const frame=mpFrame(q,spec.angle),bb=bbox(q.boundary.pts.map(frame.uv)),W=bb[2]-bb[0],H=bb[3]-bb[1],zones=q.zones.filter(z=>!z.masterCore);
 const amp=Math.min(29,Math.min(W,H)*.13)*spec.bend,fade=Math.max(26,Math.min(90,H*.21));
 return pt=>{const v=frame.uv(pt),x=(v[0]-bb[0])/W,y=(v[1]-bb[1])/H;
  let clearance=mpRingDist(pt,pt,q.boundary.pts);for(const r of q.boundary.holes||[])clearance=Math.min(clearance,mpRingDist(pt,pt,r));for(const z of zones)clearance=Math.min(clearance,urbanDistance(pt,z));
  const f=orgSmooth((clearance-spec.w/2-2)/fade),wave=Math.sin(Math.PI*(2*x-.30))*Math.sin(Math.PI*clamp(y,0,1));
  return frame.xy([v[0]+amp*.30*Math.sin(Math.PI*(2*y-.1))*Math.sin(Math.PI*clamp(x,0,1))*f,v[1]+amp*wave*f]);
 };
}
function orgRoadGraph(roads,map){
 const all=roads.map(r=>r.pts.slice(1).map((b,i)=>({a:r.pts[i],b,ts:[0,1]}))),segments=all.flat();
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const a=segments[i],b=segments[j],pt=segmentIntersection(a.a,a.b,b.a,b.b);
  if(pt){for(const s of [a,b]){const d=sub(s.b,s.a),D=dot(d,d);if(D>1e-10)s.ts.push(clamp(dot(sub(pt,s.a),d)/D,0,1))}}
  else for(const [s,t] of [[a,b],[b,a]])for(const pt of [t.a,t.b]){const d=sub(s.b,s.a),D=dot(d,d);if(D>1e-10&&dist(pt,nearest(pt,s.a,s.b))<.0001)s.ts.push(clamp(dot(sub(pt,s.a),d)/D,0,1))}
 }
 // Subdivide at junctions first. Adaptive sampling preserves the shared graph exactly.
 const cache=new Map(),mapped=pt=>{let k=pt.map(v=>Math.round(v*1e6)).join(',');if(!cache.has(k))cache.set(k,map(pt));return cache.get(k)};
 function sample(a,b,depth=0){const A=mapped(a),B=mapped(b),mid=lerp(a,b,.5),M=mapped(mid);if(depth<8&&(dist(M,nearest(M,A,B))>.32||dist(A,B)>38&&dist(M,nearest(M,A,B))>.035)){return [...sample(a,mid,depth+1).slice(0,-1),...sample(mid,b,depth+1)]}return [A,B]}
 return roads.map((r,i)=>{let pts=[];for(const e of all[i]){const ts=[...new Set(e.ts.map(t=>Math.round(t*1e9)/1e9))].sort((a,b)=>a-b);for(let k=1;k<ts.length;k++){const a=lerp(e.a,e.b,ts[k-1]),b=lerp(e.a,e.b,ts[k]);if(dist(a,b)<.002)continue;const line=sample(a,b);pts.push(...(pts.length?line.slice(1):line))}}
  const clean=pts.filter((v,k)=>!k||dist(v,pts[k-1])>.001);return {...r,pts:clean,organicRoad:true,smooth:false}
 });
}
function orgGenerate(q,s,spec){
 // Reserve a central program and build a connected base graph before bending the avenues.
 const roads=mpGenerate(q,s,{...spec,pattern:spec.compact?'compact':'garden'});if(!roads)return null;
 const core=q.zones.filter(z=>z.masterCore&&z.urbanGenerated),manual=q.zones.filter(z=>!core.includes(z)),map=orgCurveMap(q,s,spec);
 const seed=core.length?map(core.reduce((a,z)=>add(a,mul(centroid(z.pts),polyArea(z))),[0,0]).map(x=>x/core.reduce((a,z)=>a+polyArea(z),0))):null;
 const curved=orgRoadGraph(roads,map);
 if(curved.some(r=>r.pts.length<2||!r.masterAccess&&!mpRoadSafe(r.pts,r.width,q.boundary,manual)))return null;
 // Keep access segment invariant near the property boundary; its external connection is not inferred.
 q.zones=manual;
 q.masterplan={...q.masterplan,engine:3,style:'organic',organic:true,bend:spec.bend,core:!!seed,coreSeed:seed,coreProgram:core.map(z=>({kind:z.kind,name:z.name,area:polyArea(z)})),angle:spec.angle};
 return curved;
}
function orgCore(q){
 const m=q.masterplan;if(!m?.organic||!m.coreSeed)return true;
 const face=q.blocks.find(b=>b.auto&&insideObj(m.coreSeed,b));if(!face||face.holes?.length)return false;
 const A=polyArea(face),parts=m.coreProgram,desired=parts.reduce((n,x)=>n+x.area,0);
 if(A<desired*.62||A>desired*1.75)return false;
 const frame=mpFrame(q,m.angle),r=face.pts.map(frame.uv),b=bbox(r),cutArea=x=>Math.abs(area(parcelClip(r,0,x,false))),zones=[];
 let start=b[0],cum=0;
 for(let i=0;i<parts.length;i++){const part=parts[i];cum+=part.area/desired;let end=b[2];if(i<parts.length-1){let lo=start,hi=b[2];for(let k=0;k<35;k++){let mid=(lo+hi)/2;if(cutArea(mid)<cum*A)lo=mid;else hi=mid}end=(lo+hi)/2}
  const pts=qClean(parcelClip(parcelClip(r,0,start,true),0,end,false).map(frame.xy));if(pts.length<3||!simple(pts))return false;
  zones.push({id:uid(),name:part.name,kind:part.kind,pts,holes:[],masterCore:true,urbanGenerated:true});start=end;
 }
 if(Math.abs(zones.reduce((n,z)=>n+polyArea(z),0)-A)>.02)return false;
 q.zones.push(...zones);return true;
}
/* Ear clipping for concave parcels with curved front boundaries. Intersections of triangle
   pairs are evaluated exactly in local planar coordinates. */
const orgTriCache=new WeakMap();
function orgTriangles(r){
 if(orgTriCache.has(r))return orgTriCache.get(r);
 let a=qClean(r);if(area(a)<0)a=a.slice().reverse();let ids=a.map((_,i)=>i),out=[],guard=0;
 const inTri=(v,x,y,z)=>cross(sub(y,x),sub(v,x))>=-1e-8&&cross(sub(z,y),sub(v,y))>=-1e-8&&cross(sub(x,z),sub(v,z))>=-1e-8;
 while(ids.length>3&&guard++<a.length*a.length){let found=false;for(let i=0;i<ids.length;i++){let k=ids[(i+ids.length-1)%ids.length],l=ids[i],m=ids[(i+1)%ids.length],x=a[k],y=a[l],z=a[m];if(cross(sub(y,x),sub(z,y))<=1e-9)continue;if(ids.some(j=>j!==k&&j!==l&&j!==m&&inTri(a[j],x,y,z)))continue;out.push({pts:[x,y,z],b:bbox([x,y,z])});ids.splice(i,1);found=true;break}if(!found){orgTriCache.set(r,null);return null}}
 if(ids.length===3){const pts=ids.map(i=>a[i]);out.push({pts,b:bbox(pts)})}
 if(!out.length||Math.abs(out.reduce((n,t)=>n+Math.abs(area(t.pts)),0)-Math.abs(area(r)))>.005){orgTriCache.set(r,null);return null}
 orgTriCache.set(r,out);return out;
}
function orgOverlap(a,b){
 if(!urbanBboxOverlap(bbox(a.pts),bbox(b.pts)))return 0;
 function ringOverlap(r,s){const A=orgTriangles(r),B=orgTriangles(s);if(!A||!B)return NaN;let sum=0;for(const x of A)for(const y of B){if(!urbanBboxOverlap(x.b,y.b))continue;const p0=x.pts[0],clip=y.pts.map(v=>sub(v,p0)),pts=mpClipByConvex(x.pts.map(v=>sub(v,p0)),clip);if(pts.length>=3)sum+=Math.abs(area(pts))}return sum}
 let v=ringOverlap(a.pts,b.pts);for(const h of a.holes||[])v-=ringOverlap(h,b.pts);for(const h of b.holes||[])v-=ringOverlap(h,a.pts);for(const h of a.holes||[])for(const j of b.holes||[])v+=ringOverlap(h,j);return Number.isFinite(v)?Math.max(0,v):NaN;
}
function orgFits(l,b){const A=polyArea(l),i=orgOverlap(l,b);return Number.isFinite(i)&&i>=A-Math.max(.002,A*1e-7)}
function orgDisjoint(l,objects){const bb=bbox(l.pts);return objects.every(o=>{if(!urbanBboxOverlap(bb,bbox(o.pts)))return true;const x=orgOverlap(l,o);return Number.isFinite(x)&&x<.002})}
function orgArc(pts){const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum.at(-1)+dist(pts[i-1],pts[i]));const len=cum.at(-1);return {pts,cum,len,at:t=>{const x=clamp(t,0,1)*len;let i=1;while(i<cum.length-1&&cum[i]<x)i++;return lerp(pts[i-1],pts[i],(x-cum[i-1])/Math.max(cum[i]-cum[i-1],1e-10))},params:cum.map(x=>x/Math.max(len,1e-10))}}
function orgSlice(a,lo,hi){return [a.at(lo),...a.pts.filter((_,i)=>a.params[i]>lo+1e-8&&a.params[i]<hi-1e-8),a.at(hi)]}
function orgFronts(o,s,prep){
 const r=o.pts,sign=Math.sign(area(r)),edges=r.map((a,i)=>{const b=r[(i+1)%r.length],len=dist(a,b),u=norm(sub(b,a)),v=mul(perp(u),sign),mid=lerp(a,b,.5);
  const ok=len>.02&&[.25,.5,.75].every(t=>{const pt=lerp(a,b,t);return roadEdgeDistance(pt,prep)<.32&&[.10,.30,.7].some(d=>onRoad(sub(pt,mul(v,d)),prep))});
  return {a,b,u,v,len,ok,i};
 });
 const start=edges.findIndex((e,i)=>!e.ok||dot(e.u,edges[(i+edges.length-1)%edges.length].u)<.83);
 const chains=[];let run=[];
 function finish(){if(!run.length)return;const pts=[run[0].a,...run.map(e=>e.b)],a=orgArc(pts),u=norm(sub(pts.at(-1),pts[0]));if(a.len>=s.f-.001&&dist(pts[0],pts.at(-1))>s.f*.65){chains.push({...a,v:mul(perp(u),sign),u,mid:a.at(.5),curve:a.len-dist(pts[0],pts.at(-1)),turn:Math.acos(clamp(dot(run[0].u,run.at(-1).u),-1,1))*180/Math.PI})}run=[]}
 for(let k=0;k<edges.length;k++){const e=edges[(Math.max(0,start)+k)%edges.length];if(!e.ok){finish();continue}if(run.length&&(dot(run.at(-1).u,e.u)<.82||dot(run[0].u,e.u)<.33))finish();run.push(e)}finish();
 return chains.sort((a,b)=>b.len-a.len).slice(0,8)
}
function orgRowLots(o,s,front,back,row,working,limit){
 const maxN=Math.min(Math.floor((front.len+1e-6)/s.f),limit),A=s.min,prep=prepared();if(maxN<1)return [];
 let best=[];
 for(let n=maxN;n>=Math.max(1,maxN-5);n--){if(front.len/n>s.f*1.7)break;let list=[];
  for(let i=0;i<n;i++){const lo=i/n,hi=(i+1)/n,fp=orgSlice(front,lo,hi),bp=orgSlice(back,lo,hi),depth=[lo,(lo+hi)/2,hi].map(t=>dist(front.at(t),back.at(t))),frontage=length(fp),pts=qClean([...fp,...bp.reverse()]);
   if(pts.length<3||!simple(pts)||Math.min(...depth)<s.d*.62||Math.max(...depth)>s.d*1.65||frontage<s.f-1e-5)continue;
   const area0=polyArea({pts});if(area0<A-1e-5||area0>Math.max(A,s.f*s.d)*2.15)continue;
   const lot={id:uid(),name:'Lote',pts,blockId:o.id,auto:true,frontage,depth:area0/frontage,frontEdge:0,frontPts:fp,parcelRow:row,parcelV:30,adaptive:true,organicFront:true,curvedFront:fp.length>2&&length(fp)-dist(fp[0],fp.at(-1))>.003};
   if(!orgFits(lot,o)||p.boundary&&!orgFits(lot,p.boundary)||!orgDisjoint(lot,[...working,...p.zones,...list]))continue;
   if(!fp.slice(1).every((b,k)=>{const a=fp[k],u=norm(sub(b,a)),normal=mul(perp(u),-Math.sign(area(o.pts)));return dist(a,b)<.02||parcelFrontNearRoad([a,b],normal,{...s,tolerance:Math.max(.5,s.tolerance)},prep)}))continue;
   list.push(lot)
  }
  const ar=a=>a.reduce((n,l)=>n+polyArea(l),0);if(ar(list)>ar(best)+.01)best=list;if(list.length===n)break;
 }return best;
}
function orgParcel(o,s,working,prep,limit){
 const baseline=mpAdaptiveParcel(o,s,working,prep,limit);
 if(!s.organic||!s.adaptive||!s.flexDepth||!o.auto||o.holes?.length||s.inset>0)return baseline;
 const fronts=orgFronts(o,s,prep);let best=baseline;
 const ar=lots=>lots.reduce((n,l)=>n+polyArea(l),0),nrows=r=>r.rows.filter(x=>x.count>0).length;
 function consider(lots,rows){
  const A=ar(lots),curve=lots.filter(l=>l.curvedFront).length;if(!lots.length||!curve)return;
  const score=A+curve*s.min*.20,old=best.area+best.lots.filter(l=>l.curvedFront).length*s.min*.20;
  if((rows.filter(r=>r.count>0).length>=nrows(best)||nrows(best)<2)&&score>old+1e-4&&A>=best.area*.86)best={...baseline,lots,rows,area:A,adaptive:true,adjusted:true,limit:false,rejected:{shape:0,road:0,access:0,occupied:0,minimum:0}};
 }
 const report=(lots,row)=>({row,count:lots.length,area:ar(lots),depth:lots.length?ar(lots)/lots.reduce((n,l)=>n+l.frontage,0):s.d,reason:lots.length?'':'Não coube nesta frente curva.'});
 for(const a of fronts.slice(0,5)){
  if(a.turn<1.2&&a.curve<.015)continue;
  // One-sided curved frontage with a continuous shared rear line.
  if(s.rows===1||fronts.length<2){const pp=[...new Set([...a.params,...Array.from({length:9},(_,i)=>i/8)])].sort((x,y)=>x-y),sign=Math.sign(area(o.pts)),back=orgArc(pp.map(t=>{const pt=a.at(t),u=norm(sub(a.at(Math.min(1,t+.002)),a.at(Math.max(0,t-.002)))),v=mul(perp(u),sign);return add(pt,mul(v,s.d))}));const lots=orgRowLots(o,s,a,back,1,working,limit);consider(lots,[report(lots,1)]);}
  if(s.rows!==2)continue;
  for(const b0 of fronts.filter(b=>b!==a&&dot(a.v,b.v)<-.65&&dot(sub(b.mid,a.mid),a.v)>s.d*.8).slice(0,4)){
   const b=orgArc(b0.pts.slice().reverse()),D=[0,.25,.5,.75,1].map(t=>dist(a.at(t),b.at(t)));if(Math.min(...D)<s.d*1.25||Math.max(...D)>s.d*3.25)continue;
   const params=[...new Set([...a.params,...b.params,...Array.from({length:9},(_,i)=>i/8)])].sort((x,y)=>x-y),midPts=params.map(t=>lerp(a.at(t),b.at(t),.5)),mid=orgArc(midPts);
   const A=orgRowLots(o,s,a,mid,1,working,limit),B=orgRowLots(o,s,b0,orgArc(midPts.slice().reverse()),2,[...working,...A],Math.max(0,limit-A.length));
   consider([...A,...B],[report(A,1),report(B,2)]);
  }
 }
 return best;
}
function orgStats(c){
 const q=c.q,curved=q.roads.filter(r=>r.organicRoad&&r.pts.length>2&&dist(r.pts[0],r.pts.at(-1))>1&&length(r.pts)-dist(r.pts[0],r.pts.at(-1))>.07);
 return {curvedRoads:curved.length,curvedLength:curved.reduce((n,r)=>n+length(r.pts),0),curvedLots:q.lots.filter(l=>l.curvedFront).length,organicLots:q.lots.filter(l=>l.organicFront).length}
}
function orgSpecs(q,s){
 if(s.morphology!=='organic'||s.mode==='keep')return mpSpecs(q,s);
 const base=mpSpecs(q,{...s,morphology:'garden'}),first=base.filter(x=>x.w===s.wmin),rest=base.filter(x=>x.w!==s.wmin);
 const list=[];for(const x of [...first,...rest])for(const bend of [.78,1.12])list.push({...x,pattern:'organic',organic:true,bend,compact:x.ratio<1.2});
 return list.slice(0,18);
}
