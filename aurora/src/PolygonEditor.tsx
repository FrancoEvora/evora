import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import {Pencil,Undo2,Check,LocateFixed} from 'lucide-react';
import {polygonSummary} from './geometry';
import {Button} from './ui';
import {number} from './lib';
export default function PolygonEditor({geometry,onChange,disabled=false}:{geometry:unknown;onChange:(g:unknown)=>void;disabled?:boolean}){
 const node=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),marks=useRef<L.LayerGroup|null>(null);
 const [drawing,setDrawing]=useState(false),[points,setPoints]=useState<[number,number][]>([]),[error,setError]=useState('');
 const drawingRef=useRef(false);drawingRef.current=drawing&&!disabled;
 useEffect(()=>{if(!node.current)return;const m=L.map(node.current,{scrollWheelZoom:false}).setView([-18.72,-47.49],12);map.current=m;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(m);
  marks.current=L.layerGroup().addTo(m);m.on('click',(e:L.LeafletMouseEvent)=>{if(drawingRef.current)setPoints(p=>[...p,[e.latlng.lat,e.latlng.lng]])});
  const observer=new ResizeObserver(()=>m.invalidateSize());observer.observe(node.current);return()=>{observer.disconnect();m.remove();map.current=null};
 },[]);
 useEffect(()=>{if(!marks.current||!map.current)return;marks.current.clearLayers();if(drawing){if(points.length)L.polyline(points,{color:'#42cfe0',weight:3}).addTo(marks.current);for(const p of points)L.circleMarker(p,{radius:5,color:'#fff',fillColor:'#1aaabb',fillOpacity:1}).addTo(marks.current)}else if(geometry){try{const layer=L.geoJSON(geometry as GeoJSON.GeoJsonObject,{style:{color:'#39c7d4',weight:3,fillOpacity:.25}}).addTo(marks.current);map.current.fitBounds(layer.getBounds(),{padding:[30,30],maxZoom:17})}catch{setError('Confira a poligonal importada.')}}},[geometry,drawing,points]);
 let summary=null;try{if(geometry)summary=polygonSummary(geometry)}catch{/* Import and submit show validation errors. */}
 function finish(){try{if(points.length<3)throw new Error('Marque pelo menos três vértices.');const coords=points.map(([lat,lng])=>[lng,lat]);coords.push(coords[0]);const g=polygonSummary({type:'Polygon',coordinates:[coords]}).geometry;onChange(g);setDrawing(false);setError('')}catch(e){setError((e as Error).message)}}
 return <section className="polygon-editor span2" aria-label="Perímetro do ativo"><div className="polygon-toolbar"><strong>Poligonal do ativo <span>Obrigatória</span></strong><div>{drawing?<><Button type="button" variant="secondary" disabled={!points.length||disabled} onClick={()=>setPoints(p=>p.slice(0,-1))}><Undo2 size={15}/>Desfazer</Button><Button type="button" disabled={points.length<3||disabled} onClick={finish}><Check size={15}/>Concluir perímetro</Button><button type="button" className="text-btn" onClick={()=>setDrawing(false)}>Cancelar desenho</button></>:<Button type="button" variant="secondary" disabled={disabled} onClick={()=>{setPoints([]);setDrawing(true);setError('')}}><Pencil size={15}/>{geometry?'Redesenhar':'Desenhar no mapa'}</Button>}</div></div><div ref={node} className={'polygon-canvas '+(drawing?'drawing':'')}/><p role="status">{drawing?`${points.length} vértices · clique no mapa seguindo o contorno e conclua o perímetro.`:summary?`${summary.vertices} vértices · área aproximada: ${number(summary.areaHa)} ha. Área geodésica calculada ao salvar.`:'Navegue até a área e desenhe seu contorno, ou importe um arquivo abaixo.'}</p><button type="button" className="text-btn" onClick={()=>navigator.geolocation?.getCurrentPosition(p=>map.current?.setView([p.coords.latitude,p.coords.longitude],16),()=>setError('Não foi possível obter sua localização. Navegue pelo mapa ou importe a poligonal.'),{timeout:12000})}><LocateFixed size={14}/>Ir para minha localização</button>{error&&<p className="form-error" role="alert">{error}</p>}</section>
}
