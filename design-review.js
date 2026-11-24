
'use strict';
/* Design Review: advisory screening of actual geometry. No legal certification.
   All dimensions are local planar metres. The walking model uses street axes as a
   proxy for pedestrian paths and assumes potential entrances at street-facing
   portions of public spaces; sidewalks, crossings and entry points are not surveyed. */
const QA_FIELDS={
 angle:{id:'qaAngle',label:'Ângulo mínimo de cruzamento',lo:15,hi:90,value:45},
 spacing:{id:'qaSpacing',label:'Distância mínima entre interseções',lo:5,hi:200,value:30},
 radius:{id:'qaRadius',label:'Raio geométrico indicativo',lo:3,hi:200,value:15},
 park:{id:'qaPark',label:'Distância pela rede até convivência',lo:50,hi:2000,value:400},
 footW:{id:'qaFootW',label:'Largura da implantação-teste',lo:2,hi:50,value:8},
 footD:{id:'qaFootD',label:'Profundidade da implantação-teste',lo:2,hi:80,value:12},
 setback:{id:'qaSetback',label:'Afastamento perimetral de estudo',lo:0,hi:15,value:1.5},
 grade:{id:'qaGrade',label:'Declive longitudinal natural de referência',lo:1,hi:40,value:10}
};
let qaTerrain=null,qaTerrainName='',qaLastReport=null;
function qaInputs(){
 const a={enabled:$('qaEnabled').checked,strict:$('qaStrict').checked,terrain:qaTerrain};
 for(const [k,f] of Object.entries(QA_FIELDS))a[k]=optNumber($(f.id).value);
 return a;
}
function qaDefaults(){return {enabled:true,strict:false,terrain:null,...Object.fromEntries(Object.entries(QA_FIELDS).map(([k,f])=>[k,f.value]))}}
function qaInit(){
 const prior=p.designReviewSettings||{};for(const [k,f] of Object.entries(QA_FIELDS))$(f.id).value=String(Number.isFinite(prior[k])?prior[k]:f.value);
 $('qaEnabled').checked=prior.enabled!==false;$('qaStrict').checked=!!prior.strict;
 qaTerrain=null;qaTerrainName='';$('qaTerrainFile').value='';$('qaTerrainInfo').textContent='Sem modelo de terreno. Relevo e declividades não verificados.';
}
function qaDiagnostics(r){
 if(!r?.enabled)return [];
 return Object.entries(QA_FIELDS).filter(([k,f])=>!Number.isFinite(r[k])||r[k]<f.lo||r[k]>f.hi).map(([k,f])=>({keys:[f.id],message:f.label+': informe valor entre '+f.lo+' e '+f.hi+'.'}));
}
function qaParseTerrain(raw){
 if(typeof raw!=='string'||raw.length>8000000)throw Error('Arquivo de terreno excede 8 MB.');
 const lines=raw.replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
 if(lines.length<5||lines.length>100001)throw Error('Forneça de 4 a 100.000 pontos em grade retangular completa.');
 const sep=lines[0].includes(';')?';':',';
 const head=lines[0].split(sep).map(x=>x.trim().toLowerCase());
 if(head.length!==3||head[0]!=='x'||head[1]!=='y'||head[2]!=='z')throw Error('Cabeçalho obrigatório: x;y;z. X leste, Y norte, Z cota, todos em metros locais.');
 const rows=[],xs=new Set(),ys=new Set(),seen=new Set();
 for(let i=1;i<lines.length;i++){
  const a=lines[i].split(sep).map(x=>optNumber(x.trim()));if(a.length!==3||a.some(v=>!Number.isFinite(v)||Math.abs(v)>1e8))throw Error('Linha '+(i+1)+': coordenada/cota inválida.');
  const [x,Y,z]=a,y=-Y,k=x+','+y;if(seen.has(k))throw Error('Ponto duplicado na linha '+(i+1)+'.');seen.add(k);xs.add(x);ys.add(y);rows.push([x,y,z]);
 }
 const X=[...xs].sort((a,b)=>a-b),Y=[...ys].sort((a,b)=>a-b);
 if(X.length<2||Y.length<2||X.length*Y.length!==rows.length)throw Error('Grade incompleta. Não é permitido interpolar células sem os quatro vértices.');
 const xi=new Map(X.map((x,i)=>[x,i])),yi=new Map(Y.map((y,i)=>[y,i])),Z=new Float64Array(rows.length);
 for(const [x,y,z] of rows)Z[yi.get(y)*X.length+xi.get(x)]=z;
 return {X,Y,Z:Array.from(Z),points:rows.length};
}
function qaTerrainZ(g,pt){
 if(!g)return null;const [x,y]=pt,X=g.X,Y=g.Y;if(x<X[0]-1e-7||x>X.at(-1)+1e-7||y<Y[0]-1e-7||y>Y.at(-1)+1e-7)return null;
 function lower(a,v){let lo=0,hi=a.length-1;while(hi-lo>1){let m=(lo+hi)>>1;if(a[m]<=v)lo=m;else hi=m}return lo}
 let i=lower(X,x),j=lower(Y,y),u=clamp((x-X[i])/(X[i+1]-X[i]),0,1),v=clamp((y-Y[j])/(Y[j+1]-Y[j]),0,1),n=X.length,k=j*n+i,z=g.Z;
 return (1-u)*(1-v)*z[k]+u*(1-v)*z[k+1]+(1-u)*v*z[k+n]+u*v*z[k+n+1];
}
function qaContour(q,g){
 if(!g)return null;const X=g.X,Y=g.Y,n=X.length,z=g.Z;let a=0,b=0,w=0;
 for(let j=0;j<Y.length-1;j++)for(let i=0;i<X.length-1;i++){
  const pt=[(X[i]+X[i+1])/2,(Y[j]+Y[j+1])/2];if(q.boundary&&!insideObj(pt,q.boundary))continue;
  const k=j*n+i,dx=X[i+1]-X[i],dy=Y[j+1]-Y[j],gx=(z[k+1]-z[k]+z[k+n+1]-z[k+n])/(2*dx),gy=(z[k+n]-z[k]+z[k+n+1]-z[k+1])/(2*dy),L=Math.hypot(gx,gy);
  if(L<.01)continue;const angle=Math.atan2(gx,-gy),weight=dx*dy*Math.min(.5,L);a+=Math.cos(2*angle)*weight;b+=Math.sin(2*angle)*weight;w+=weight;
 }
 if(!w||Math.hypot(a,b)/w<.25)return null;const t=Math.atan2(b,a)/2;return ((bearing([0,0],[Math.cos(t),Math.sin(t)])%180)+180)%180;
}
function qaTerrainStats(q,r){
 const g=r.terrain;if(!g)return null;let total=0,known=0,above=0,max=0;const step=10;
 for(const road of q.roads){const a=roadPts(road);for(let i=1;i<a.length;i++){const A=a[i-1],B=a[i],L=dist(A,B);if(L<.001)continue;const N=Math.ceil(L/step);for(let k=0;k<N;k++){const x=lerp(A,B,k/N),y=lerp(A,B,(k+1)/N),l=L/N,z=qaTerrainZ(g,x),Z=qaTerrainZ(g,y);total+=l;if(z===null||Z===null)continue;known+=l;const slope=100*Math.abs(Z-z)/l;max=Math.max(max,slope);if(slope>r.grade+1e-7)above+=l;}}}
 return {total,known,coverage:total?known/total*100:0,above,max:known?max:null,abovePct:known?above/known*100:null,contour:qaContour(q,g)};
}
function qaSpecs(q,s){
 const base=orgSpecs(q,s),r=s.review;
 if(!r?.enabled||!r.terrain||!s.rotate||s.mode!=='new'||!base.length)return base;
 const angle=qaContour(q,r.terrain);if(angle===null)return base;
 const extra=[];for(const a of [angle,(angle+90)%180])for(const sp of base.filter((x,i)=>i===0||i===Math.floor(base.length/2))){
  if(base.some(x=>Math.min(Math.abs(x.angle-a),180-Math.abs(x.angle-a))<3&&x.w===sp.w&&x.bend===sp.bend))continue;
  extra.push({...sp,angle:a,terrainSeed:true})
 }
 return [...extra,...base].slice(0,28);
}
/* Build an undirected, weighted centreline graph. Split at crossings and T joints. */
function qaGraph(q){
 const segs=[];for(const r of q.roads){const pts=roadPts(r);for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],len=dist(a,b);if(len>.015)segs.push({a,b,len,ts:[0,1],box:bbox([a,b]),w:r.width/2,road:r.id})}}
 if(segs.length>3000)throw Error('Rede extensa: faça a revisão por setores (limite de 3.000 segmentos).');
 const snap=.025;let ordered=segs.slice().sort((a,b)=>a.box[0]-b.box[0]);
 const put=(e,pt)=>{const d=sub(e.b,e.a);e.ts.push(clamp(dot(sub(pt,e.a),d)/dot(d,d),0,1))};
 for(let i=0;i<ordered.length;i++){const a=ordered[i];for(let j=i+1;j<ordered.length;j++){const b=ordered[j];if(b.box[0]>a.box[2]+snap)break;if(b.box[1]>a.box[3]+snap||b.box[3]<a.box[1]-snap)continue;
  const v=segmentIntersection(a.a,a.b,b.a,b.b);if(v){put(a,v);put(b,v)}else for(const [x,y] of [[a,b],[b,a]])for(const v of [x.a,x.b])if(dist(v,nearest(v,y.a,y.b))<snap)put(y,v);
 }}
 const nodes=[],edges=[],buckets=new Map(),keys=new Set();
 function node(v){const x=Math.floor(v[0]/snap),y=Math.floor(v[1]/snap);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const id of buckets.get((x+i)+','+(y+j))||[])if(dist(nodes[id].pt,v)<=snap)return id;const id=nodes.length,k=x+','+y;nodes.push({pt:v,adj:[]});if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(id);return id}
 for(const s of segs){const ts=[...new Set(s.ts.map(t=>Math.round(t*1e9)/1e9))].sort((a,b)=>a-b);for(let i=1;i<ts.length;i++){const a=lerp(s.a,s.b,ts[i-1]),b=lerp(s.a,s.b,ts[i]),L=dist(a,b);if(L<.015)continue;const A=node(a),B=node(b);if(A===B)continue;const k=Math.min(A,B)+'|'+Math.max(A,B);if(keys.has(k))continue;keys.add(k);const e={id:edges.length,A,B,a:nodes[A].pt,b:nodes[B].pt,len:dist(nodes[A].pt,nodes[B].pt),w:s.w,road:s.road,box:bbox([nodes[A].pt,nodes[B].pt])};edges.push(e);nodes[A].adj.push(e.id);nodes[B].adj.push(e.id)}}
 let components=0;const seen=new Set();for(let i=0;i<nodes.length;i++){if(seen.has(i))continue;components++;const todo=[i];seen.add(i);for(let j=0;j<todo.length;j++)for(const ei of nodes[todo[j]].adj){const e=edges[ei],v=e.A===todo[j]?e.B:e.A;if(!seen.has(v)){seen.add(v);todo.push(v)}}}
 return {nodes,edges,components,roundabouts:q.rounds.length};
}
function qaNetworkChecks(q,g,r){
 const other=(e,i)=>e.A===i?e.B:e.A,junctions=g.nodes.map((n,i)=>({n,i})).filter(({n})=>n.adj.length>=3);let minAngle=Infinity,acute=0;
 for(const {n,i} of junctions){const vectors=n.adj.map(ei=>norm(sub(g.nodes[other(g.edges[ei],i)].pt,n.pt)));let m=Infinity;for(let a=0;a<vectors.length;a++)for(let b=a+1;b<vectors.length;b++)m=Math.min(m,Math.acos(clamp(dot(vectors[a],vectors[b]),-1,1))*180/Math.PI);minAngle=Math.min(minAngle,m);if(m<r.angle-.001)acute++}
 let short=0,minSpacing=Infinity;const used=new Set();
 for(const {n,i} of junctions)for(const ei of n.adj){if(used.has(ei))continue;let e=g.edges[ei],prev=i,v=other(e,i),L=e.len;used.add(ei);let guard=0;
  while(g.nodes[v].adj.length===2&&guard++<g.edges.length){const next=g.nodes[v].adj.find(id=>id!==e.id);if(used.has(next))break;used.add(next);e=g.edges[next];prev=v;v=other(e,v);L+=e.len}
  if(v!==i&&g.nodes[v].adj.length>=3){minSpacing=Math.min(minSpacing,L);if(L<r.spacing-.001)short++}
 }
 let bends=0,tight=0,minRadius=Infinity;for(const road of q.roads){const a=roadPts(road),closed=dist(a[0],a.at(-1))<.03,pts=closed?a.slice(0,-1):a;for(let i=closed?0:1;i<pts.length-(closed?0:1);i++){const A=pts[(i+pts.length-1)%pts.length],B=pts[i],C=pts[(i+1)%pts.length],ab=dist(A,B),bc=dist(B,C),ca=dist(C,A);if(Math.min(ab,bc)<.25)continue;const turn=Math.acos(clamp(dot(norm(sub(B,A)),norm(sub(C,B))),-1,1))*180/Math.PI;if(turn<2)continue;
  const crossArea=Math.abs(cross(sub(B,A),sub(C,A)));if(crossArea<1e-8)continue;const R=ab*bc*ca/(2*crossArea);bends++;minRadius=Math.min(minRadius,R);if(R<r.radius)tight++;
 }}
 return {components:g.components,junctions:junctions.length,minAngle:Number.isFinite(minAngle)?minAngle:null,acute,minSpacing:Number.isFinite(minSpacing)?minSpacing:null,short,bends,minRadius:Number.isFinite(minRadius)?minRadius:null,tight,roundabouts:g.roundabouts};
}
/* Verify the physical side of the street; no access through another lot is inferred. */
function qaRoadProjection(pt,normal,g,tol=.50){
 let best=null;
 for(const e of g.edges){const d=e.w+tol;if(pt[0]<e.box[0]-d||pt[0]>e.box[2]+d||pt[1]<e.box[1]-d||pt[1]>e.box[3]+d)continue;const v=nearest(pt,e.a,e.b),delta=sub(v,pt),L=Math.hypot(...delta);
  if(L>e.w+tol||L<Math.max(.05,e.w-tol)||dot(delta,normal)<Math.max(.02,L*.45))continue;
  const err=Math.abs(L-e.w);if(!best||err<best.err)best={edge:e.id,t:clamp(dot(sub(v,e.a),sub(e.b,e.a))/(e.len*e.len),0,1),offset:L,err,pt};
 }return best;
}
function qaFronts(obj,g,step=2){
 const r=obj.pts,sign=Math.sign(area(r)),runs=[],samples=[];if(!sign)return {length:0,projections:[],front:null};
 let chain=[],prevDir=null;
 const flush=()=>{if(chain.length)runs.push(chain);chain=[];prevDir=null};
 for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],L=dist(a,b);if(L<.02)continue;const u=norm(sub(b,a)),normal=mul(perp(u),-sign),N=Math.min(200,Math.max(1,Math.ceil(L/step)));
  if(prevDir&&dot(prevDir,u)<.82)flush();
  for(let k=0;k<N;k++){const pt=lerp(a,b,(k+.5)/N),pr=qaRoadProjection(pt,normal,g);if(pr){const entry={...pr,len:L/N,u};chain.push(entry);samples.push(entry);prevDir=u}else flush()}
 }
 flush();
 if(runs.length>1){const first=runs[0],last=runs.at(-1),a=first[0],b=last.at(-1);if(dist(a.pt,b.pt)<step*1.6&&dot(a.u,b.u)>=.82){runs[0]=last.concat(first);runs.pop()}}
 const len=x=>x.reduce((n,v)=>n+v.len,0);runs.sort((a,b)=>len(b)-len(a));const best=runs[0]||[],total=len(best);let front=null,acc=0;
 for(const x of best){acc+=x.len;if(acc>=total/2){front=x;break}}
 return {length:total,projections:samples,front};
}
function qaHeap(){const a=[];return {push(v){let i=a.length;a.push(v);while(i){const p=(i-1)>>1;if(a[p][0]<=v[0])break;a[i]=a[p];i=p}a[i]=v},pop(){if(!a.length)return null;const x=a[0],v=a.pop();if(a.length){let i=0;while(2*i+1<a.length){let j=2*i+1;if(j+1<a.length&&a[j+1][0]<a[j][0])j++;if(a[j][0]>=v[0])break;a[i]=a[j];i=j}a[i]=v}return x},get size(){return a.length}}}
function qaNetworkDistances(g,sources){
 const d=g.nodes.map(()=>Infinity),by=new Map(),heap=qaHeap();
 const relax=(i,x)=>{if(x<d[i]){d[i]=x;heap.push([x,i])}};
 for(const pr of sources){const e=g.edges[pr.edge];if(!e)continue;if(!by.has(e.id))by.set(e.id,[]);by.get(e.id).push(pr);relax(e.A,pr.offset+e.len*pr.t);relax(e.B,pr.offset+e.len*(1-pr.t))}
 while(heap.size){const [x,i]=heap.pop();if(x>d[i]+1e-8)continue;for(const ei of g.nodes[i].adj){const e=g.edges[ei];relax(e.A===i?e.B:e.A,x+e.len)}}
 return pr=>{if(!pr)return Infinity;const e=g.edges[pr.edge];if(!e)return Infinity;let v=Math.min(d[e.A]+pr.t*e.len,d[e.B]+(1-pr.t)*e.len);for(const s of by.get(e.id)||[])v=Math.min(v,s.offset+Math.abs(s.t-pr.t)*e.len);return v+pr.offset};
}
/* Search a conservative rectangular footprint with the same clearance on every
   boundary. This is a test of usability, not a setback or building-code check. */
