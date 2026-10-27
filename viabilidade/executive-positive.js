(function(){
'use strict';
const STORE='evora.viabilidade.v1';
const NS='http://www.w3.org/2000/svg';

const money=v=>{
 const n=Number(v)||0,a=Math.abs(n),sign=n<0?'−':'';
 const value=a>=1e6?(a/1e6).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' mi':a>=1e4?(a/1e3).toLocaleString('pt-BR',{maximumFractionDigits:0}):a.toLocaleString('pt-BR',{maximumFractionDigits:0});
 return sign+'R$ '+value;
};

function executivePanel(){
 return Array.from(document.querySelectorAll('.panel')).find(panel=>panel.querySelector('h2')?.textContent.trim()==='Caixa disponível para obra × implantação')||null;
}

function currentResult(){
 try{
  const library=JSON.parse(localStorage.getItem(STORE));
  if(!library||!Array.isArray(library.projects)||!library.projects.length||!window.EvoraEngine)return null;
  const project=library.projects.find(item=>item.id===library.active)||library.projects[0];
  if(!project?.params)return null;
  return window.EvoraEngine.simulate(project.params,true);
 }catch{return null;}
}

function selectedRows(panel,result){
 const value=panel.querySelector('.segmented .active')?.dataset.value||'36';
 if(value==='all')return result.rows;
 const limit=Number(value);
 return Number.isFinite(limit)?result.rows.filter(row=>row.t<=limit):result.rows;
}

function svgNode(name,attrs={}){
 const node=document.createElementNS(NS,name);
 for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
 return node;
}

function polygonPoints(points){
 return points.map(point=>point[0].toFixed(2)+','+point[1].toFixed(2)).join(' ');
}

function installStyles(){
 if(document.getElementById('executive-positive-style'))return;
 const style=document.createElement('style');
 style.id='executive-positive-style';
 style.textContent='.legend-positive i{width:14px!important;height:8px!important;border-radius:2px!important;background:#6f9b70!important;opacity:.24}.positive-guide{stroke:#4f7b58;stroke-width:1.2;stroke-dasharray:3 3}.positive-dot{fill:#4f7b58}.positive-label{pointer-events:none}.positive-label rect{fill:#f3f8ee;stroke:#c8dcc0;stroke-width:1}.positive-label text{fill:#507357;font-size:7px;font-weight:650;letter-spacing:.55px}.positive-label text.value{fill:#274c32;font-size:9px;letter-spacing:0;font-weight:700}.positive-surplus-area{pointer-events:none}';
 document.head.appendChild(style);
}

function enhance(){
 const panel=executivePanel(),svg=panel?.querySelector('svg.chart');
 if(!panel||!svg||svg.dataset.positiveSurplus==='1')return;
 const result=currentResult();
 if(!result)return;
 const rows=selectedRows(panel,result);
 if(rows.length<2)return;

 const box=svg.viewBox.baseVal,W=box.width,H=box.height,L=57,RR=16,T=20,B=35,w=W-L-RR,h=H-T-B,maxT=Math.max(1,rows.at(-1).t);
 const values=rows.flatMap(row=>[Number(row.cumCashForWork)||0,Number(row.cumWork)||0]);
 const lo=Math.min(0,...values),hi=Math.max(1,...values),span=hi-lo,raw=span/4,mag=10**Math.floor(Math.log10(raw)),step=Math.ceil(raw/mag)*mag,ylo=Math.floor(lo/step)*step,yhi=Math.ceil(hi/step)*step;
 const x=t=>L+t/maxT*w,y=v=>T+(yhi-v)/(yhi-ylo)*h;
 const area=svgNode('g',{class:'positive-surplus-area'});
 let peak={value:0,month:null,row:null};

 for(const row of rows){
  const surplus=(Number(row.cumCashForWork)||0)-(Number(row.cumWork)||0);
  if(surplus>peak.value)peak={value:surplus,month:row.t,row};
 }

 for(let i=0;i<rows.length-1;i++){
  const r0=rows[i],r1=rows[i+1],cash0=Number(r0.cumCashForWork)||0,cash1=Number(r1.cumCashForWork)||0,work0=Number(r0.cumWork)||0,work1=Number(r1.cumWork)||0,d0=cash0-work0,d1=cash1-work1,x0=x(r0.t),x1=x(r1.t);
  let points=null;
  if(d0>0&&d1>0)points=[[x0,y(cash0)],[x1,y(cash1)],[x1,y(work1)],[x0,y(work0)]];
  else if(d0>0&&d1<=0){const q=d0/(d0-d1),xc=x0+(x1-x0)*q,vc=cash0+(cash1-cash0)*q;points=[[x0,y(cash0)],[xc,y(vc)],[x0,y(work0)]];}
  else if(d0<=0&&d1>0){const q=(-d0)/(d1-d0),xc=x0+(x1-x0)*q,vc=cash0+(cash1-cash0)*q;points=[[xc,y(vc)],[x1,y(cash1)],[x1,y(work1)]];}
  if(points){const polygon=svgNode('polygon',{points:polygonPoints(points),fill:'#6f9b70','fill-opacity':'.13'});area.appendChild(polygon);}
 }

 const firstPath=svg.querySelector('path');
 if(firstPath)svg.insertBefore(area,firstPath);else svg.appendChild(area);

 if(peak.value>0&&peak.row){
  const cash=Number(peak.row.cumCashForWork)||0,work=Number(peak.row.cumWork)||0,xx=x(peak.month),yc=y(cash),yw=y(work),ym=(yc+yw)/2,label=money(peak.value),boxW=Math.min(152,Math.max(106,label.length*6.4+18)),bx=Math.max(L+4,Math.min(W-RR-boxW-4,xx+10)),by=Math.max(T+5,Math.min(H-B-34,ym-16));
  const guide=svgNode('line',{class:'positive-guide',x1:xx,x2:xx,y1:yc,y2:yw});
  const dot=svgNode('circle',{class:'positive-dot',cx:xx,cy:ym,r:3.5});
  const group=svgNode('g',{class:'positive-label'}),rect=svgNode('rect',{x:bx,y:by,width:boxW,height:32,rx:5}),title=svgNode('text',{x:bx+9,y:by+12}),value=svgNode('text',{class:'value',x:bx+9,y:by+25});
  title.textContent='PICO POSITIVO · M'+peak.month;value.textContent=label;group.append(rect,title,value);svg.append(guide,dot,group);

  const legend=panel.querySelector('.legend');
  if(legend&&!legend.querySelector('.legend-positive')){
   const item=document.createElement('span');item.className='legend-positive';item.innerHTML='<i></i>Caixa acima da obra · pico '+money(peak.value)+' · M'+peak.month;legend.appendChild(item);
  }
 }

 rows.forEach((row,index)=>{
  const title=svg.querySelectorAll('rect[fill="transparent"] title')[index];
  if(!title)return;
  const surplus=Math.max(0,(Number(row.cumCashForWork)||0)-(Number(row.cumWork)||0));
  if(surplus>0)title.textContent+=' | Caixa acima da obra: '+money(surplus);
 });
 svg.dataset.positiveSurplus='1';
}

let scheduled=false;
function schedule(){
 if(scheduled)return;
 scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;installStyles();enhance();});
}

const root=document.getElementById('app');
if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
window.addEventListener('storage',schedule);
schedule();
})();
