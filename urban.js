
'use strict';
/* Public-space reservation. Design targets, not legal quotas. Existing zones are never assumed to be public unless their category is explicit. */
const URBAN_DEFAULTS={publicProgram:true,greenPct:10,plazaPct:3,institutionalPct:5,leisurePct:2,hierarchy:true};
const URBAN_CATEGORIES=[
 {kind:'plaza',key:'plazaPct',id:'optPlaza',name:'Praças',prefix:'Praça',color:'#afcf9c'},
 {kind:'institutional',key:'institutionalPct',id:'optInstitutional',name:'Institucional',prefix:'Área institucional',color:'#b8b9d7'},
 {kind:'leisure',key:'leisurePct',id:'optLeisure',name:'Lazer',prefix:'Área de lazer',color:'#d4ad79'},
 {kind:'green',key:'greenPct',id:'optGreen',name:'Áreas verdes',prefix:'Parque / área verde',color:'#87ad80'}
];
function urbanInputs(s){s.publicProgram=$('optPublic').checked;s.hierarchy=$('optHierarchy').checked;for(const c of URBAN_CATEGORIES)s[c.key]=optNumber($(c.id).value);return s}
function urbanDiagnostics(s){if(!s.publicProgram)return [];const a=[];for(const c of URBAN_CATEGORIES){const v=s[c.key];if(!Number.isFinite(v)||v<0||v>60)a.push({keys:[c.key],message:c.name+': informe um percentual entre 0 e 60.'})}if(a.length)return a;const sum=URBAN_CATEGORIES.reduce((n,c)=>n+s[c.key],0);if(sum>=90)a.push({keys:URBAN_CATEGORIES.map(c=>c.key),message:'O programa reserva '+fmt(sum,1)+'% da gleba. Deixe espaço suficiente para vias e lotes.'});if(Number.isFinite(s.roadShare)&&s.roadShare+sum>=100)a.push({keys:URBAN_CATEGORIES.map(c=>c.key),message:'A soma das reservas mínimas e do teto viário deve ficar abaixo de 100%. Reduza o teto viário ou ajuste o programa.'});return a}
function urbanRefreshForm(s,keys){const info=$('optProgramInfo'),sum=URBAN_CATEGORIES.reduce((n,c)=>n+(Number.isFinite(s[c.key])?s[c.key]:0),0),A=p.boundary?polyArea(p.boundary):0;for(const c of URBAN_CATEGORIES){$(c.id).disabled=!s.publicProgram;$(c.id).setAttribute('aria-invalid',keys.has(c.key)?'true':'false')}info.innerHTML=s.publicProgram?'<b>Reserva total mínima: '+fmt(sum,1)+'%</b><small>'+fmt(A*sum/100,0)+' m² da gleba. Áreas reservadas antes de lotear.</small>':'<small>Programa automático desativado; áreas existentes são mantidas.</small>'}
function urbanInitForm(){const a={...URBAN_DEFAULTS,...(p.urbanProgram||{})};$('optPublic').checked=a.publicProgram!==false;$('optHierarchy').checked=a.hierarchy!==false;for(const c of URBAN_CATEGORIES)$(c.id).value=String(a[c.key]??URBAN_DEFAULTS[c.key])}
const urbanPublicKinds=new Set(URBAN_CATEGORIES.map(c=>c.kind));
function urbanBboxOverlap(a,b){return a[0]<b[2]-1e-6&&a[2]>b[0]+1e-6&&a[1]<b[3]-1e-6&&a[3]>b[1]+1e-6}
function urbanConvex(r){const sign=Math.sign(area(r));return r.length>=3&&sign!==0&&r.every((v,i)=>cross(sub(r[(i+1)%r.length],v),sub(r[(i+2)%r.length],r[(i+1)%r.length]))*sign>=-1e-6)}
function urbanRoadFront(o,prep){
 const a=o.pts,sign=area(a)>0?1:-1;let best=null;
 for(let i=0;i<a.length;i++){const x=a[i],y=a[(i+1)%a.length],len=dist(x,y);if(len<8)continue;const u=norm(sub(y,x)),inward=mul(perp(u),sign),out=mul(inward,-1);
  const near=[.15,.35,.5,.65,.85].filter(t=>{const pt=lerp(x,y,t);return roadEdgeDistance(pt,prep)<=.25&&[.05,.2,.7].some(d=>onRoad(add(pt,mul(out,d)),prep))}).length;
  if(near>=3&&(!best||len*near>best.len*best.near))best={a:x,b:y,u,v:inward,len,near};
 }
 return best;
}
function urbanExistingAreas(q,prep,exactCore=false){
 const a=Object.fromEntries(URBAN_CATEGORIES.map(c=>[c.kind,0])),core=q.zones.filter(z=>exactCore&&urbanPublicKinds.has(z.kind)&&z.masterCore),zones=q.zones.filter(z=>urbanPublicKinds.has(z.kind)&&!(exactCore&&z.masterCore)),B=q.boundary,A=polyArea(B);
 if(!zones.length){for(const z of core)a[z.kind]+=polyArea(z);return a;}
 // Exact area for nonoverlapping polygons wholly inside the site and outside the road footprint is credited conservatively by a grid.
 // The grid also prevents overlapping manually entered reserves and road space from being credited twice.
 const b=bbox(B.pts),dx=b[2]-b[0],dy=b[3]-b[1],step=Math.max(.25,Math.sqrt(dx*dy/18000),dx/220,dy/220),z=zones.map(o=>({...o,b:bbox(o.pts)}));let total=0;
 for(let y=b[1]+step/2;y<b[3];y+=step)for(let x=b[0]+step/2;x<b[2];x+=step){let pt=[x,y];if(!insideObj(pt,B))continue;total++;if(onRoad(pt,prep))continue;let o=z.find(o=>inBox(pt,o.b)&&insideObj(pt,o));if(o)a[o.kind]++}
 for(const k in a)a[k]=total?a[k]*A/total:0;for(const z of core)a[z.kind]+=polyArea(z);return a;
}
function urbanSlice(o,target,s,prep,kind){
 const A=polyArea(o),stat=blockStats(o),front=urbanRoadFront(o,prep);
 if(!front||A<Math.min(120,Math.max(25,target*.35))||stat.depth<Math.min(8,s.f*.65))return null;
 const minWidth=Math.max(8,Math.min(18,s.f)),minResidual=Math.max(s.min*2,s.f*s.d*2),full={zone:{pts:o.pts,holes:o.holes||[]},rest:null,area:A,front:front.len};
 if(A<=target+Math.max(80,target*.12)||A-target<minResidual||o.holes?.length||!urbanConvex(o.pts))return full;
 // Split along a street-facing edge. Both pieces remain convex and share an exact common boundary.
 const origin=front.a,u=front.u,v=front.v,uv=pt=>[dot(sub(pt,origin),u),dot(sub(pt,origin),v)],xy=pt=>add(origin,add(mul(u,pt[0]),mul(v,pt[1]))),ring=o.pts.map(uv),bounds=bbox(ring);
 if(bounds[2]-bounds[0]<2*minWidth)return full;
 let best=null;
 for(const side of [1,-1]){
  let lo=bounds[0],hi=bounds[2];
  for(let i=0;i<28;i++){const mid=(lo+hi)/2,part=parcelClip(ring,0,mid,side<0),a=Math.abs(area(part));if(side>0?a<target:a>target)lo=mid;else hi=mid}
  let cut=side>0?hi:lo;cut=clamp(cut,bounds[0]+minWidth,bounds[2]-minWidth);
  const first=qClean(parcelClip(ring,0,cut,side<0).map(xy)),rest=qClean(parcelClip(ring,0,cut,side>0).map(xy));
  if(first.length<3||rest.length<3||!simple(first)||!simple(rest))continue;
  const zone={pts:first,holes:[]},remain={...o,pts:rest,holes:[]},a=polyArea(zone),R=polyArea(remain);
  if(a<Math.min(target*.85,Math.max(120,s.min*.5))||R<minResidual||Math.abs(a+R-A)>.01||blockStats(remain).depth<Math.min(8,s.f*.7))continue;
  const f=urbanRoadFront(zone,prep),rf=urbanRoadFront(remain,prep);if(!f||!rf)continue;
  const score=Math.abs(a-target)+(a<target?.1*target:0);
  if(!best||score<best.score)best={zone,rest:remain,area:a,front:f.len,score};
 }
 return best||full;
}
function urbanDistance(pt,o){if(insideObj(pt,o))return 0;let d=Infinity;for(const ring of [o.pts,...(o.holes||[])])for(let i=0;i<ring.length;i++)d=Math.min(d,dist(pt,nearest(pt,ring[i],ring[(i+1)%ring.length])));return d}
function urbanReserve(q,s){
 const A=polyArea(q.boundary),prep=prepared(),existing=urbanExistingAreas(q,prep,s.mode==='new'&&q.masterplan?.engine===2),areas={...existing},targets=Object.fromEntries(URBAN_CATEGORIES.map(c=>[c.kind,s.publicProgram?A*(s[c.key]||0)/100:0])),newZones=[];
 if(!s.publicProgram)return {areas,targets,existing,newZones,shortfall:0,ok:true,excess:0};
 const keepBoxes=q.lots.map(l=>bbox(l.pts)),pool=q.blocks.filter(o=>o.auto&&(q.masterplan?.style==='active'?!o.edgeBlock&&!q.lots.some(l=>mpIntersectionArea(o,l.pts)>.01):!keepBoxes.some(b=>urbanBboxOverlap(b,bbox(o.pts))))).map(o=>({...o})),site=blockStats(q.boundary).anchor.v,bb=bbox(q.boundary.pts),scale=Math.max(1,Math.hypot(bb[2]-bb[0],bb[3]-bb[1])),tol=Math.max(.05,A*.000001);
 const focal=()=>[...q.zones,...newZones].filter(z=>z.kind==='plaza'||z.kind==='green'||z.kind==='leisure');
 for(const c of URBAN_CATEGORIES){
  let rounds=0;const need0=Math.max(0,targets[c.kind]-areas[c.kind]),desiredCount=c.kind==='green'&&need0>4500?Math.min(4,Math.max(2,Math.ceil(need0/6500))):c.kind==='plaza'&&need0>10000?2:1;
  while(targets[c.kind]-areas[c.kind]>tol&&rounds++<18&&newZones.length<40){
   const remain=targets[c.kind]-areas[c.kind],count=Math.max(1,desiredCount-rounds+1),goal=remain/count,near=focal(),same=[...q.zones,...newZones].filter(z=>z.kind===c.kind),plazas=[...q.zones,...newZones].filter(z=>z.kind==='plaza'),choices=[];
   for(let i=0;i<pool.length;i++){
    const o=pool[i],piece=urbanSlice(o,goal,s,prep,c.kind);if(!piece)continue;
    const stat=blockStats(piece.zone),pt=stat.anchor.v,central=dist(pt,site)/scale,spread=same.length?Math.min(...same.map(z=>urbanDistance(pt,z)))/scale:.3,
     nearGreen=near.length?Math.min(...near.map(z=>urbanDistance(pt,z)))/scale:central,nearPlaza=plazas.length?Math.min(...plazas.map(z=>urbanDistance(pt,z)))/scale:central;
    const mismatch=Math.abs(piece.area-goal)/Math.max(goal,1),sliver=stat.depth<Math.max(9,s.f)?1:0,compact=stat.area/Math.max(stat.width*stat.depth,1);
    let score=1.2*mismatch+.65*sliver+.22*(1-compact);
    if(c.kind==='plaza')score+=1.1*central-.5*spread;
    if(c.kind==='green')score+=.2*central-1.7*spread;
    if(c.kind==='leisure')score+=.75*nearPlaza+.25*nearGreen;
    if(c.kind==='institutional')score+=.25*central-.15*Math.min(1,piece.front/50);
    choices.push({i,piece,score});
   }
   if(!choices.length)break;choices.sort((a,b)=>a.score-b.score);const {i,piece}=choices[0],seq=q.zones.filter(z=>z.kind===c.kind).length+newZones.filter(z=>z.kind===c.kind).length+1;
   const z={...piece.zone,id:uid(),name:c.prefix+' '+String(seq).padStart(2,'0'),kind:c.kind,urbanGenerated:true};newZones.push(z);areas[c.kind]+=piece.area;
   pool.splice(i,1,...(piece.rest?[piece.rest]:[]));
  }
 }
 const shortfall=URBAN_CATEGORIES.reduce((n,c)=>n+Math.max(0,targets[c.kind]-areas[c.kind]),0),excess=URBAN_CATEGORIES.reduce((n,c)=>n+Math.max(0,areas[c.kind]-targets[c.kind]),0),ok=URBAN_CATEGORIES.every(c=>areas[c.kind]+tol>=targets[c.kind]);
 q.zones.push(...newZones);return {areas,targets,existing,newZones,shortfall,ok,excess};
}
function urbanAccessibility(q,lots){
 const zones=q.zones.filter(z=>['green','plaza','leisure'].includes(z.kind));if(!zones.length||!lots.length)return {coverage:0,mean:null};
 let hit=0,sum=0;for(const l of lots){const pt=centroid(l.pts),d=Math.min(...zones.map(z=>urbanDistance(pt,z)));sum+=d;if(d<=250)hit++}return {coverage:100*hit/lots.length,mean:sum/lots.length};
}
function urbanReport(c){
 if(!c){$('optProgramReport').innerHTML='';return}const u=c.program,fmtPct=v=>fmt(v/c.area*100,1)+'%';
 if(!u){$('optProgramReport').innerHTML='';return}
 $('optProgramReport').innerHTML='<div class="urban-report"><strong>Programa urbanístico · '+(u.enabled?(u.ok?'metas atendidas':'metas não atendidas'):'reservas existentes')+'</strong><div class="urban-report-row"><span>Uso</span><small>Mínimo</small><small>Proposta</small></div>'+URBAN_CATEGORIES.map(k=>'<div class="urban-report-row"><span>'+k.name+'</span><small>'+fmtPct(u.targets[k.kind])+'</small><b>'+fmtPct(u.areas[k.kind])+' · '+fmt(u.areas[k.kind],0)+' m²</b></div>').join('')+'<div class="urban-report-note">Lotes a até 250 m em linha reta de praça, parque ou lazer: '+fmt(c.coverage||0,1)+'%. Distância geométrica, não trajeto a pé. Áreas novas vetoriais; crédito de áreas existentes e ocupação viária estimados.</div></div>';
}
/* Plan symbology: landscaping symbols are illustrative, not a detailed planting project. */
const URBAN_PALETTE={green:'#87ad80',plaza:'#afcf9c',institutional:'#b8b9d7',leisure:'#d4ad79',app:'#78aaa0',commercial:'#d4a58b',other:'#b5bdb0'};
function urbanZoneDecor(o,z,namespace='main'){
 if(!['green','plaza','leisure','app'].includes(o.kind))return '';
 const box=bbox(o.pts),dx=box[2]-box[0],dy=box[3]-box[1];if(Math.min(dx,dy)*z<15)return '';
 const clip='land-'+namespace+'-'+String(o.id).replace(/[^a-zA-Z0-9_-]/g,''),A=polyArea(o),spacing=Math.max(7,Math.sqrt(A/36)),r=Math.max(1.3,Math.min(3.1,spacing*.22)),center=blockStats(o).anchor.v;
 let h='<defs><clipPath id="'+clip+'"><path d="'+polyPath(o)+'" fill-rule="evenodd" clip-rule="evenodd"/></clipPath></defs><g clip-path="url(#'+clip+')" pointer-events="none">';
 if(o.kind==='green'&&Math.min(dx,dy)>22){const horizontal=dx>dy,x0=box[0],y0=box[1],x1=box[2],y1=box[3],d=horizontal?'M'+(x0-2)+' '+(y0+dy*.55)+' C'+(x0+dx*.3)+' '+(y0+dy*.12)+' '+(x0+dx*.7)+' '+(y0+dy*.88)+' '+(x1+2)+' '+(y0+dy*.45):'M'+(x0+dx*.42)+' '+(y0-2)+' C'+(x0+dx*.10)+' '+(y0+dy*.33)+' '+(x0+dx*.9)+' '+(y0+dy*.66)+' '+(x0+dx*.56)+' '+(y1+2);h+='<ellipse cx="'+center[0]+'" cy="'+center[1]+'" rx="'+dx*.21+'" ry="'+dy*.19+'" fill="#b9cf9f" opacity=".75"/><path d="'+d+'" stroke="#e9e2cd" stroke-width="2.8" fill="none"/>';}
 if(o.kind==='plaza'){
  h+='<path d="M'+(box[0]-2)+' '+center[1]+'H'+(box[2]+2)+' M'+center[0]+' '+(box[1]-2)+'V'+(box[3]+2)+'" stroke="#e9e1c6" stroke-width="'+Math.min(3.8,Math.max(1.2,Math.min(dx,dy)*.07))+'" fill="none"/>';
  h+='<circle cx="'+center[0]+'" cy="'+center[1]+'" r="'+Math.min(6,Math.min(dx,dy)*.13)+'" fill="#e9e1c6" stroke="#c0b69a" stroke-width="'+.5/z+'"/>';
 }
 if(o.kind==='leisure'&&Math.min(dx,dy)>20){
  const w=Math.min(dx*.42,16),d=Math.min(dy*.46,25);
  if([[center[0]-w/2,center[1]-d/2],[center[0]+w/2,center[1]-d/2],[center[0]+w/2,center[1]+d/2],[center[0]-w/2,center[1]+d/2]].every(v=>insideObj(v,o)))h+='<rect x="'+(center[0]-w/2)+'" y="'+(center[1]-d/2)+'" width="'+w+'" height="'+d+'" rx="1" fill="#e8dbb8" stroke="#b38b58" stroke-width="'+.7/z+'"/><path d="M'+(center[0]-w/2)+' '+center[1]+'H'+(center[0]+w/2)+'" stroke="#b38b58" stroke-width="'+.7/z+'"/>';
 }
 let count=0;
 for(let iy=0;iy<Math.ceil(dy/spacing)&&count<60;iy++)for(let ix=0;ix<Math.ceil(dx/spacing)&&count<60;ix++){
  const jitter=(a,b)=>Math.sin((a+1)*19.13+(b+2)*73.21);let x=box[0]+(ix+.65+(iy%2)*.23+(o.kind==='green'?jitter(ix,iy)*.25:0))*spacing,y=box[1]+(iy+.6+(o.kind==='green'?jitter(iy,ix)*.27:0))*spacing,pt=[x,y];if(!insideObj(pt,o))continue;if(o.kind==='green'&&((x-center[0])/Math.max(1,dx*.22))**2+((y-center[1])/Math.max(1,dy*.20))**2<1)continue;
  if(o.kind==='plaza'&&(Math.abs(x-center[0])<r+2||Math.abs(y-center[1])<r+2))continue;
  if(o.kind==='leisure'&&dist(pt,center)<Math.min(dx,dy)*.27)continue;
  h+='<circle cx="'+(x+.55)+'" cy="'+(y+.65)+'" r="'+r+'" fill="#385c3b" opacity=".17"/><circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="#588b5c" stroke="#3f764a" stroke-width="'+.45/z+'" opacity=".8"/><circle cx="'+(x-r*.27)+'" cy="'+(y-r*.24)+'" r="'+r*.45+'" fill="#a9c899" opacity=".65"/>';count++;
 }
 return h+'</g>';
}
function urbanLotLabelVisible(o,z=view.z){const b=bbox(o.pts),w=Number(o.frontage)||Math.min(b[2]-b[0],b[3]-b[1]),d=Number(o.depth)||Math.max(b[2]-b[0],b[3]-b[1]);return Math.min(w,d)*z>=26&&Math.max(w,d)*z>=42;}
function urbanLotName(o){const m=String(o.name||'').match(/(?:Lote\s*|\/\s*L)(\d+)$/i);return m?'L'+m[1]:String(o.name||'Lote').slice(0,12);}
function urbanRoadPavement(r){const sidewalk=Math.min(2.5,Math.max(.3,r.width*.14));return Math.max(r.width*.4,r.width-2*sidewalk)}
