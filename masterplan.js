
'use strict';
/* Site-led morphology and conservative polygonal subdivision. */
function mpSegDist(a,b,c,d){if(segmentIntersection(a,b,c,d))return 0;return Math.min(dist(a,nearest(a,c,d)),dist(b,nearest(b,c,d)),dist(c,nearest(c,a,b)),dist(d,nearest(d,a,b)))}
function mpRingDist(a,b,r){let d=Infinity;for(let i=0;i<r.length;i++)d=Math.min(d,mpSegDist(a,b,r[i],r[(i+1)%r.length]));return d}
function mpRoadSafe(pts,w,B,zones){
 const half=w/2+.035;
 for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];if(dist(a,b)<1e-6)continue;
  if(!insideObj(a,B)||!insideObj(b,B)||!insideObj(lerp(a,b,.5),B)||mpRingDist(a,b,B.pts)<half-1e-5)return false;
  if((B.holes||[]).some(r=>mpRingDist(a,b,r)<half-1e-5))return false;
  const bb=bbox([a,b]).map((v,i)=>v+(i<2?-half:half));
  for(const z of zones){if(!urbanBboxOverlap(bb,bbox(z.pts)))continue;if(insideObj(a,z)||insideObj(b,z)||insideObj(lerp(a,b,.5),z)||mpRingDist(a,b,z.pts)<half-1e-5)return false}
 }return true;
}
function mpOffsetRing(r,d){const a=qClean(r),sign=Math.sign(area(a)),out=[];if(a.length<3||!sign)return null;for(let i=0;i<a.length;i++){const v=a[i],prev=a[(i+a.length-1)%a.length],next=a[(i+1)%a.length],n=mul(perp(norm(sub(v,prev))),d*sign),m=mul(perp(norm(sub(next,v))),d*sign),x=lineIntersection(add(prev,n),add(v,n),add(v,m),add(next,m));if(!x||dist(v,x)>Math.max(20,Math.abs(d)*8))return null;out.push(x)}return simple(out)&&Math.sign(area(out))===sign?out:null}
function mpRoundedRing(r,w,B,zones){
 let out=[];for(let i=0;i<r.length;i++){const a=r[(i+r.length-1)%r.length],b=r[i],c=r[(i+1)%r.length],d=Math.min(9,dist(a,b)*.18,dist(b,c)*.18),x=add(b,mul(norm(sub(a,b)),d)),y=add(b,mul(norm(sub(c,b)),d)),pts=[x];for(let k=1;k<=3;k++){const t=k/3;pts.push(add(add(mul(x,(1-t)**2),mul(b,2*(1-t)*t)),mul(y,t*t)))}out.push(...(mpRoadSafe(pts,w,B,zones)?pts:[b]))}return simple(out)&&mpRoadSafe([...out,out[0]],w,B,zones)?out:r;
}
function mpClipByConvex(subject,clip){let out=subject.slice(),sign=Math.sign(area(clip));for(let i=0;i<clip.length&&out.length;i++){const a=clip[i],b=clip[(i+1)%clip.length],u=sub(b,a),side=v=>cross(u,sub(v,a))*sign;let prev=out.at(-1),sp=side(prev),next=[];for(const v of out){const sv=side(v),pi=sp>=-1e-9,vi=sv>=-1e-9;if(pi!==vi)next.push(lerp(prev,v,sp/(sp-sv)));if(vi)next.push(v);prev=v;sp=sv}out=next}return out}
function mpIntersectionArea(obj,convex){if(!urbanBboxOverlap(bbox(obj.pts),bbox(convex)))return 0;const origin=convex[0],clip=convex.map(v=>sub(v,origin)),ar=r=>{let x=mpClipByConvex(r.map(v=>sub(v,origin)),clip);return x.length>=3?Math.abs(area(x)):0};return Math.max(0,ar(obj.pts)-(obj.holes||[]).reduce((n,h)=>n+ar(h),0))}
function mpConvexFits(l,b){const A=polyArea(l);return A>0&&mpIntersectionArea(b,l.pts)>=A-Math.max(.0002,A*1e-8)}
function mpDisjoint(l,objects){const bb=bbox(l.pts);return !objects.some(o=>urbanBboxOverlap(bb,bbox(o.pts))&&mpIntersectionArea(o,l.pts)>Math.max(.0002,polyArea(l)*1e-8))}
function mpRect(x,y,w,d){return [[x,y],[x+w,y],[x+w,y+d],[x,y+d]]}
function mpFrame(q,angle){const start=q.boundary.pts[0],rad=angle*Math.PI/180,u=[Math.cos(rad),-Math.sin(rad)],v=perp(u);return {uv:pt=>[dot(sub(pt,start),u),dot(sub(pt,start),v)],xy:pt=>add(start,add(mul(u,pt[0]),mul(v,pt[1])))}}
function mpCore(q,s,spec,outer,frame,w){
 if(!s.publicProgram)return null;
 const A=polyArea(q.boundary),need=(kind,pct)=>Math.max(0,A*pct/100-q.zones.filter(z=>z.kind===kind).reduce((n,z)=>n+polyArea(z),0));
 const green=need('green',s.greenPct||0)*(spec.pattern==='compact'?.4:.72),plaza=need('plaza',s.plazaPct||0),leisure=need('leisure',s.leisurePct||0)*.85,desired=green+plaza+leisure;if(desired<Math.max(80,s.min*.5))return null;
 const O={pts:outer},bounds=bbox(outer.map(frame.uv)),dx=bounds[2]-bounds[0],dy=bounds[3]-bounds[1],site=frame.uv(qInteriorPoint(O).v),margin=w/2+.15;
 let best=null;
 for(const factor of [1,.82,.65]){const total=desired*factor;for(const ratio of [spec.ratio||1.7,1,2.5,.65]){const W=Math.sqrt(total*ratio),D=total/W,ow=W+2*margin,od=D+2*margin;if(W<12||D<12||ow>dx-2*w||od>dy-2*w)continue;const candidates=[site,[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2]];for(let i=1;i<=7;i++)for(let k=1;k<=7;k++)candidates.push([bounds[0]+dx*i/8,bounds[1]+dy*k/8]);for(const pt of candidates){const x=pt[0]-W/2,y=pt[1]-D/2,ring=mpRect(x-margin,y-margin,ow,od).map(frame.xy),expanded={pts:mpRect(x-margin-w*.75,y-margin-w*.75,ow+w*1.5,od+w*1.5).map(frame.xy)};if(!mpConvexFits(expanded,O)||!mpDisjoint(expanded,q.zones)||!mpRoadSafe([...ring,ring[0]],w,q.boundary,q.zones))continue;const cost=dist(pt,site)/Math.max(dx,dy)+(1-factor)*2+Math.abs(Math.log(ratio/(spec.ratio||1.7)))*.08;if(!best||cost<best.cost)best={x,y,W,D,ring,box:[x-margin,y-margin,x+W+margin,y+D+margin],total,cost}}}if(best)break}
 if(!best)return null;const c=best,parts=[['plaza','Praça central',plaza],['green','Parque central',green],['leisure','Lazer central',leisure]].filter(x=>x[2]>.01),sum=parts.reduce((n,x)=>n+x[2],0);let pos=c.x;c.zones=[];for(let i=0;i<parts.length;i++){const [kind,name,a]=parts[i],width=i===parts.length-1?c.x+c.W-pos:c.W*a/sum;if(width<.1)continue;c.zones.push({id:uid(),name,kind,urbanGenerated:true,masterCore:true,pts:mpRect(pos,c.y,width,c.D).map(frame.xy),holes:[]});pos+=width}return c;
}
function mpStations(lo,hi,anchors,desired,w,minGap,maxGap){const a=[lo,...anchors.filter(x=>x>lo+1e-5&&x<hi-1e-5),hi].sort((a,b)=>a-b),out=[];for(let i=1;i<a.length;i++){const x=a[i-1],y=a[i],L=y-x;if(i>1)out.push(x);if(L<2*(minGap+w))continue;let n=Math.max(1,Math.round(L/(desired+w)));if(Number.isFinite(maxGap))n=Math.max(n,Math.ceil(L/(maxGap+w)));while(n>1&&L/n<minGap+w-1e-6)n--;for(let k=1;k<n;k++)out.push(x+L*k/n)}return [...new Set(out.map(x=>Math.round(x*100000)/100000))]}
function mpGenerate(q,s,spec){
 const w=spec.w,active=spec.pattern==='active',edgeDepth=active?Math.max(s.d*(spec.band||1),s.min/s.f):0,outer=qClean(q.boundary.pts),curb=active?mpOffsetRing(outer,edgeDepth-.08):null,ring0=mpOffsetRing(outer,w/2+(active?edgeDepth:.40));if(active&&(!curb||curb.length!==outer.length||!urbanConvex(outer)))return null;if(!ring0||!mpRoadSafe([...ring0,ring0[0]],w,q.boundary,q.zones))return null;
 const ring=active?ring0:mpRoundedRing(ring0,w,q.boundary,q.zones),frame=mpFrame(q,spec.angle),bounds=bbox(ring.map(frame.uv)),core=mpCore(q,s,spec,ring,frame,w);
 if(s.publicProgram&&!core){const need=URBAN_CATEGORIES.filter(c=>['green','plaza','leisure'].includes(c.kind)).reduce((sum,c)=>sum+Math.max(0,polyArea(q.boundary)*(s[c.key]||0)/100-q.zones.filter(z=>z.kind===c.kind).reduce((n,z)=>n+polyArea(z),0)),0);if(need>=Math.max(80,s.min*.5))return null;}if(core)q.zones.push(...core.zones);
 const roads=[];let seq=0;
 function road(pts,cls,name){if(pts.length<2||length(pts)<w)return;roads.push({id:uid(),name:name||'Via local '+String(++seq).padStart(2,'0'),pts,width:w,cls,smooth:false,optimized:true,masterRoad:true})}
 road([...ring,ring[0]],'Local',active?'Circuito de bordas ativas':'Circuito de contorno');if(core)road([...core.ring,core.ring[0]],'Coletora','Alameda do parque');
 const xAnchor=core?[core.box[0],core.box[2]]:[],yAnchor=core?[core.box[1],core.box[3]]:[],depth=s.d*s.rows,minDepth=Math.max(s.d*(s.flex?.85:1),s.min/(s.f*(s.flex?1.2:1)))*s.rows;
 const xs=mpStations(bounds[0],bounds[2],xAnchor,Math.max(s.f*3,Math.min(s.maxBlock,spec.maxBlock||s.maxBlock)),w,Math.max(s.f*1.4,25),s.maxBlock),ys=mpStations(bounds[1],bounds[3],yAnchor,depth*(s.flex?1.18:1),w,Math.max(minDepth*.85,s.d),Infinity),ringUV=ring.map(frame.uv);
 function line(axis,value){const r=axis===1?ringUV:ringUV.map(v=>[v[1],v[0]]);let intervals=parcelIntervalsAt([r],value);if(core){const box=axis===1?core.box:[core.box[1],core.box[0],core.box[3],core.box[2]];if(value>=box[1]-1e-4&&value<=box[3]+1e-4)intervals=optSubtract(intervals,box[0],box[2])}for(const [lo,hi] of intervals){if(hi-lo<Math.max(w*2,s.f))continue;const a=frame.xy(axis===1?[lo,value]:[value,lo]),b=frame.xy(axis===1?[hi,value]:[value,hi]);if(!mpRoadSafe([a,b],w,q.boundary,q.zones))continue;if(roads.some(r=>optDuplicate(a,b,r,w)))continue;road([a,b],'Local')}}
 for(const y of ys)line(1,y);for(const x of xs)line(0,x);if(roads.length<2||roads.length>160)return null;
 if(s.hierarchy){const local=roads.slice(core?2:1).sort((a,b)=>length(b.pts)-length(a.pts))[0];if(local){local.cls='Coletora';local.name='Via coletora principal'}}
 let accessCount=0;if(Number.isInteger(s.accessEdge)&&s.accessEdge>=0){const B=q.boundary.pts,i=s.accessEdge;if(i>=B.length)return null;const a=B[i],b=B[(i+1)%B.length];if(dist(a,b)<w*3)return null;const entry=lerp(a,b,.5);let target=null,best=Infinity;for(let k=0;k<ring.length;k++){const pt=nearest(entry,ring[k],ring[(k+1)%ring.length]),d=dist(entry,pt);if(d<best){target=pt;best=d}}if(!target||best>Math.max(w*3,edgeDepth+w*2)||q.zones.some(z=>insideObj(entry,z)||insideObj(target,z)||mpRingDist(entry,target,z.pts)<w/2+.05))return null;roads.push({id:uid(),name:'Acesso indicado (confirmar)',pts:[entry,target],width:w,cls:'Coletora',smooth:false,optimized:true,masterRoad:true,masterAccess:true});accessCount=1}q.masterplan={engine:2,style:spec.pattern,core:!!core,accessCount,accessStatus:accessCount?'Acesso indicado; conexão externa a conferir':'Acessos externos não definidos',roadWidth:w,...(active?{edgeBand:{outer,curb,depth:edgeDepth}}:{})};return roads;
}
function mpOpenEnds(q){let count=0;for(const r of q.roads){if(dist(r.pts[0],r.pts.at(-1))<.05)continue;for(const [k,pt] of [r.pts[0],r.pts.at(-1)].entries())if(!(r.masterAccess&&k===0&&q.boundary&&mpRingDist(pt,pt,q.boundary.pts)<.001)&&!q.roads.some(o=>o!==r&&roadPts(o).slice(1).some((b,i)=>dist(pt,nearest(pt,roadPts(o)[i],b))<.15)))count++}return count}
function mpSpecs(q,s){if(s.mode==='new'&&s.morphology==='active')return mpActiveSpecs(q,s);const basic=optSpecs(q,{...s,morphology:'orthogonal'}),uniq=a=>[...new Set(a)];if(s.mode==='keep'||s.morphology==='orthogonal'||!s.morphology)return basic;const angles=uniq(basic.map(a=>a.angle)).slice(0,3),widths=uniq([s.wmin,s.wmax]),out=[];for(const angle of angles)for(const w of widths)for(const ratio of [1.7,1.05])out.push({angle,w,pattern:s.morphology==='compact'?'compact':'garden',ratio,maxBlock:s.maxBlock,phase:.5,master:true});return s.morphology==='compare'?[...mpActiveSpecs(q,s).slice(0,8),...out.slice(0,8),...basic.slice(0,8)]:out}
function mpHalfPlane(r,origin,normal,positive){const u=norm(normal),v=perp(u),uv=pt=>[dot(sub(pt,origin),u),dot(sub(pt,origin),v)],xy=pt=>add(origin,add(mul(u,pt[0]),mul(v,pt[1])));return qClean(parcelClip(r.map(uv),0,0,positive).map(xy))}
function mpRows(o,s,prep){
 if(o.holes?.length)return [];
 const frames=parcelFrames(o,{...s,quick:false},prep),fronts=frames.fronts.filter(f=>f.roadScore>=2||!s.road),options=[];
 for(const a of fronts.slice(0,4)){
  if(s.rows===2)for(const b of frames.backs.filter(x=>x.i!==a.i&&dot(a.v,x.v)<-.72&&(x.roadScore>=2||!s.road)).slice(0,3)){
   const span=Math.min(dot(sub(b.mid,a.start),a.v),dot(sub(a.mid,b.start),b.v));if(span<s.d*1.45||span>s.d*2.9)continue;
   const n=norm(sub(a.v,b.v)),mid=lerp(a.mid,b.mid,.5),r1=mpHalfPlane(o.pts,mid,n,false),r2=mpHalfPlane(o.pts,mid,n,true);
   if(r1.length>=3&&r2.length>=3&&Math.abs(Math.abs(area(r1))+Math.abs(area(r2))-polyArea(o))<.002)options.push([{f:a,ring:r1,row:1},{f:b,ring:r2,row:2}])
  }
  options.push([{f:a,ring:o.pts,row:1}]);
 }return options;
}
function mpDivideRow(o,s,part,workingLots,prep,limit){
 const {f,ring,row}=part,uv=pt=>[dot(sub(pt,f.start),f.u),dot(sub(pt,f.start),f.v)],xy=pt=>add(f.start,add(mul(f.u,pt[0]),mul(f.v,pt[1]))),raw=ring.map(uv),bb=bbox(raw),d=Math.min(bb[3],s.d*(s.edgeActive?1.5:1.4));if(d<s.d*.85||!Number.isFinite(d)||f.len<s.f-1e-6)return [];
 let a=qClean(parcelClip(parcelClip(raw,1,0,true),1,d,false));if(a.length<3||!simple(a))return [];
 const full=Math.abs(area(a)),n0=Math.min(Math.floor((f.len+1e-6)/s.f),Math.floor((full+.00001)/s.min),limit);if(n0<1)return [];
 const box=bbox(a),cutArea=x=>{let q=parcelClip(a,0,x,false);return q.length<3?0:Math.abs(area(q))};
 for(let n=n0;n>=Math.max(1,n0-3);n--){const cuts=[0];for(let i=1;i<n;i++){let lo=cuts.at(-1)+s.f,hi=f.len-(n-i)*s.f;const target=full*i/n;for(let k=0;k<25&&hi-lo>1e-7;k++){const x=(lo+hi)/2;if(cutArea(x)<target)lo=x;else hi=x}cuts.push((lo+hi)/2)}cuts.push(f.len);const candidates=[];let ok=true;
  for(let i=0;i<n;i++){const l=i===0?Math.min(box[0],cuts[i]):cuts[i],r=i===n-1?Math.max(box[2],cuts[i+1]):cuts[i+1];let ring2=qClean(parcelClip(parcelClip(a,0,l,true),0,r,false));if(ring2.length<3||!simple(ring2)){ok=false;break}
   let hull=qHull(ring2),A=Math.abs(area(ring2));if(!urbanConvex(ring2)){if(Math.abs(Math.abs(area(hull))-A)>.0001){ok=false;break}ring2=hull}
   const width=cuts[i+1]-cuts[i];if(width<s.f-1e-5||width>s.f*1.45+1e-5||A<s.min-1e-5){ok=false;break}
   let pts=qClean(ring2.map(xy)),idx=pts.findIndex((p0,k)=>Math.abs(uv(p0)[1])<1e-5&&Math.abs(uv(pts[(k+1)%pts.length])[1])<1e-5);if(idx>=0)pts=pts.slice(idx).concat(pts.slice(0,idx));
   const lot={id:uid(),name:'Lote',pts,blockId:o.id,auto:true,frontage:width,depth:A/width,frontEdge:idx>=0?0:null,parcelRow:row,parcelV:20,adaptive:true},face=[xy([cuts[i],0]),xy([cuts[i+1],0])];
   if(idx<0||!mpConvexFits(lot,o)||p.boundary&&!mpConvexFits(lot,p.boundary)||!mpDisjoint(lot,[...workingLots,...p.zones,...candidates])||s.road&&!parcelFrontNearRoad(face,mul(f.v,-1),s,prep)){ok=false;break}candidates.push(lot)
  }if(ok&&candidates.length===n)return candidates
 }return [];
}
function mpAdaptiveParcel(o,s,working,prep,limit){const baseline=planParcelArea(o,s,working,prep,limit);if(!s.adaptive||!s.flexDepth||!o.auto||o.holes?.length)return baseline;let best=baseline;for(const config of mpRows(o,s,prep)){let lots=[],rows=[];for(const part of config){const a=mpDivideRow(o,s,part,[...working,...lots],prep,Math.max(0,limit-lots.length));lots.push(...a);rows.push({row:part.row,count:a.length,area:a.reduce((n,l)=>n+polyArea(l),0),depth:a.length?a.reduce((n,l)=>n+l.depth,0)/a.length:s.d,reason:a.length?'':'Divisa não comporta lotes adaptativos.'})}const A=lots.reduce((n,l)=>n+polyArea(l),0),double=rows.filter(r=>r.count>0).length,oldDouble=best.rows.filter(r=>r.count>0).length;if(lots.length&&(double>=oldDouble&&A>best.area+.01||double>oldDouble&&A>=best.area*.90))best={...baseline,lots,rows,area:A,adjusted:true,adaptive:true,limit:false,rejected:{shape:0,road:0,access:0,occupied:0,minimum:0}}}return best}
function mpAudit(c){const q=c.q,A=c.area,residual=Math.max(0,A-c.lotArea-c.roadArea-Object.values(c.program?.areas||{}).reduce((n,x)=>n+x,0));return {ends:mpOpenEnds(q),residual,residualPct:residual/A*100,adaptive:q.lots.filter(l=>l.adaptive).length,edgeLots:q.lots.filter(l=>l.edgeLot).length,core:q.zones.some(z=>z.masterCore),style:q.masterplan?.style||'orthogonal',accessCount:q.masterplan?.accessCount||0,accessStatus:q.masterplan?.accessStatus||'Acessos externos não definidos'}}