function qaFootprint(l,r,front){
 if(polyArea(l)+1e-6<(r.footW+2*r.setback)*(r.footD+2*r.setback))return false;
 const u=front?.u||norm(sub(l.pts[1],l.pts[0])),v=perp(u),origin=l.pts[0],uv=pt=>[dot(sub(pt,origin),u),dot(sub(pt,origin),v)],xy=pt=>add(origin,add(mul(u,pt[0]),mul(v,pt[1]))),b=bbox(l.pts.map(uv));
 for(const [W,D] of [[r.footW,r.footD],[r.footD,r.footW]]){const w=W+2*r.setback,d=D+2*r.setback;if(b[2]-b[0]+1e-7<w||b[3]-b[1]+1e-7<d)continue;
  for(let i=0;i<=4;i++)for(let j=0;j<=4;j++){const x=b[0]+(b[2]-b[0]-w)*i/4,y=b[1]+(b[3]-b[1]-d)*j/4,rect={pts:mpRect(x,y,w,d).map(xy)};if(mpConvexFits(rect,l))return true}
 }return false;
}
function qaEvaluate(c,s){
 const r=s.review;if(!r?.enabled)return null;
 const q=c.q,g=qaGraph(q),network=qaNetworkChecks(q,g,r),terrain=qaTerrainStats(q,r);
 const amenities=q.zones.filter(z=>['green','plaza','leisure'].includes(z.kind)),sources=amenities.flatMap(z=>qaFronts(z,g,8).projections),walk=qaNetworkDistances(g,sources);
 const rows=[];let failArea=0,failFront=0,failBuild=0,near=0,unreachable=0,distances=[],unlinked=0;
 for(const l of q.lots){const f=qaFronts(l,g,1.5),A=polyArea(l),D=walk(f.front),build=qaFootprint(l,r,f.front),areaOk=A>=s.min-.002,frontOk=f.length>=s.f-.10,owner=q.blocks.find(b=>b.id===l.blockId),linked=!!owner&&!l.blockConflict&&qLotFits(l,owner);
  if(!areaOk)failArea++;if(!frontOk)failFront++;if(!build)failBuild++;if(!linked)unlinked++;
  if(Number.isFinite(D)){distances.push(D);if(D<=r.park)near++}else unreachable++;
  rows.push({id:l.id,name:l.name,area:A,frontage:f.length,reportedFrontage:Number.isFinite(l.frontage)?l.frontage:null,areaOk,frontOk,build,linked,networkDistance:Number.isFinite(D)?D:null});
 }
 distances.sort((a,b)=>a-b);const count=rows.length,coverage=count?near/count*100:0,buildPct=count?(count-failBuild)/count*100:0,mean=distances.length?distances.reduce((a,b)=>a+b,0)/distances.length:null;
 const issues=failArea+failFront+failBuild+unlinked;
 const critical=issues+Math.max(0,network.components-1)+network.acute+network.short+network.tight+(terrain?.above>0?1:0);
 const checks={count,failArea,failFront,failBuild,unlinked,coverage,buildPct,unreachable,mean,p90:distances.length?distances[Math.ceil(distances.length*.9)-1]:null,network,terrain,issues,critical,thresholds:Object.fromEntries(Object.keys(QA_FIELDS).map(k=>[k,r[k]])),frontageMin:s.f,areaMin:s.min,rows};
 // Strict is intentionally only the chosen screening criteria, not legal approval.
 checks.pass=count>0&&issues===0&&network.components===1&&!network.roundabouts&&network.acute===0&&network.short===0&&network.tight===0&&(!terrain||terrain.coverage>=99.99&&terrain.above<=.01);
 return checks;
}
function qaDominates(a,b){
 const A=a.review,B=b.review;if(!A||!B)return false;
 const vec=c=>[c.yield,-c.roadPct,c.review.coverage,c.review.buildPct,-c.review.critical,-(c.review.terrain?.abovePct??0),-(c.audit?.residualPct||0)];
 const x=vec(a),y=vec(b);return x.every((v,i)=>v>=y[i]-1e-7)&&x.some((v,i)=>v>y[i]+1e-7)
}
function qaRank(sorted,s){
 if(!s.review?.enabled||s.objective!=='urban'||sorted.some(c=>!c.review))return sorted;
 // Non-dominated fronts within equal feasibility groups. Keep the legacy
 // preference as tie-breaker; this is Pareto sorting, not an evolutionary solver.
 const remaining=sorted.slice(),out=[];let layer=0;while(remaining.length){layer++;const front=remaining.filter(x=>!remaining.some(y=>x!==y&&qaDominates(y,x)));for(const x of front)x.review.paretoLayer=layer;out.push(...front);for(const x of front)remaining.splice(remaining.indexOf(x),1)}
 return out;
}
function qaFmt(x,d=1,suffix=''){return Number.isFinite(x)?fmt(x,d)+suffix:'não avaliado'}
function qaRow(label,value,note){return '<div class="qa-row"><span>'+esc(label)+'</span><b>'+esc(value)+'</b>'+(note?'<small>'+esc(note)+'</small>':'')+'</div>'}
function qaRender(c){
 qaLastReport=c?.review||null;$('qaExport').disabled=!qaLastReport;
 if(!qaLastReport){$('qaReport').innerHTML='<p class="hint">Gere alternativas ou revise o desenho atual para obter o diagnóstico.</p>';return}
 const a=qaLastReport,g=a.network,t=a.terrain,rows=[
 ['Frentes viárias abaixo do mínimo',String(a.failFront)+' / '+a.count,'Trechos de divisa verificados por amostragem; '+fmt(a.frontageMin,2)+' m'],
 ['Lotes abaixo da área mínima',String(a.failArea)+' / '+a.count,fmt(a.areaMin,2)+' m²'],
 ['Implantação-teste não encontrada',String(a.failBuild)+' / '+a.count,a.thresholds.footW+' × '+a.thresholds.footD+' m; folga '+a.thresholds.setback+' m em todo o perímetro'],
 ['Lotes sem quadra válida',String(a.unlinked),'Vínculo e contenção geométrica'],
 ['Interseções com ângulo crítico',String(g.acute),qaFmt(g.minAngle,1,'°')+' · mínimo de estudo '+a.thresholds.angle+'°'],
 ['Trechos curtos entre cruzamentos',String(g.short),qaFmt(g.minSpacing,1,' m')+' · referência '+a.thresholds.spacing+' m'],
 ['Pontos de curvatura abaixo da referência',String(g.tight),qaFmt(g.minRadius,1,' m')+' · raio local aproximado, não concordância'],
 ['Componentes do grafo de eixos',String(g.components),g.roundabouts?'Rotatórias não entram no grafo desta revisão.':'Não verifica conexão à cidade.'],
 ['Lotes próximos de praça/parque/lazer',qaFmt(a.coverage,1,'%'),'Até '+a.thresholds.park+' m pela rede de eixos; entradas e passeios presumidos'],
 ['Distância média / percentil 90',qaFmt(a.mean,0,' m')+' / '+qaFmt(a.p90,0,' m'),a.unreachable+' lote(s) sem percurso inferido'],
 ['Topografia',t?qaFmt(t.coverage,1,'%')+' da extensão coberta':'Não fornecida',t?'Declives no terreno natural; sem perfil de projeto.':'Importe uma grade de cotas no mesmo referencial local.'],
 ['Declive natural acima da referência',t?qaFmt(t.above,0,' m'):'Não avaliado',t?'Máximo amostrado '+qaFmt(t.max,1,'%')+'; limite de estudo '+a.thresholds.grade+'%.':'Sem terreno não há avaliação de declividade.']
 ];
 $('qaReport').innerHTML='<div class="qa-summary"><strong>Revisão técnica da implantação</strong><span>'+esc(a.pass?'Nenhum desvio nos critérios avaliados':'Há critérios que precisam de revisão')+'</span></div>'+rows.map(x=>qaRow(...x)).join('')+'<p class="qa-note">Triagem geométrica e de rede. Não equivale à aprovação urbanística: diretrizes municipais, APP, geotecnia, drenagem, cotas, acessos, visibilidade e veículo de projeto exigem validação. A implantação-teste não verifica recuos legais.</p>';
}
function qaCurrent(s){
 if(!p.boundary)return null;const c={q:p,area:polyArea(p.boundary),yield:p.lots.reduce((n,l)=>n+polyArea(l),0)/polyArea(p.boundary)*100,roadPct:0,audit:{}};c.review=qaEvaluate(c,s);return c;
}
function qaInstall(refresh){
 for(const f of Object.values(QA_FIELDS))$(f.id).oninput=refresh;
 for(const id of ['qaEnabled','qaStrict'])$(id).onchange=refresh;
 $('qaTerrainFile').onchange=async()=>{const file=$('qaTerrainFile').files?.[0];if(!file)return;try{const g=qaParseTerrain(await file.text());qaTerrain=g;qaTerrainName=file.name;refresh();$('qaTerrainInfo').textContent=g.points+' cotas carregadas. X/Y/Z em metros locais. Confirme o referencial antes de usar.'}catch(e){qaTerrain=null;qaTerrainName='';refresh();$('qaTerrainInfo').textContent=e.message}};
 $('qaTerrainClear').onclick=()=>{qaTerrain=null;qaTerrainName='';$('qaTerrainFile').value='';refresh();$('qaTerrainInfo').textContent='Sem modelo de terreno. Relevo não avaliado.'};
 $('qaTemplate').onclick=()=>download('grade_topografica_exemplo.csv','x;y;z\n0;0;900\n100;0;901\n0;100;902\n100;100;903\n','text/csv;charset=utf-8');
 $('qaCurrent').onclick=()=>{const s=optInputs(),issues=optDiagnostics(s);if(!s.review.enabled){optStatus('Habilite a revisão técnica.',true);return}if(issues.length){optStatus(issues[0].message,true);return}try{qaRender(qaCurrent(s))}catch(e){optStatus(String(e.message||e),true)}};
 $('qaExport').onclick=()=>{if(qaLastReport)download(filename()+'_revisao_tecnica.json',JSON.stringify(qaLastReport,null,2),'application/json')};
}
