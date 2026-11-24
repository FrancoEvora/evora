
'use strict';
/* 3.1 — circular tangent returns at street junctions.
 * Each return is an actual addition to the road right-of-way; block extraction,
 * area sampling, parcel checks, technical and humanized rendering share it.
 * These are design-study radii, not a vehicle swept-path or regulatory check.
 */
const jfCache=new WeakMap();
function jfProtected(q){const lots=new Set(q.lots.map(l=>l.id));return q.zones.filter(z=>!z.urbanGenerated&&!lots.has(z.id)).concat(q.blocks.filter(b=>!b.auto))}
function jfKey(q){return JSON.stringify([q.params.junctionRadius||0,q.boundary&&[q.boundary.pts,q.boundary.holes],q.roads.map(r=>[r.id,r.pts,r.width,r.smooth,r.cls]),q.rounds.map(r=>[r.c,r.r]),jfProtected(q).map(z=>[z.pts,z.holes])])}
function jfGraph(q){
 const segs=[],nodes=new Map();
 for(const r of q.roads){const a=roadPts(r);for(let i=1;i<a.length;i++)if(dist(a[i-1],a[i])>.01)segs.push({a:a[i-1],b:a[i],r,i,bx:bbox([a[i-1],a[i]])})}
 if(segs.length>2400)return [];
 segs.sort((a,b)=>a.bx[0]-b.bx[0]);
 function addRay(node,s,pt){
  for(const end of [s.a,s.b]){const L=dist(pt,end);if(L<.025)continue;
   const u=norm(sub(end,pt)),found=node.rays.find(x=>dot(x.u,u)>.99998);
   if(found){found.L=Math.max(found.L,L);if(s.r.width>found.r.width)found.r=s.r}else node.rays.push({u,L,r:s.r})
  }
 }
 for(let i=0;i<segs.length;i++){const a=segs[i];for(let k=i+1;k<segs.length;k++){
  const b=segs[k];if(b.bx[0]>a.bx[2]+.001)break;
  if(a.r===b.r||a.bx[3]<b.bx[1]-.001||b.bx[3]<a.bx[1]-.001)continue;
  let pt=segmentIntersection(a.a,a.b,b.a,b.b);
  if(!pt)for(const v of [a.a,a.b,b.a,b.b])if(dist(v,nearest(v,a.a,a.b))<.001&&dist(v,nearest(v,b.a,b.b))<.001){pt=v;break}
  if(!pt)continue;
  let key=pt.map(x=>Math.round(x*1000)).join(','),node=nodes.get(key);if(!node){node={pt,rays:[]};nodes.set(key,node)}
  addRay(node,a,pt);addRay(node,b,pt);
 }}
 return [...nodes.values()].filter(n=>n.rays.length>=3);
}
function jfReturn(node,a,b,h1,h2,r){
 const u=a.u,v=b.u,n=perp(u),m=mul(perp(v),-1),P=lineIntersection(add(node,mul(n,h1)),add(add(node,mul(n,h1)),u),add(node,mul(m,h2)),add(add(node,mul(m,h2)),v));
 const C=lineIntersection(add(node,mul(n,h1+r)),add(add(node,mul(n,h1+r)),u),add(node,mul(m,h2+r)),add(add(node,mul(m,h2+r)),v));
 if(!P||!C)return null;
 const T1=sub(C,mul(n,r)),T2=sub(C,mul(m,r)),d1=dot(sub(T1,node),u),d2=dot(sub(T2,node),v);
 // Returns must fit before the next sampled centerline vertex; no invented radius beyond the surveyed geometry.
 if(d1<.02||d2<.02||d1>a.L-.015||d2>b.L-.015)return null;
 const alpha=Math.atan2(T1[1]-C[1],T1[0]-C[0]),beta=Math.atan2(T2[1]-C[1],T2[0]-C[0]);
 let d=(beta-alpha+Math.PI*3)%(Math.PI*2)-Math.PI;
 const N=Math.max(5,Math.ceil(Math.abs(d)/Math.max(.025,2*Math.acos(clamp(1-.012/r,-1,1)))));
 let arc=[T1];for(let i=1;i<N;i++)arc.push(add(C,[r*Math.cos(alpha+d*i/N),r*Math.sin(alpha+d*i/N)]));arc.push(T2);
 // Slight internal overlap makes the union of the polygon and straight road ribbons robust.
 const pts=qClean([lerp(P,node,.006),sub(T1,mul(n,.025)),...arc,sub(T2,mul(m,.025))]);
 if(pts.length<3||!simple(pts)||Math.abs(area(pts))<.01)return null;
 return {pts,arc,radius:r};
}
function jfCorners(q){
 const target=Number(q.params?.junctionRadius||0);if(target<=0)return [];
 const key=jfKey(q),old=jfCache.get(q);if(old?.key===key)return old.out;
 const protectedAreas=jfProtected(q),out=[];
 for(const n of jfGraph(q)){
  if(q.rounds.some(r=>dist(n.pt,r.c)<r.r+target+2))continue;
  const rays=n.rays.slice().sort((a,b)=>Math.atan2(a.u[1],a.u[0])-Math.atan2(b.u[1],b.u[0]));
  for(let k=0;k<rays.length;k++){
   const a=rays[k],b=rays[(k+1)%rays.length],angle=(Math.atan2(b.u[1],b.u[0])-Math.atan2(a.u[1],a.u[0])+Math.PI*2)%(Math.PI*2);
   if(angle<Math.PI*35/180||angle>Math.PI*145/180)continue;
   const h1=a.r.width/2,h2=b.r.width/2;let ret=null;
   for(const r of [...new Set([target,target*.8,target*.6,Math.max(1.2,target*.4)].filter(x=>x<=target&&x>=1.2))]){
    const x=jfReturn(n.pt,a,b,h1,h2,r);if(!x)continue;
    const obj={pts:x.pts};
    if(q.boundary&&!orgFits(obj,q.boundary))continue;
    if(!orgDisjoint(obj,protectedAreas))continue;
    const p1=urbanRoadPavement(a.r)/2,p2=urbanRoadPavement(b.r)/2,asphalt=jfReturn(n.pt,a,b,p1,p2,r+Math.min(h1-p1,h2-p2));
    ret={...x,b:bbox(x.pts),asphalt:asphalt?.pts||null,node:n.pt,requested:target,cls:a.r.cls!=='Local'||b.r.cls!=='Local'?'Coletora':'Local'};break;
   }
   if(ret)out.push(ret);
  }
 }
 jfCache.set(q,{key,out});return out;
}
function jfPaint(q,layer,fill){
 return jfCorners(q).map(c=>{const pts=layer==='asphalt'?c.asphalt:c.pts;return pts?'<path d="'+path(pts,true)+'" fill="'+fill+'" pointer-events="none" data-concordancia="'+layer+'"/>':''}).join('');
}
function jfOn(v,prep){return (prep.corners||[]).some(c=>inBox(v,c.b)&&inside(v,c.pts))}
function jfDistance(v,prep){let d=Infinity;for(const c of prep.corners||[]){if(v[0]<c.b[0]-5||v[0]>c.b[2]+5||v[1]<c.b[1]-5||v[1]>c.b[3]+5)continue;for(let i=1;i<c.arc.length;i++)d=Math.min(d,dist(v,nearest(v,c.arc[i-1],c.arc[i])))}return d}
function jfLotClear(l,prep){return orgDisjoint(l,prep.corners||[])}
function jfStats(q){const a=jfCorners(q);return {cornerCount:a.length,minCornerRadius:a.length?Math.min(...a.map(x=>x.radius)):0,cornerRequested:q.params.junctionRadius||0}}
/* Completion pass: genuine residual faces, with road frontage; or a small convex
 * remainder absorbed into an adjacent parcel. Never classify waste as public space. */