function mpRoadTrees(q,z){let h='',num=0;const step=Math.max(13,12/z);for(const r of q.roads.filter(r=>r.cls!=='Local'||r.name==='Circuito de contorno'||r.name==='Circuito de bordas ativas')){const pts=roadPts(r);for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],L=dist(a,b),u=norm(sub(b,a)),n=perp(u);for(let t=step;t<L-step*.5&&num<180;t+=step)for(const sign of [-1,1]){const pt=add(add(a,mul(u,t)),mul(n,sign*(r.width/2-.8)));if(!insideObj(pt,q.boundary))continue;if(q.roads.some(o=>o!==r&&roadPts(o).slice(1).some((v,k)=>dist(pt,nearest(pt,roadPts(o)[k],v))<o.width/2+1.5)))continue;h+='<circle cx="'+pt[0].toFixed(2)+'" cy="'+pt[1].toFixed(2)+'" r="1.45" fill="#7ca073" stroke="#4e7954" stroke-width="'+.32/z+'"/>';num++}}}return h}
function mpGraphic(q,z,namespace='sheet'){
 const B=q.boundary,ln=1/z,clip=namespace==='preview'?'optBoundaryClip':'mp-'+namespace;let h='<defs><clipPath id="'+clip+'"><path d="'+polyPath(B)+'" fill-rule="evenodd" clip-rule="evenodd"/></clipPath></defs><path d="'+polyPath(B)+'" fill="#e4e8d9" stroke="#42584a" stroke-width="'+1.2*ln+'" fill-rule="evenodd"/><g clip-path="url(#'+clip+')">';
 for(const b of q.blocks)h+='<path d="'+polyPath(b)+'" fill="#e3e7d7" stroke="#aeb9a2" stroke-width="'+.42*ln+'" fill-rule="evenodd"/>';
 for(const l of q.lots)h+='<path d="'+polyPath(l)+'" fill="'+(l.blockConflict?'#db8c7c':'#ead8b6')+'" stroke="#9e957d" stroke-width="'+.55*ln+'" stroke-linejoin="round"/>';
 for(const o of q.zones)h+='<path d="'+polyPath(o)+'" fill="'+(zoneTypes[o.kind]||zoneTypes.other)[1]+'" stroke="#688262" stroke-width="'+.6*ln+'" fill-rule="evenodd"/>'+urbanZoneDecor(o,z,namespace);
 for(const r of q.roads)h+='<path d="'+path(roadPts(r))+'" fill="none" stroke="#aeb5aa" stroke-width="'+(r.width+.65*ln)+'" stroke-linecap="round" stroke-linejoin="round"/>';
 for(const r of q.roads)h+='<path d="'+path(roadPts(r))+'" fill="none" stroke="#eceade" stroke-width="'+r.width+'" stroke-linecap="round" stroke-linejoin="round"/>';
 for(const r of q.roads)h+='<path d="'+path(roadPts(r))+'" fill="none" stroke="'+(r.cls==='Local'?'#9b9e9b':'#7c8885')+'" stroke-width="'+urbanRoadPavement(r)+'" stroke-linecap="round" stroke-linejoin="round"/>';
 for(const r of q.rounds)h+='<circle cx="'+r.c[0]+'" cy="'+r.c[1]+'" r="'+r.r+'" fill="#929b95"/><circle cx="'+r.c[0]+'" cy="'+r.c[1]+'" r="'+(r.r-r.w)+'" fill="#8aa77b"/>';
 h+=mpRoadTrees(q,z);
 const label=(pt,name,size,fill='#365144')=>'<text x="'+pt[0]+'" y="'+pt[1]+'" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="'+size*ln+'" font-weight="650" paint-order="stroke" stroke="#faf9f1" stroke-width="'+2*ln+'" fill="'+fill+'">'+esc(name)+'</text>';
 for(const b of q.blocks){const s=blockStats(b);if(s.anchor.clearance*z>14&&q.lots.some(l=>l.blockId===b.id))h+=label(s.anchor.v,b.name,10,'#5b5546')}
 for(const o of q.zones){const s=blockStats(o),name=o.masterCore?o.name:o.kind==='green'?'Área verde':o.kind==='institutional'?'Institucional':o.kind==='leisure'?'Lazer':o.kind==='plaza'?'Praça':o.kind==='app'?'APP':o.name;if(s.anchor.clearance*z>=Math.max(13,name.length*2.5))h+=label(s.anchor.v,name,9.5)}
 return h+'</g><path d="'+polyPath(B)+'" fill="none" stroke="#435c4c" stroke-width="'+1.2*ln+'" fill-rule="evenodd"/>';
}
function mpSheet(c){
 const q=c.q,B=q.boundary,bb=bbox(B.pts),dx=bb[2]-bb[0],dy=bb[3]-bb[1],W=1260,H=860,z=Math.min(870/Math.max(dx,1),638/Math.max(dy,1)),x=45+(890-dx*z)/2-bb[0]*z,y=132+(640-dy*z)/2-bb[1]*z;
 const scale=[10,20,50,100,200,500].filter(n=>n*z<=130).at(-1)||5,audit=c.audit||mpAudit(c),style=audit.style==='active'?'Bairro de bordas ativas':audit.style==='garden'?'Bairro-jardim':audit.style==='compact'?'Circuito compacto':'Malha ortogonal';
 let h='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'"><rect width="'+W+'" height="'+H+'" fill="#faf9f3"/><rect x="24" y="24" width="1212" height="812" fill="none" stroke="#cdd4c5"/><g font-family="Arial,sans-serif"><text x="45" y="58" font-size="12" letter-spacing="3" fill="#526b59" font-weight="700">ÉVORA URBANISMO  /  TRAÇADO STUDIO</text><text x="45" y="98" font-size="32" font-weight="700" fill="#253e34">'+esc(String(q.name||'Estudo preliminar').slice(0,56))+'</text><text x="45" y="118" font-size="12" fill="#69776a">'+esc(style)+'  ·  ESTUDO CONCEITUAL  ·  GEOMETRIA LOCAL EM METROS</text><path d="M45 130H1215" stroke="#cdd4c5"/><g transform="translate('+x+' '+y+') scale('+z+')">'+mpGraphic(q,z,'sheet')+'</g>';
 h+='<rect x="956" y="145" width="260" height="632" fill="#f1f3eb" stroke="#dce1d5"/><text x="974" y="174" font-size="11" letter-spacing="2" fill="#667d69" font-weight="700">QUADRO URBANÍSTICO</text>';
 const stats=[['Área da gleba',fmt(c.area,0)+' m²'],['Lotes',String(c.lotCount)],['Área comercializável',fmt(c.yield,1)+'%'],['Área viária estimada',fmt(c.roadPct,1)+'%'],['Lotes adaptativos',String(audit.adaptive)],['Pontas viárias livres',String(audit.ends)]];
 for(let i=0;i<stats.length;i++){let yy=205+i*43;h+='<text x="974" y="'+yy+'" font-size="10.5" fill="#66786b">'+stats[i][0]+'</text><text x="974" y="'+(yy+19)+'" font-size="18" fill="#29483a" font-weight="700">'+esc(stats[i][1])+'</text>'}
 h+='<path d="M974 467H1198" stroke="#d0d8cb"/><text x="974" y="490" font-size="11" letter-spacing="1.5" fill="#667d69" font-weight="700">LEGENDA</text>';
 const lg=[['Lotes','#ead8b6'],['Vias e passeios','#9b9e9b'],...URBAN_CATEGORIES.map(c=>[c.name,(zoneTypes[c.kind]||zoneTypes.other)[1]]),['APP / restrição','#78aaa0'],['Área a definir','#e4e8d9']];
 for(let i=0;i<lg.length;i++){let yy=511+i*25;h+='<rect x="974" y="'+(yy-11)+'" width="14" height="14" rx="2" fill="'+lg[i][1]+'" stroke="#9eaa97"/><text x="997" y="'+yy+'" font-size="12" fill="#43594b">'+esc(lg[i][0])+'</text>'}
 h+='<text x="974" y="737" font-size="10" fill="#7b6948">'+esc(audit.accessCount?'Acesso indicado: conferir.':'Acessos externos: a definir.')+'</text><text x="974" y="752" font-size="10" fill="#7b6948">Sem topografia ou validação legal.</text>';
 h+='<g transform="translate(62 156)"><path d="M0 31L11 0L22 31L11 25Z" fill="#385546"/><path d="M11 0L22 31L11 25Z" fill="#9aab95"/><text x="11" y="-7" text-anchor="middle" font-size="12" font-weight="700" fill="#385546">N</text></g>';
 h+='<g transform="translate(52 795)"><rect width="'+scale*z+'" height="6" fill="#3e5848"/><rect x="'+scale*z/2+'" width="'+scale*z/2+'" height="6" fill="#faf9f3" stroke="#3e5848"/><text x="0" y="19" font-size="10">0</text><text x="'+scale*z+'" y="19" font-size="10" text-anchor="end">'+scale+' m</text></g><text x="1215" y="808" text-anchor="end" font-size="10" fill="#718075">Não constitui projeto executivo ou documento de aprovação.</text></g></svg>';return h;
}

