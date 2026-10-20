/** WGS84 polygon input. Topology and ellipsoidal area are validated by PostGIS on save. */
export function polygonGeometry(input:unknown):GeoJSON.MultiPolygon {
 const polygons:GeoJSON.Position[][][]=[];let count=0;
 function visit(value:unknown){
  if(!value||typeof value!=='object')throw new Error('Importe ou desenhe uma poligonal para o ativo.');
  const g=value as {type?:string;geometry?:unknown;features?:unknown[];coordinates?:unknown};
  if(g.type==='FeatureCollection'){if(!Array.isArray(g.features)||!g.features.length)throw new Error('Arquivo sem poligonais.');g.features.forEach(visit);return}
  if(g.type==='Feature'){visit(g.geometry);return}
  if(g.type!=='Polygon'&&g.type!=='MultiPolygon')throw new Error('Use Polygon ou MultiPolygon. Pontos e linhas não definem o perímetro do ativo.');
  const parts=g.type==='Polygon'?[g.coordinates]:g.coordinates;
  if(!Array.isArray(parts)||!parts.length)throw new Error('Poligonal vazia.');
  for(const part of parts){
   if(!Array.isArray(part)||!part.length)throw new Error('Poligonal sem contorno.');
   const rings=part.map((ring:unknown)=>{
    if(!Array.isArray(ring)||ring.length<4)throw new Error('Cada contorno precisa de três vértices e fechamento.');
    const points=ring.map((p:unknown)=>{if(!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)throw new Error('Use coordenadas WGS84: longitude e latitude.');if(++count>10000)throw new Error('Limite de 10.000 vértices por ativo.');return[p[0],p[1]]});
    const first=points[0],last=points.at(-1)!;
    if(first[0]!==last[0]||first[1]!==last[1])throw new Error('O contorno deve estar fechado: primeiro e último vértices iguais.');
    if(new Set(points.map(p=>p.join(','))).size<3)throw new Error('A poligonal precisa de três vértices distintos.');
    let signed=0;const [ox,oy]=first;
    for(let i=0;i<points.length-1;i++)signed+=(points[i][0]-ox)*(points[i+1][1]-oy)-(points[i+1][0]-ox)*(points[i][1]-oy);
    if(Math.abs(signed)<1e-14)throw new Error('Contorno sem área ou com cruzamento de vértices.');
    return points;
   });
   polygons.push(rings);
  }
 }
 visit(input);return{type:'MultiPolygon',coordinates:polygons};
}
export function polygonSummary(input:unknown){
 const geometry=polygonGeometry(input);let area=0,vertices=0,minX=180,minY=90,maxX=-180,maxY=-90;
 const rad=Math.PI/180;
 for(const polygon of geometry.coordinates)for(let j=0;j<polygon.length;j++){
  const ring=polygon[j];let sum=0;vertices+=ring.length-1;
  for(let i=0;i<ring.length-1;i++){const [x,y]=ring[i],[x2,y2]=ring[i+1];minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);sum+=(x2-x)*rad*(2+Math.sin(y*rad)+Math.sin(y2*rad))}
  area+=(j===0?1:-1)*Math.abs(sum)*6371008.8**2/2;
 }
 if(area<=0||!Number.isFinite(area))throw new Error('Poligonal sem área válida. Confira os contornos.');
 return{geometry,areaHa:area/10000,vertices,latitude:(minY+maxY)/2,longitude:(minX+maxX)/2};
}
