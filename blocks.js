
'use strict';
const blockDefaults={autoQuadras:true,edgeQuadras:true,minQuadra:100,quadraLabels:true,quadraDims:true};
const BLOCK_ENGINE=4, QEPS=1e-6, QARC=.025;
let blockStatsCache=new WeakMap();
function normalizeBlocks(q){q.params={...blockDefaults,...q.params};for(const k of ['autoQuadras','edgeQuadras','quadraLabels','quadraDims'])if(typeof q.params[k]!=='boolean')q.params[k]=blockDefaults[k];if(!Number.isFinite(q.params.minQuadra))q.params.minQuadra=100;q.params.minQuadra=clamp(q.params.minQuadra,1,1000000);}
function blockGeometryKey(q){return JSON.stringify([q.boundary&&[q.boundary.pts,q.boundary.holes],q.roads.map(r=>[r.pts,r.width,r.smooth]),q.rounds.map(r=>[r.c,r.r]),q.zones.map(z=>[z.pts,z.holes]),q.blocks.filter(b=>!b.auto).map(b=>[b.pts,b.holes]),q.params.edgeQuadras,q.params.minQuadra,q.params.autoQuadras]);}
function qCircle(c,r,phase=0){const n=Math.min(256,Math.max(16,4*Math.ceil(Math.PI/Math.acos(r/(r+QARC))/4))),rr=r/Math.cos(Math.PI/n);return Array.from({length:n},(_,i)=>{const a=phase+(i+.5)*2*Math.PI/n;return add(c,[rr*Math.cos(a),rr*Math.sin(a)])});}
function qShape(pts,holes=[],kind='road'){return {pts,holes,kind,b:bbox(pts)}}
function qObstacles(q){
 const shapes=[];
 for(const r of q.roads){const pts=roadPts(r),w=r.width/2;if(!Number.isFinite(w)||w<=0)continue;const seen=new Set();for(let i=0;i<pts.length;i++){const pt=pts[i],other=pts[i+1]||pts[i-1],phase=other?Math.atan2(other[1]-pt[1],other[0]-pt[0]):0;let k=pt.join(',');if(!seen.has(k)){seen.add(k);shapes.push(qShape(qCircle(pt,w,phase),[],'road'))}}
  for(let i=1;i<pts.length;i++){let a=pts[i-1],b=pts[i];if(dist(a,b)<QEPS)continue;const n=mul(perp(norm(sub(b,a))),w);shapes.push(qShape([add(a,n),add(b,n),sub(b,n),sub(a,n)],[],'road'))}}
 for(const r of q.rounds)shapes.push(qShape(qCircle(r.c,r.r),[],'road'));
 for(const z of q.zones)shapes.push(qShape(z.pts,z.holes||[],'restriction'));
 for(const m of q.blocks.filter(b=>!b.auto))shapes.push(qShape(m.pts,m.holes||[],'manual'));
 return shapes;
}
function qNearPoint(v,s){return v[0]>=s.b[0]-QEPS&&v[0]<=s.b[2]+QEPS&&v[1]>=s.b[1]-QEPS&&v[1]<=s.b[3]+QEPS;}
function qSegment(a,b,kind){return {a,b,kind,bx:bbox([a,b]),t:[0,1]}}
function qSplit(a,b){
 const u=sub(a.b,a.a),v=sub(b.b,b.a),w=sub(b.a,a.a),l=Math.hypot(...u),m=Math.hypot(...v),det=cross(u,v);
 if(l<QEPS||m<QEPS)return;
 function push(s,t){if(t>=-1e-8&&t<=1+1e-8)s.t.push(clamp(t,0,1))}
 if(Math.abs(det)>1e-10*l*m){const t=cross(w,v)/det,s=cross(w,u)/det;if(t>=-1e-8&&t<=1+1e-8&&s>=-1e-8&&s<=1+1e-8){push(a,t);push(b,s)}}
 else if(Math.abs(cross(w,u))/l<QEPS){for(const pt of [b.a,b.b])push(a,dot(sub(pt,a.a),u)/dot(u,u));for(const pt of [a.a,a.b])push(b,dot(sub(pt,b.a),v)/dot(v,v));}
}
const qKey=v=>Math.round(v[0]/QEPS)+','+Math.round(v[1]/QEPS);
function qClean(ring){let out=[];for(const v of ring)if(!out.length||dist(v,out.at(-1))>QEPS*2)out.push(v);if(out.length>2&&dist(out[0],out.at(-1))<=QEPS*2)out.pop();let changed=true;while(changed&&out.length>3){changed=false;let a=out.filter((v,i)=>{let x=sub(v,out[(i+out.length-1)%out.length]),y=sub(out[(i+1)%out.length],v);return !(dot(x,y)>0&&Math.abs(cross(x,y))<=QEPS*(Math.hypot(...x)+Math.hypot(...y)))});if(a.length>=3&&a.length<out.length){out=a;changed=true}}return out;}
function qInteriorPoint(o){
 const b=bbox(o.pts),c=centroid(o.pts),candidates=[c,[(b[0]+b[2])/2,(b[1]+b[3])/2]],rings=[o.pts,...(o.holes||[])];
 for(let i=1;i<10;i++){const y=b[1]+(b[3]-b[1])*i/10;for(const [a,z] of parcelIntervalsAt(rings,y))candidates.push([(a+z)/2,y])}
 let best=null,score=-1;for(const v of candidates){if(!insideObj(v,o))continue;let d=Infinity;for(const a of rings)for(let i=0;i<a.length;i++)d=Math.min(d,dist(v,nearest(v,a[i],a[(i+1)%a.length])));if(d>score){best=v;score=d}}
 return {v:best||o.pts[0],clearance:Math.max(0,score)};
}
function vectorBlocks(q){
 if(!q.roads.length&&!q.rounds.length)return [];
 const obstacles=qObstacles(q),roads=obstacles.filter(o=>o.kind==='road');if(!roads.length)return [];
 let domain,hasBoundary=!!q.boundary;
 if(hasBoundary)domain=qShape(q.boundary.pts,q.boundary.holes||[],'domain');
 else {let bb=bbox(roads.flatMap(o=>o.pts)),pad=Math.max(50,(bb[2]-bb[0]+bb[3]-bb[1])*.01),x=bb[0]-pad,y=bb[1]-pad,X=bb[2]+pad,Y=bb[3]+pad;domain=qShape([[x,y],[X,y],[X,Y],[x,Y]],[],'domain')}
 const shapes=[domain,...obstacles.filter(o=>o.b[2]>=domain.b[0]&&o.b[0]<=domain.b[2]&&o.b[3]>=domain.b[1]&&o.b[1]<=domain.b[3])];
 const blockers=shapes.slice(1);
 const free=v=>qNearPoint(v,domain)&&insideObj(v,domain)&&!blockers.some(s=>qNearPoint(v,s)&&insideObj(v,s));
 const segs=[];for(const s of shapes)for(const ring of [s.pts,...s.holes])for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if(dist(a,b)>QEPS)segs.push(qSegment(a,b,s.kind))}
 if(segs.length>12000)throw Error('Geometria muito extensa para atualização automática. Divida o estudo em setores.');
 segs.sort((a,b)=>a.bx[0]-b.bx[0]);let pairs=0;
 for(let i=0;i<segs.length;i++){const a=segs[i];for(let k=i+1;k<segs.length;k++){const b=segs[k];if(b.bx[0]>a.bx[2]+QEPS)break;if(b.bx[1]>a.bx[3]+QEPS||b.bx[3]<a.bx[1]-QEPS)continue;if(++pairs>3000000)throw Error('Muitas interseções no sistema viário. Simplifique a geometria.');qSplit(a,b)}}
 const nodes=new Map(),edges=new Map();function node(v){let key=qKey(v);if(!nodes.has(key))nodes.set(key,{key,v,out:[]});return nodes.get(key)}
 let parts=0;
 for(const s of segs){const ts=s.t.sort((a,b)=>a-b),delta=sub(s.b,s.a),l=Math.hypot(...delta),n=perp(mul(delta,1/l));for(let i=1;i<ts.length;i++){let t0=ts[i-1],t1=ts[i],len=(t1-t0)*l;if(len<4*QEPS)continue;if(++parts>160000)throw Error('Limite de segmentos de quadras atingido.');let a=lerp(s.a,s.b,t0),b=lerp(s.a,s.b,t1),m=lerp(a,b,.5),off=Math.min(len*.08,Math.max(4*QEPS,Math.min(.0001,len*.002))),left=free(add(m,mul(n,off))),right=free(sub(m,mul(n,off)));if(left===right)continue;if(!left)[a,b]=[b,a];const A=node(a),B=node(b);if(A===B)continue;let key=A.key+'|'+B.key,e=edges.get(key);if(!e){e={a:A,b:B,road:false,domain:false,used:false};edges.set(key,e);A.out.push(e)}if(s.kind==='road')e.road=true;if(s.kind==='domain')e.domain=true;}}
 const rings=[];
 for(const first of edges.values()){
  if(first.used)continue;let e=first,pts=[],road=false,border=false,closed=false,guard=0;
  while(e&&!e.used&&guard++<=edges.size){e.used=true;pts.push(e.a.v);road||=e.road;border||=e.domain;if(e.b===first.a){closed=true;break}
   const back=Math.atan2(e.a.v[1]-e.b.v[1],e.a.v[0]-e.b.v[0]);let next=null,best=Infinity;
   for(const f of e.b.out){if(f.used)continue;const ang=Math.atan2(f.b.v[1]-f.a.v[1],f.b.v[0]-f.a.v[0]),turn=(back-ang+Math.PI*2)%(Math.PI*2);if(turn<best){best=turn;next=f}}e=next;
  }
  if(!closed){if(pts.length>2)throw Error('Contorno viário não pôde ser fechado; confira segmentos degenerados.');continue}
  pts=qClean(pts);const A=pts.length>=3?area(pts):0;if(Math.abs(A)>1e-5)rings.push({pts,A,road,border});
 }
 const outers=rings.filter(r=>r.A>0).sort((a,b)=>a.A-b.A),holes=rings.filter(r=>r.A<0);
 for(const o of outers)o.holes=[];
 for(const hole of holes){const test=hole.pts[0],o=outers.find(o=>inside(test,o.pts));if(o)o.holes.push(hole.pts)}
 const out=[];
 for(const o of outers){if(!o.road||o.border&&(!hasBoundary||!q.params.edgeQuadras))continue;const block={pts:o.pts,holes:o.holes,auto:true,vector:BLOCK_ENGINE,edgeBlock:o.border};if(polyArea(block)+1e-6<q.params.minQuadra)continue;if(!simple(block.pts)||block.holes.some(h=>!simple(h)))throw Error('Face complexa ou autointersectante. As quadras anteriores foram preservadas.');out.push(block)}
 return out.sort((a,b)=>{const x=bbox(a.pts),y=bbox(b.pts);return x[1]-y[1]||x[0]-y[0]});
}
function qRingSig(ring){let a=ring.map(qKey),i=a.reduce((best,x,k)=>x<a[best]?k:best,0);return a.slice(i).concat(a.slice(0,i)).join(';')}
function qBlockSig(b){return qRingSig(b.pts)+'|'+(b.holes||[]).map(qRingSig).sort().join('|')}
function qHull(pts){const a=[...new Map(pts.map(v=>[qKey(v),v])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(a.length<3)return a;const half=arr=>{let h=[];for(const v of arr){while(h.length>1&&cross(sub(h.at(-1),h.at(-2)),sub(v,h.at(-1)))<=1e-8)h.pop();h.push(v)}return h};return half(a).slice(0,-1).concat(half(a.slice().reverse()).slice(0,-1))}
function blockStats(o){
 const cache=blockStatsCache.get(o);if(cache&&cache.pts===o.pts&&cache.holes===o.holes)return cache.s;
 const hull=qHull(o.pts),ref=hull[0]||[0,0];let rect=null;
 for(let i=0;i<hull.length;i++){const u=norm(sub(hull[(i+1)%hull.length],hull[i]));if(!Math.hypot(...u))continue;const v=perp(u),b=bbox(hull.map(pt=>{const d=sub(pt,ref);return [dot(d,u),dot(d,v)]})),w=b[2]-b[0],d=b[3]-b[1],A=w*d;if(!rect||A<rect.A-1e-7)rect={A,w,d,angle:bearing([0,0],u),u,v,b,ref}}
 rect=rect||{w:0,d:0,angle:0};const edges=o.pts.map((a,i)=>({i,a,b:o.pts[(i+1)%o.pts.length],len:dist(a,o.pts[(i+1)%o.pts.length])})),outer=edges.reduce((s,e)=>s+e.len,0),inner=(o.holes||[]).reduce((s,h)=>s+length([...h,h[0]]),0),anchor=qInteriorPoint(o);
 const s={area:polyArea(o),outer,inner,perimeter:outer+inner,width:Math.max(rect.w,rect.d),depth:Math.min(rect.w,rect.d),angle:(rect.angle+(rect.d>rect.w?90:0))%180,edges,anchor};
 blockStatsCache.set(o,{pts:o.pts,holes:o.holes,s});return s;
}
function qOverlapScore(a,b){const aa=bbox(a.pts),bb=bbox(b.pts),dx=Math.min(aa[2],bb[2])-Math.max(aa[0],bb[0]),dy=Math.min(aa[3],bb[3])-Math.max(aa[1],bb[1]);if(dx<=0||dy<=0)return 0;
 let hit=0,total=0;const x=Math.min(aa[0],bb[0]),y=Math.min(aa[1],bb[1]),X=Math.max(aa[2],bb[2]),Y=Math.max(aa[3],bb[3]);for(let i=0;i<13;i++)for(let j=0;j<13;j++){const v=[x+(X-x)*(i+.5)/13,y+(Y-y)*(j+.5)/13],aIn=insideObj(v,a),bIn=insideObj(v,b);if(aIn||bIn)total++;if(aIn&&bIn)hit++}return total?hit/total:0;}
function qKeepFront(old,b){if(!Number.isInteger(old.front)||!old.pts[old.front])return;const a=old.pts[old.front],z=old.pts[(old.front+1)%old.pts.length],u=norm(sub(z,a)),mid=lerp(a,z,.5);let best=null;for(let i=0;i<b.pts.length;i++){const x=b.pts[i],y=b.pts[(i+1)%b.pts.length];if(Math.abs(dot(u,norm(sub(y,x))))<.98)continue;const d=dist(mid,nearest(mid,x,y));if(!best||d<best.d)best={i,d}}if(best&&best.d<20)b.front=best.i;}
function qLotFits(l,b){const bb=bbox(b.pts),lb=bbox(l.pts);if(lb[0]<bb[0]-1e-5||lb[1]<bb[1]-1e-5||lb[2]>bb[2]+1e-5||lb[3]>bb[3]+1e-5)return false;const lr=l.pts,br=[b.pts,...(b.holes||[])];for(let i=0;i<lr.length;i++){let a=lr[i],z=lr[(i+1)%lr.length];if(![a,lerp(a,z,.25),lerp(a,z,.5),lerp(a,z,.75)].every(v=>pointInOrEdge(v,b)))return false;for(const r of br)for(let k=0;k<r.length;k++)if(segCross(a,z,r[k],r[(k+1)%r.length]))return false}for(const h of b.holes||[])if(h.some(v=>insideObj(v,l))||insideObj(qInteriorPoint({pts:h}).v,l))return false;return true}
function syncBlocks(q=p){
 normalizeBlocks(q);try{
  const generated=vectorBlocks(q),old=q.blocks.filter(b=>b.auto),manual=q.blocks.filter(b=>!b.auto),used=new Set(),oldIds=new Set(old.map(b=>b.id)),oldNames=new Set(q.blocks.map(b=>b.name)),matches=new Map(),exact=new Map(old.map(b=>[qBlockSig(b),b]));
  let next=Math.max(0,...q.blocks.map(b=>/^Q(\d+)$/i.exec(b.name||'')?.[1]||0));
  for(const b of generated){const o=exact.get(qBlockSig(b));if(o&&!used.has(o.id)){used.add(o.id);matches.set(b,o)}}
  const pairs=[];for(const b of generated){if(matches.has(b))continue;for(const o of old){if(used.has(o.id))continue;let score=qOverlapScore(b,o);if(score>=.20)pairs.push({b,o,score})}}
  pairs.sort((a,b)=>b.score-a.score);for(const {b,o} of pairs){if(matches.has(b)||used.has(o.id))continue;matches.set(b,o);used.add(o.id)}
  for(const b of generated){const o=matches.get(b);if(o){b.id=o.id;b.name=o.name;qKeepFront(o,b)}else{b.id=uid();do{b.name='Q'+String(++next).padStart(2,'0')}while(oldNames.has(b.name));oldNames.add(b.name)}}
  const all=[...manual,...generated];const changedLots=[];
  for(const l of q.lots){if(!oldIds.has(l.blockId)&&!l.blockConflict)continue;const match=all.find(b=>b.id===l.blockId&&qLotFits(l,b))||all.find(b=>qLotFits(l,b));if(match){changedLots.push({l,id:match.id,conflict:false})}else{changedLots.push({l,id:l.blockId,conflict:true})}}
  q.blocks=all;
  for(const {l,id,conflict} of changedLots){if(conflict){l.previousBlockId=l.blockId||l.previousBlockId;delete l.blockId;l.blockConflict=true}else{l.blockId=id;delete l.previousBlockId;delete l.blockConflict}}
  q.blockEngine=BLOCK_ENGINE;q.derivedDirty=false;delete q.blockError;
  if(q===p&&selection&&!find(selection))selection=null;
  return true;
 }catch(e){q.derivedDirty=true;q.blockError=String(e.message||e).slice(0,250);return false}
}
function onBlockCommit(before){normalizeBlocks(p);let prior;try{prior=JSON.parse(before);normalizeBlocks(prior)}catch{prior=null}
 let changed=!prior||blockGeometryKey(prior)!==blockGeometryKey(p);
 if(p.params.autoQuadras&&(changed||p.blockEngine!==BLOCK_ENGINE))syncBlocks();
 else if(changed&&!p.params.autoQuadras)p.derivedDirty=true;
}
function generateBlocksNow(){let before=snapshot();let ok=syncBlocks();if(before!==snapshot())commit(before);else renderAll();toast(ok?p.blocks.filter(b=>b.auto).length+' quadra(s) automáticas atualizadas.':p.blockError);}
function blockLabels(o){if(!p.params.quadraLabels)return '';const s=blockStats(o),z=view.z,c=s.anchor.v,px=s.anchor.clearance*z;if(px<7)return '';const detailed=p.params.quadraDims&&px>=30;
 const name=(o.name||'Quadra'),f=detailed?12:11;
 let h='<text class="quadra-name" x="'+c[0]+'" y="'+(c[1]-(detailed?14/z:0))+'" font-size="'+f/z+'" stroke-width="'+3/z+'">'+esc(name)+'</text>';
 if(detailed){h+='<text class="quadra-sub" x="'+c[0]+'" y="'+c[1]+'" font-size="'+10/z+'" stroke-width="'+2.5/z+'">'+fmt(s.area,1)+' m²</text><text class="quadra-sub" x="'+c[0]+'" y="'+(c[1]+13/z)+'" font-size="'+9.5/z+'" stroke-width="'+2.5/z+'">'+fmt(s.width,1)+' × '+fmt(s.depth,1)+' m</text>'}return h;}
function blockSideOverlay(){const sel=selected();if(!p.params.quadraDims||!visibility.block||mode!=='select'||sel?.[0]!=='block')return '';const o=sel[1],s=blockStats(o);let h='';for(const e of s.edges){if(e.len*view.z<44)continue;let u=norm(sub(e.b,e.a)),n=mul(perp(u),area(o.pts)>0?1:-1),off=mul(n,10/view.z);h+=dimensionMark(add(e.a,off),add(e.b,off),'#146984')}return h}
function blockInspector(o){const s=blockStats(o);let h='<div class="quadra-data"><div class="qline"><span>Área útil</span><b>'+fmt(s.area,2)+' m²</b></div><div class="qline"><span>Dimensões envolventes</span><b>'+fmt(s.width,2)+' × '+fmt(s.depth,2)+' m</b></div><div class="qline"><span>Perímetro externo</span><b>'+fmt(s.outer,2)+' m</b></div>'+(s.inner>.001?'<div class="qline"><span>Divisas internas</span><b>'+fmt(s.inner,2)+' m</b></div>':'')+'<div class="qline"><span>Orientação principal</span><b>'+fmt(s.angle,1)+'°</b></div><div class="qline"><span>Lotes vinculados</span><b>'+p.lots.filter(l=>l.blockId===o.id).length+'</b></div><details><summary>Comprimentos das '+s.edges.length+' divisas externas</summary><div class="qedges">'+s.edges.map(e=>'<div class="qedge"><span>Divisa '+(e.i+1)+'</span><b>'+fmt(e.len,2)+' m · '+fmt(bearing(e.a,e.b),1)+'°</b></div>').join('')+'</div></details></div>';
 if(o.auto)h+='<p class="quadra-lock">Quadra vinculada às vias'+(o.edgeBlock?' e ao limite da gleba':'')+'. Edite as vias para alterar a geometria. As dimensões envolventes não são necessariamente as dimensões de cada divisa.</p>';return h;}
function renderBlockControls(){const a=p.params;for(const k of ['autoQuadras','edgeQuadras','quadraLabels','quadraDims'])$(k).checked=a[k];$('minQuadra').value=a.minQuadra;}
function renderBlockTable(){const a=p.blocks,conflicts=p.lots.filter(l=>l.blockConflict).length;
 $('quadraSummary').innerHTML='<b>'+fmt(a.length)+' quadra(s) · '+fmt(a.reduce((n,b)=>n+polyArea(b),0),2)+' m²</b><br>'+a.filter(b=>b.auto).length+' automáticas · '+a.filter(b=>!b.auto).length+' manuais';
 $('quadraList').innerHTML=a.map(o=>{const s=blockStats(o);return '<button class="quadra-row '+(selection===o.id?'on':'')+'" data-quadra="'+esc(o.id)+'"><span>'+esc(o.name)+(o.auto?(o.edgeBlock?' · borda':' · auto'):' · manual')+'<small>'+fmt(s.width,1)+' × '+fmt(s.depth,1)+' m</small></span><strong>'+fmt(s.area,1)+' m²</strong></button>'}).join('')||'<p class="hint">Feche um circuito de vias ou desenhe ruas até os limites da gleba.</p>';
 $('quadraCSV').disabled=!a.length;const notice=$('quadraNotice');notice.classList.toggle('hidden',!conflicts&&!p.blockError);notice.textContent=[p.blockError,conflicts?conflicts+' lote(s) preservado(s), porém fora das quadras atualizadas. Revise os contornos em vermelho.':''].filter(Boolean).join(' ');
 $('dirtyNotice').classList.toggle('hidden',!p.derivedDirty);
}
function exportBlocksCSV(){const head=['Quadra','Tipo','Área (m²)','Comprimento envolvente (m)','Largura envolvente (m)','Perímetro externo (m)','Divisas internas (m)','Ângulo principal (°)','Lotes vinculados','Divisas externas (m)'];const csv=v=>'"'+String(v).replace(/"/g,'""')+'"',num=v=>Number(v).toFixed(2).replace('.',','),rows=p.blocks.map(o=>{let s=blockStats(o);return [o.name,o.auto?'Automática':'Manual',num(s.area),num(s.width),num(s.depth),num(s.outer),num(s.inner),num(s.angle),p.lots.filter(l=>l.blockId===o.id).length,s.edges.map(e=>num(e.len)).join(' | ')]});download(filename()+'_quadras.csv','\uFEFF'+[head,...rows].map(row=>row.map(csv).join(';')).join('\r\n'),'text/csv;charset=utf-8');}
function installBlocks(){
 $('autoBlocks').onclick=generateBlocksNow;$('autoLots').onclick=openParcel;
 for(const id of ['autoQuadras','edgeQuadras','quadraLabels','quadraDims'])$(id).onchange=e=>{let before=snapshot();p.params[id]=e.target.checked;commit(before)};
 $('minQuadra').onchange=e=>{let before=snapshot();p.params.minQuadra=clamp(n(e.target.value,100),1,1000000);commit(before)};
 $('quadraList').onclick=e=>{const id=e.target.closest('[data-quadra]')?.dataset.quadra,o=p.blocks.find(b=>b.id===id);if(!o)return;setMode('select');setSelection(id);const b=bbox(o.pts);view.cx=(b[0]+b[2])/2;view.cy=(b[1]+b[3])/2;view.z=clamp(Math.min((W-100)/Math.max(1,b[2]-b[0]),(H-140)/Math.max(1,b[3]-b[1])),.025,70);renderView();};
 $('quadraCSV').onclick=exportBlocksCSV;
}