function mpZoneName(o){return o.masterCore?o.name:o.kind==='green'?'Área verde':o.kind==='institutional'?'Institucional':o.kind==='leisure'?'Lazer':o.kind==='plaza'?'Praça':o.kind==='app'?'APP':o.name}
function mpCurrent(){
 if(!p.boundary)return null;const A=polyArea(p.boundary),valid=p.lots.filter(l=>!l.blockConflict),lotArea=valid.reduce((n,l)=>n+polyArea(l),0),prep=prepared(),roadArea=optRoadArea(p,prep),areas=urbanExistingAreas(p,prep),c={q:p,area:A,lotCount:valid.length,lotArea,yield:lotArea/A*100,roadArea,roadPct:roadArea/A*100,program:{areas}};c.audit=mpAudit(c);return c;
}
function installMasterSheet(){
 $('masterSheetBtn').onclick=()=>{const c=mpCurrent();if(!c)return toast('Defina a gleba antes de gerar a prancha.');$('masterSheetView').innerHTML=mpSheet(c);$('masterSheetDialog').showModal()};
 $('masterSheetClose').onclick=()=>$('masterSheetDialog').close();
 $('masterSheetDownload').onclick=()=>{const c=mpCurrent();if(c)download(filename()+'_masterplan.svg',mpSheet(c),'image/svg+xml;charset=utf-8')};
}