function jfComplete(q,s){
 const prep=prepared(),startCount=q.lots.length,names=new Set(q.lots.map(l=>l.name)),before=q.lots.reduce((n,l)=>n+polyArea(l),0),merged=[];
 const temp={...q,params:{...q.params,minQuadra:Math.max(8,s.min*.04)},zones:[...q.zones,...q.lots.map(l=>({...l,kind:'other'}))]};
 let faces;try{faces=vectorBlocks(temp).filter(f=>!f.holes?.length&&polyArea(f)>8).sort((a,b)=>polyArea(b)-polyArea(a))}catch{return {newLots:0,merged:0,area:0}}
 for(const face of faces.slice(0,90)){
  const A=polyArea(face);if(A<s.min-1e-5)continue;
  const owner=q.blocks.find(b=>b.auto&&orgFits(face,b));if(!owner)continue;
  const fronts=orgFronts(face,s,prep),long=fronts[0];if(!long||long.len<s.f-.0001)continue;
  const ar=s.min,nominal=Math.max(ar,s.f*s.d),compact=blockStats(face),countBefore=q.lots.length;
  // A complete, buildable corner parcel is preferable to leaving a triangular sliver.
  if(A<=nominal*1.95&&A/long.len>=s.d*.63&&A/long.len<=s.d*1.75&&compact.depth>=Math.max(6,s.f*.6)&&A/(compact.width*compact.depth)>.55){
   const l={id:uid(),name:'Lote',pts:face.pts,blockId:owner.id,auto:true,adaptive:true,organicFront:true,frontage:long.len,frontPts:long.pts,depth:A/long.len,frontEdge:null,parcelRow:2,parcelV:31,cornerLot:true,infill:true};
   if(orgDisjoint(l,[...q.zones,...q.lots])&&jfLotClear(l,prep)){let n=1;do{l.name=owner.name+' / L'+String(n++).padStart(2,'0')}while(names.has(l.name));names.add(l.name);q.lots.push(l)}
  }
  if(q.lots.length===countBefore&&A>=s.min*1.2&&q.lots.length<3000){
   const local={...face,id:owner.id,name:owner.name,auto:true},opts={...s,direction:'auto',angle:0,inset:0,road:true,tolerance:.55,rows:2,fit:true,flexDepth:true,adaptive:true,organic:true,quick:true};
   const r=orgParcelComplete(local,opts,q.lots,prep,Math.max(0,3000-q.lots.length));
   for(const l of r.lots){if(!orgFits(l,owner)||!orgDisjoint(l,[...q.zones,...q.lots])||!jfLotClear(l,prep))continue;let n=1;do{l.name=owner.name+' / L'+String(n++).padStart(2,'0')}while(names.has(l.name));names.add(l.name);l.infill=true;q.lots.push(l)}
  }
 }
 // Absorb only precisely matching convex unions, preserving the original legal frontage.
 for(const face of faces.filter(f=>polyArea(f)<s.min).slice(0,90)){
  const A=polyArea(face);if(!orgDisjoint(face,[...q.zones,...q.lots]))continue;
  for(const l of q.lots){
   if(!l.auto||l.edgeLot||l.blockConflict||!l.blockId||polyArea(l)+A>Math.max(s.min,s.f*s.d)*1.95)continue;
   const bb=bbox(l.pts),fb=bbox(face.pts);if(bb[2]<fb[0]-.002||bb[0]>fb[2]+.002||bb[3]<fb[1]-.002||bb[1]>fb[3]+.002)continue;
   const hull=qHull([...l.pts,...face.pts]),area0=polyArea(l)+A;
   if(hull.length<3||Math.abs(Math.abs(area(hull))-area0)>.003)continue;
   const test={...l,pts:hull,organicFront:true,adaptive:true};
   const owner=q.blocks.find(b=>b.id===l.blockId);if(!owner||!orgFits(test,owner)||!orgDisjoint(test,[...q.zones,...q.lots.filter(x=>x!==l)])||!jfLotClear(test,prep))continue;
   const dims=blockStats(test);if(dims.depth<Math.max(6,s.f*.6)||area0/l.frontage>s.d*1.8)continue;
   const front=l.frontPts||l.frontageSegment||(Number.isInteger(l.frontEdge)?[l.pts[l.frontEdge],l.pts[(l.frontEdge+1)%l.pts.length]]:null);
   if(!front||!front.every(pt=>pointInOrEdge(pt,test)))continue;
   l.pts=hull;l.frontPts=front;l.organicFront=true;l.adaptive=true;l.frontEdge=null;l.depth=area0/l.frontage;l.cornerLot=true;l.mergedResidual=true;merged.push(l.id);break;
  }
 }
 return {newLots:q.lots.length-startCount,merged:merged.length,area:Math.max(0,q.lots.reduce((n,l)=>n+polyArea(l),0)-before)}
}
