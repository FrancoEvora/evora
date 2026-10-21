import {circleGeometry,clipGeometry,boundsOf} from './heatmap.mjs';
export const environmentalKeys=['ide_sisema','ibama','icmbio','iphan','graprohab'];
export const environmentalColors={ide_sisema:'#70cda5',ibama:'#f29273',icmbio:'#81b7e9',iphan:'#c7a0e8',graprohab:'#eac76b'};
function inRing(p,r){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if(((a[1]>p[1])!==(b[1]>p[1]))&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]))inside=!inside;}return inside;}
export function intersects(a,b){
 if(!a||!b)return false;
 const A=boundsOf(a),B=boundsOf(b);if(A[0]>B[2]||A[2]<B[0]||A[1]>B[3]||A[3]<B[1])return false;
 const polygons=b.type==='Polygon'?[b.coordinates]:b.type==='MultiPolygon'?b.coordinates:[];
 if(a.type==='Point'||a.type==='MultiPoint'){const points=a.type==='Point'?[a.coordinates]:a.coordinates;return points.some(p=>polygons.some(r=>inRing(p,r[0])&&!r.slice(1).some(h=>inRing(p,h))));}
 if(['Polygon','MultiPolygon'].includes(a.type))return !!clipGeometry(a,b);
 throw new Error('Geometria não suportada nesta triagem');
}
export function environmentalSelection(snapshot,latitude,longitude,radius){const circle=circleGeometry(latitude,longitude,radius),features=[];let issues=0;for(const f of snapshot?.spatial?.features||[]){try{if(intersects(f.geometry,circle))features.push(f);}catch{issues++;}}return{features,issues};}
// ArcGIS dates use milliseconds; WFS may encode a date as YYYY-MM-DDZ.
// Preserve unknown formats rather than guessing locale or inventing a date.
export function environmentalDate(value){const s=String(value??'');if(/^\d{13}$/.test(s)){const d=new Date(Number(s));return Number.isFinite(d.valueOf())?d.toISOString():s;}if(/^\d{4}-\d{2}-\d{2}Z$/.test(s))return s.slice(0,10);return s;}