/* An inward circuit creates genuine street-fronting plots along the property boundary.
   Each peripheral lot occupies a verified convex sector between the curb and the cadastral edge. */
function mpEdgeLots(q,s,prep){
 const info=q.masterplan?.edgeBand;if(!info)return [];
 const B=info.outer,C=info.curb,out=[],blocks=q.blocks.filter(b=>b.edgeBlock);
 for(let i=0;i<B.length;i++){
  const j=(i+1)%B.length,a=C[i],b=C[j],A=B[i],Z=B[j],len=dist(a,b),sector=[a,b,Z,A];
  if(len<s.f-1e-6||!simple(sector)||!urbanConvex(sector))continue;
  const sectorArea=Math.abs(area(sector)),n0=Math.min(Math.floor((len+1e-6)/s.f),Math.floor((sectorArea+1e-6)/s.min));if(n0<1||n0>500)continue;
  let best=[];
  for(let n=n0;n>=Math.max(1,n0-4);n--){
   const width=len/n;if(width>s.f*1.45+1e-5)continue;
   let lots=[];
   for(let k=0;k<n;k++){
    const t=k/n,T=(k+1)/n,pts=qClean([lerp(a,b,t),lerp(a,b,T),lerp(A,Z,T),lerp(A,Z,t)]),areaM=Math.abs(area(pts));
    if(pts.length!==4||!simple(pts)||!urbanConvex(pts)||areaM<s.min-1e-5||areaM/width<s.d*.83||areaM/width>s.d*1.65)continue;
    const l={id:uid(),name:'Lote',pts,auto:true,adaptive:true,frontage:width,depth:areaM/width,frontEdge:0,parcelRow:1,parcelV:21,edgeLot:true};
    const owner=blocks.find(b=>mpConvexFits(l,b));if(!owner||!mpConvexFits(l,q.boundary)||!mpDisjoint(l,[...q.zones,...out,...lots]))continue;
    const normal=mul(perp(norm(sub(pts[1],pts[0]))),-Math.sign(area(pts)));
    if(!parcelFrontNearRoad([pts[0],pts[1]],normal,{...s,tolerance:.35},prep))continue;
    l.blockId=owner.id;lots.push(l);
   }
   if(lots.reduce((n,l)=>n+polyArea(l),0)>best.reduce((n,l)=>n+polyArea(l),0))best=lots;
   if(lots.length===n)break;
  }
  out.push(...best);
 }
 const count=new Map();for(const l of out){let k=(count.get(l.blockId)||0)+1;count.set(l.blockId,k);l.name=(q.blocks.find(b=>b.id===l.blockId)?.name||'Borda')+' / L'+String(k).padStart(2,'0')}
 return out;
}
function mpActiveSpecs(q,s){
 const basic=optSpecs(q,{...s,morphology:'orthogonal'}),angles=[...new Set(basic.map(a=>a.angle))].slice(0,s.rotate?3:1),widths=[...new Set([s.wmin,s.wmax])],a=[];
 for(const w of widths)for(const angle of angles)for(const band of [.94,1.04])for(const ratio of [1.3,2.0])a.push({angle,w,band,pattern:'active',ratio,maxBlock:s.maxBlock,phase:.5,master:true});
 return a.slice(0,24);
}
