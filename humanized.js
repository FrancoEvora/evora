
'use strict';
/* Humanized masterplan — vector presentation of the exact project geometry.
   Landscape furnishings are conceptual symbols, not engineering quantities. */
const HU={land:'#e8eadc',lot:'#8ca36b',lotLine:'#f4f5e9',road:'#9b9e9b',collector:'#929995',walk:'#f6f5ea',green:'#73985d',plaza:'#c0cea2',leisure:'#ddc59a',institutional:'#bdc3ca',app:'#8eaf9d',commercial:'#d6ad91',other:'#c2c9b6'};
function huHash(x){let n=2166136261;for(const c of String(x)){n^=c.charCodeAt(0);n=Math.imul(n,16777619)}return (n>>>0)/4294967295}
const huN=x=>Number(x.toFixed(3));
function huPt(v){return v.map(huN).join(' ')}
function huClip(id,o){return '<clipPath id="'+id+'"><path d="'+polyPath(o)+'" fill-rule="evenodd" clip-rule="evenodd"/></clipPath>'}

function huTreeDefs(ns){
 const colors=['#567c51','#6d935c','#83a46a','#4c7554','#91aa69'];let h='';
 for(let i=0;i<colors.length;i++){const c=colors[i];h+='<g id="ht-'+ns+'-'+i+'"><ellipse cx=".27" cy=".36" rx="1.08" ry=".89" fill="#263e30" opacity=".20"/><circle r=".93" fill="'+c+'" stroke="#476b45" stroke-width=".06"/>';for(let k=0;k<5;k++){const a=(k/5+i*.043)*Math.PI*2,rr=.54+.11*huHash(i+'c'+k);h+='<circle cx="'+huN(Math.cos(a)*.39)+'" cy="'+huN(Math.sin(a)*.38)+'" r="'+huN(rr)+'" fill="'+c+'" opacity=".86" stroke="#436849" stroke-opacity=".22" stroke-width=".035"/>'}h+='<ellipse cx="-.20" cy="-.25" rx=".65" ry=".51" fill="#c4d5a2" opacity=".29"/><circle cx="-.10" cy="-.08" r=".14" fill="#416941" opacity=".30"/></g>'}
 return h;
}
function huTree(pt,r,key,ns){const type=Math.min(4,Math.floor(huHash(key)*5)),angle=huHash(key+'rot')*360;return '<use href="#ht-'+ns+'-'+type+'" transform="translate('+huPt(pt)+') rotate('+huN(angle)+') scale('+huN(r)+')" pointer-events="none"/>'}
function huClear(pt,o){let d=Infinity;for(const r of [o.pts,...(o.holes||[])])for(let i=0;i<r.length;i++)d=Math.min(d,dist(pt,nearest(pt,r[i],r[(i+1)%r.length])));return d}
function huZoneArt(o,scale,ns){
 if(!['green','plaza','leisure','institutional','app'].includes(o.kind))return '';
 const id='hz-'+ns+'-'+String(o.id).replace(/[^a-zA-Z0-9_-]/g,''),B=bbox(o.pts),W=B[2]-B[0],H=B[3]-B[1],s=blockStats(o),c=s.anchor.v;
 if(s.area<40||s.depth<4)return '';
 const color=HU[o.kind]||HU.green,spacing=o.kind==='app'?7:o.kind==='green'?10:12;
 let h='<defs>'+huClip(id,o)+'</defs><g clip-path="url(#'+id+')" pointer-events="none">';
 h+='<path d="'+polyPath(o)+'" fill="url(#grass-'+ns+')" fill-rule="evenodd" opacity=".52"/>';
 // Elliptical or gently curving garden walks are schematic and clipped to the designated land use.
 const rad=s.angle*Math.PI/180,u=[Math.cos(rad),-Math.sin(rad)],v=perp(u),tr=(x,y)=>add(c,add(mul(u,x),mul(v,y))),P=(x,y)=>huPt(tr(x,y));
 const L=Math.min(s.width*.46,Math.max(W,H)*.48),D=Math.min(s.depth*.40,s.anchor.clearance*1.45);
 const walkway=o.kind==='plaza'||o.kind==='green'||o.kind==='leisure';
 if(walkway&&L>7&&D>3){
  const walk='M'+P(-L,-D*.15)+' C'+P(-L*.55,-D*.95)+' '+P(-L*.18,D*.70)+' '+P(0,0)+' S'+P(L*.55,-D*.75)+' '+P(L,D*.20);
  h+='<path d="'+walk+'" fill="none" stroke="#7f8a69" stroke-opacity=".25" stroke-width="3.5" stroke-linecap="round"/><path d="'+walk+'" fill="none" stroke="#eee5ce" stroke-width="2.7" stroke-linecap="round"/>';
  if(o.kind==='green'&&D>9){const loop='M'+P(-L*.80,0)+' C'+P(-L*.75,-D)+' '+P(L*.75,-D)+' '+P(L*.80,0)+' C'+P(L*.75,D)+' '+P(-L*.75,D)+' '+P(-L*.80,0)+'Z';h+='<path d="'+loop+'" fill="none" stroke="#efe7cf" stroke-width="1.65" stroke-linejoin="round"/>'}
 }
 if(o.kind==='plaza'&&s.anchor.clearance>6){const rr=Math.min(10,s.anchor.clearance*.47);h+='<path d="M'+P(-L*1.2,0)+'L'+P(L*1.2,0)+' M'+P(0,-D*1.5)+'L'+P(0,D*1.5)+'" stroke="#e6d8b7" stroke-width="3.4" fill="none"/><circle cx="'+huN(c[0])+'" cy="'+huN(c[1])+'" r="'+huN(rr)+'" fill="#e8ddbf" stroke="#c8b890" stroke-width=".65"/><circle cx="'+huN(c[0])+'" cy="'+huN(c[1])+'" r="'+huN(rr*.43)+'" fill="#9cb38a" stroke="#b09d77" stroke-width=".45"/>'}
 if(o.kind==='leisure'&&s.anchor.clearance>=11){const cw=14,ch=23;const pts=[tr(-cw/2,-ch/2),tr(cw/2,-ch/2),tr(cw/2,ch/2),tr(-cw/2,ch/2)];if(pts.every(pt=>insideObj(pt,o))&&orgFits({pts},o)){h+='<g transform="translate('+huPt(c)+') rotate('+huN(-s.angle)+')"><rect x="-8.5" y="-13" width="17" height="26" rx=".8" fill="#d9c8a1" stroke="#a99572" stroke-width=".5"/><rect x="-6.8" y="-11.3" width="13.6" height="22.6" fill="#a8b293" stroke="#f4f0df" stroke-width=".35"/><path d="M-6.8 0H6.8 M0 -11.3V11.3 M-6.8 -7H6.8 M-6.8 7H6.8" fill="none" stroke="#f5f1e1" stroke-width=".32"/></g>'}}
 // Varied tree canopies, not a uniform symbol grid. Keep each crown within its actual zone.
 let count=0;const step=Math.max(spacing,Math.sqrt(s.area/115));
 if(o.kind!=='institutional')for(let iy=0;iy<Math.ceil(H/step)&&count<125;iy++)for(let ix=0;ix<Math.ceil(W/step)&&count<125;ix++){
  const key=o.id+'-'+ix+'-'+iy,pt=[B[0]+(ix+.50+(huHash(key)-.5)*.68)*step,B[1]+(iy+.52+(huHash(key+'y')-.5)*.68)*step],r=2.05+huHash(key+'r')*1.65;
  if(!insideObj(pt,o)||huClear(pt,o)<r*.97)continue;
  const local=[dot(sub(pt,c),u),dot(sub(pt,c),v)];
  if(o.kind==='plaza'&&Math.abs(local[0])<r+3&&Math.abs(local[1])<r+3)continue;
  if(o.kind==='leisure'&&Math.abs(local[0])<10&&Math.abs(local[1])<15)continue;
  if(o.kind==='green'&&Math.abs(local[1])<2.8+r&&Math.abs(local[0])<L*.9)continue;
  h+=huTree(pt,r,key,ns);count++;
 }
 if(o.kind==='institutional'&&s.anchor.clearance>8){const rr=Math.min(3,s.anchor.clearance*.19);for(const t of [-1,1])for(const k of [-1,0,1]){const pt=tr(t*L*.75,k*D*.73);if(insideObj(pt,o)&&huClear(pt,o)>rr)h+=huTree(pt,rr,o.id+t+k,ns)}}
 return h+'</g>';
}
function huLotArt(o,ns){
 const A=polyArea(o),s=blockStats(o),c=s.anchor.v;if(A<80||s.anchor.clearance<3.6||o.blockConflict)return '';
 // A single indicative garden tree near the rear, not a dwelling or a committed planting quantity.
 const front=o.frontPts?.length>=2?orgArc(o.frontPts).at(.5):Number.isInteger(o.frontEdge)&&o.pts[o.frontEdge]?lerp(o.pts[o.frontEdge],o.pts[(o.frontEdge+1)%o.pts.length],.5):null;
 let candidates=front?[add(c,mul(norm(sub(c,front)),Math.min(4,s.anchor.clearance*.32))),c]:[c],r=1.25+huHash(o.id)*.95;
 const pt=candidates.find(v=>insideObj(v,o)&&huClear(v,o)>r+1);if(!pt)return '';
 return huTree(pt,r,o.id,ns);
}
function huRoadArt(q,z,ns){
 let h='',count=0;const step=Math.max(12,9/z);
 // Sidewalk trees at selected stations on the collector and perimeter streets; do not block intersections.
 for(const r of q.roads.filter(r=>r.cls!=='Local'||r.name==='Circuito de contorno')){
  const pts=roadPts(r),a=orgArc(pts);if(a.len<step)continue;
  for(let d=step*.8;d<a.len-step*.5&&count<260;d+=step){
   const t=d/a.len,pt=a.at(t),u=orgTangent(a,t),n=perp(u),sidewalk=(r.width-urbanRoadPavement(r))/2,rr=Math.min(1.4,Math.max(.75,sidewalk*.74));
   for(const side of [-1,1]){const v=add(pt,mul(n,side*(r.width/2-sidewalk*.54)));if(!insideObj(v,q.boundary)||q.roads.some(o=>o!==r&&roadPts(o).slice(1).some((b,i)=>dist(v,nearest(v,roadPts(o)[i],b))<o.width/2+rr+1)))continue;
    h+=huTree(v,rr,r.id+d+side,ns);count++;
   }
  }
 }
 return h;
}
function huGraphic(q,z,ns='human',labels=true){
 if(!q.boundary)return '';const B=q.boundary,l=1/z,id='human-'+ns;
 let h='<defs>'+huClip(id,B)+huTreeDefs(ns)+'<pattern id="grass-'+ns+'" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M1 7l1 -1 M5 3l1 -1 M8 8l.7 -1" stroke="#6f8b63" stroke-opacity=".15" stroke-width=".25"/></pattern><pattern id="lot-'+ns+'" width="11" height="11" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r=".23" fill="#ae9b79" opacity=".22"/></pattern></defs>';
 h+='<path d="'+polyPath(B)+'" transform="translate('+huN(2*l)+' '+huN(3*l)+')" fill="#41563d" opacity=".12" fill-rule="evenodd"/><path d="'+polyPath(B)+'" fill="'+HU.land+'" fill-rule="evenodd" stroke="#70816c" stroke-width="'+.85*l+'"/><g clip-path="url(#'+id+')">';
 for(const b of q.blocks)h+='<path d="'+polyPath(b)+'" fill="#e1e5d2" stroke="#c2c9b7" stroke-width="'+.35*l+'" fill-rule="evenodd"/>';
 for(const o of q.lots){const a=huHash(o.id),fill=o.blockConflict?'#e3ab99':a>.65?'#879f64':a>.32?'#91a96e':'#8ca46a';h+='<path d="'+polyPath(o)+'" fill="'+fill+'" stroke="'+(o.blockConflict?'#b95340':HU.lotLine)+'" stroke-width="'+.85*l+'" fill-rule="evenodd"/><path d="'+polyPath(o)+'" fill="url(#lot-'+ns+')" fill-rule="evenodd" opacity=".40"/>'}
 for(const o of q.zones)h+='<path d="'+polyPath(o)+'" fill="'+(HU[o.kind]||HU.other)+'" stroke="#7c9375" stroke-width="'+.72*l+'" fill-rule="evenodd"/>'+huZoneArt(o,z,ns);
 h+=jfPaint(q,'right-of-way','#9ca594');for(const r of q.roads)h+='<path d="'+path(roadPts(r))+'" fill="none" stroke="#9ca594" stroke-width="'+(r.width+.72*l)+'" stroke-linecap="round" stroke-linejoin="round"/>';
 h+=jfPaint(q,'right-of-way',HU.walk);for(const r of q.roads)h+='<path d="'+path(roadPts(r))+'" fill="none" stroke="'+HU.walk+'" stroke-width="'+r.width+'" stroke-linecap="round" stroke-linejoin="round"/>';
 h+=jfPaint(q,'asphalt',HU.road);for(const r of q.roads)h+='<path d="'+path(roadPts(r))+'" fill="none" stroke="'+(r.cls==='Local'?HU.road:HU.collector)+'" stroke-width="'+(urbanRoadPavement(r)+.30*l)+'" stroke-linecap="round" stroke-linejoin="round"/>';
 for(const r of q.roads)if(r.cls!=='Local')h+='<path d="'+path(roadPts(r))+'" fill="none" stroke="#f4f2df" stroke-width="'+.45*l+'" stroke-dasharray="'+5*l+' '+6*l+'" opacity=".80"/>';
 for(const r of q.rounds){h+='<circle cx="'+huN(r.c[0])+'" cy="'+huN(r.c[1])+'" r="'+huN(r.r)+'" fill="'+HU.road+'"/><circle cx="'+huN(r.c[0])+'" cy="'+huN(r.c[1])+'" r="'+huN(r.r-r.w)+'" fill="'+HU.green+'" stroke="'+HU.walk+'" stroke-width=".6"/>';if(r.r-r.w>3)h+=huTree(r.c,Math.min(3,(r.r-r.w)*.55),r.id,ns)}
 // Empty residential parcels read as grass plots; no invented tree in every lot.
 h+=huRoadArt(q,z,ns);
 if(labels){
  const label=(pt,name,size,ink,stroke='#f7f5eb')=>'<text x="'+huN(pt[0])+'" y="'+huN(pt[1])+'" font-family="Arial,sans-serif" text-anchor="middle" dominant-baseline="middle" font-weight="650" font-size="'+size*l+'" paint-order="stroke" stroke="'+stroke+'" stroke-width="'+1.85*l+'" fill="'+ink+'">'+esc(name)+'</text>';
  for(const o of q.zones){const s=blockStats(o),name=mpZoneName(o);if(s.anchor.clearance*z>=Math.max(13,name.length*2.15))h+=label(s.anchor.v,name,10,'#2e503b')}
  for(const b of q.blocks){const s=blockStats(b);if(s.anchor.clearance*z>20&&q.lots.some(l=>l.blockId===b.id)){const pt=s.anchor.v;h+='<circle cx="'+huN(pt[0])+'" cy="'+huN(pt[1])+'" r="'+8.6*l+'" fill="#b95b4e" stroke="#f1e4d3" stroke-width="'+.8*l+'"/><text x="'+huN(pt[0])+'" y="'+huN(pt[1])+'" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="'+7.8*l+'" font-weight="bold" fill="white">'+esc(b.name.replace(/^Q0?/,''))+'</text>'}}
 }
 return h+'</g><path d="'+polyPath(B)+'" fill="none" stroke="#506c53" stroke-width="'+1.2*l+'" fill-rule="evenodd"/>';
}
function huSheet(c){
 const q=c.q,B=q.boundary,bb=bbox(B.pts),dx=bb[2]-bb[0],dy=bb[3]-bb[1],W=1600,H=1080,z=Math.min(1170/Math.max(dx,1),770/Math.max(dy,1)),x=52+(1180-dx*z)/2-bb[0]*z,y=166+(780-dy*z)/2-bb[1]*z,audit={...mpAudit(c),...orgStats(c),...(c.audit||{})},scale=[10,20,50,100,200,500].filter(v=>v*z<=155).at(-1)||5;
 const txt=(x,y,sz,s,color='#2a483b',weight=400,extra='')=>'<text x="'+x+'" y="'+y+'" font-size="'+sz+'" font-weight="'+weight+'" fill="'+color+'" '+extra+'>'+esc(s)+'</text>';
 let h='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'"><rect width="'+W+'" height="'+H+'" fill="#f8f7f0"/><g font-family="Arial,sans-serif"><rect x="26" y="26" width="1548" height="1028" fill="none" stroke="#d5d9cb"/><rect x="52" y="53" width="44" height="44" rx="2" fill="#294c3d"/><path d="M63 86V64H86 M63 75H81 M63 86H86" fill="none" stroke="#e8d9b6" stroke-width="2.5"/>';
 h+=txt(111,66,12,'ÉVORA URBANISMO  /  TRAÇADO STUDIO 3.1','#526d59',700,'letter-spacing="2.3"')+txt(111,94,27,'Implantação humanizada','#28483b',700)+txt(52,131,15,String(q.name||'Estudo urbanístico').slice(0,80),'#67796a',400)+txt(1548,67,12,'MASTERPLAN · ESTUDO CONCEITUAL','#56735e',700,'text-anchor="end" letter-spacing="1.1"')+txt(1548,94,13,'Geometria métrica · paisagismo indicativo','#7a8978',400,'text-anchor="end"')+'<path d="M52 149H1548" stroke="#cdd7c8"/>';
 h+='<g transform="translate('+huN(x)+' '+huN(y)+') scale('+huN(z)+')">'+huGraphic(q,z,'sheet3')+'</g>';
 h+='<rect x="1260" y="169" width="288" height="790" fill="#eff2e8" stroke="#d7dece"/>'+txt(1281,197,11,'SÍNTESE URBANÍSTICA','#54705b',700,'letter-spacing="1.7"');
 const values=[['Área da gleba',fmt(c.area/10000,2)+' ha'],['Lotes válidos',fmt(c.lotCount,0)],['Área em lotes',fmt(c.yield,1)+'%'],['Sistema viário¹',fmt(c.roadPct,1)+'%'],['Frentes curvas',String(audit.curvedLots||0)],['Vias curvilíneas',String(audit.curvedRoads||0)]];
 for(let i=0;i<values.length;i++){const yy=226+i*51;h+=txt(1281,yy,12,values[i][0],'#64796a')+txt(1281,yy+24,23,values[i][1],'#294c3d',700)}
 h+='<path d="M1281 538H1527" stroke="#ccd6c8"/>'+txt(1281,561,11,'LEGENDA DE USOS','#54705b',700,'letter-spacing="1.7"');
 const legend=[['Lotes residenciais',HU.lot],['Vias e passeios',HU.road],['Parque / área verde',HU.green],['Praças',HU.plaza],['Lazer',HU.leisure],['Institucional',HU.institutional],['APP / restrição',HU.app],['Uso comercial',HU.commercial],['Saldo / demais usos',HU.land]];
 for(let i=0;i<legend.length;i++){const yy=588+i*27;h+='<rect x="1281" y="'+(yy-11)+'" width="15" height="15" rx="1.5" fill="'+legend[i][1]+'" stroke="#a2aa94"/>'+txt(1308,yy+1,12,legend[i][0],'#4e6354')}
 h+='<path d="M1281 842H1527" stroke="#ccd6c8"/>'+txt(1281,864,11,'LEITURA DO PROJETO','#54705b',700,'letter-spacing="1.4"')+txt(1281,886,11,audit.accessCount?'Acesso indicado: conferir conexão.':'Acessos externos a definir.','#796744')+txt(1281,904,11,'Arborização e mobiliário indicativos.','#796744')+txt(1281,922,11,'¹ Ocupação viária estimada.','#796744')+txt(1281,940,11,'Sem validação topográfica ou legal.','#796744');
 h+='<g transform="translate(66 190)"><path d="M0 39L13 0L26 39L13 32Z" fill="#315843"/><path d="M13 0L26 39L13 32Z" fill="#a5b39a"/>'+txt(13,-9,13,'N','#315843',700,'text-anchor="middle"')+'</g>';
 h+='<g transform="translate(61 984)"><rect width="'+huN(scale*z)+'" height="7" fill="#365644"/><rect x="'+huN(scale*z/2)+'" width="'+huN(scale*z/2)+'" height="7" fill="#f8f7f0" stroke="#365644"/>'+txt(0,22,11,'0','#526b59')+txt(huN(scale*z),22,11,scale+' m','#526b59',400,'text-anchor="end"')+'</g>';
 h+=txt(1548,1002,12,'Prancha de concepção · não constitui projeto executivo ou aprovação','#6d7c6d',400,'text-anchor="end"')+'</g></svg>';
 return h;
}
function huExportPNG(svgText,name){
 const url=URL.createObjectURL(new Blob([svgText],{type:'image/svg+xml;charset=utf-8'})),img=new Image();
 img.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=4000;canvas.height=Math.round(4000*img.naturalHeight/img.naturalWidth);const ctx=canvas.getContext('2d');ctx.fillStyle='#f8f7f0';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{if(!blob)return toast('Não foi possível gerar PNG. Use SVG.');const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)},'image/png')}catch(e){toast('Exportação PNG indisponível. Use SVG.')}finally{URL.revokeObjectURL(url)}};
 img.onerror=()=>{URL.revokeObjectURL(url);toast('Não foi possível rasterizar. Use SVG.')};img.src=url;
}
let huView='human';
function huSheetCurrent(){const c=mpCurrent();return c?(huView==='human'?huSheet(c):mpSheet(c)):null}
function installHumanized(){
 $('masterSheetBtn').onclick=()=>{if(!p.boundary)return toast('Defina a gleba antes de gerar a implantação.');huView='human';$('sheetStyle').value='human';$('masterSheetView').innerHTML=huSheetCurrent();$('masterSheetDialog').showModal()};
 $('sheetStyle').onchange=()=>{huView=$('sheetStyle').value;$('masterSheetView').innerHTML=huSheetCurrent()||''};
 $('masterSheetDownload').onclick=()=>{const s=huSheetCurrent();if(s)download(filename()+'_'+(huView==='human'?'humanizada':'tecnica')+'.svg',s,'image/svg+xml;charset=utf-8')};
 $('masterSheetPNG').onclick=()=>{const s=huSheetCurrent();if(s)huExportPNG(s,filename()+'_'+(huView==='human'?'humanizada':'tecnica')+'.png')};
 $('optHumanSheet').onclick=()=>{const c=optCandidates[optSelected];if(c)download(filename()+'_humanizada.svg',huSheet(c),'image/svg+xml;charset=utf-8')};
 $('optHumanPNG').onclick=()=>{const c=optCandidates[optSelected];if(c)huExportPNG(huSheet(c),filename()+'_humanizada.png')};
 $('optPreviewStyle').onchange=()=>optRender();
}
