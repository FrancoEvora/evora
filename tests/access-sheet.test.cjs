'use strict';
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
const TEST_BODY="\nconst t={},details={};p=blank();p.boundary={id:'g',name:'Gleba',pts:[[0,0],[430,0],[430,335],[0,335]]};const s={mode:'new',objective:'urban',f:12,d:25,min:300,wmin:12,wmax:16,maxBlock:125,rows:2,flex:true,rotate:true,roadShare:35,publicProgram:true,greenPct:10,plazaPct:3,institutionalPct:5,leisurePct:2,hierarchy:true,morphology:'garden',adaptive:true,accessEdge:0};\nconst r=optEvaluate(cp(p),s,{angle:90,w:12,pattern:'garden',ratio:1.7,maxBlock:125,phase:.5,master:true});t.access=!!r&&r.audit.accessCount===1&&r.audit.ends===0&&r.components===1&&r.q.roads.some(o=>o.masterAccess);if(r){p=cp(r.q);const c=mpCurrent();t.currentSheet=mpSheet(c).includes('Acesso indicado: conferir.')&&mpSheet(c).includes('QUADRO URBANÍSTICO');$('masterSheetBtn').onclick();t.sheetUI=$('masterSheetDialog').open&&$('masterSheetView').innerHTML.includes('Implantação humanizada');$('sheetStyle').value='technical';$('sheetStyle').onchange();t.sheetTechnical=$('masterSheetView').innerHTML.includes('QUADRO URBANÍSTICO');}\nreturn {t,details};\n";
function runQuadraTests(h,combined){
const ids=new Set([...h.matchAll(/id="([^"]+)"/g)].map(m=>m[1])),els=new Map();
function el(id){const c=new Set();return {id,clientWidth:1000,clientHeight:700,value:"",dataset:{},style:{},checked:false,disabled:false,open:false,innerHTML:"",textContent:"",children:[],classList:{add:x=>c.add(x),remove:x=>c.delete(x),toggle:(x,f)=>f===undefined?(c.has(x)?(c.delete(x),false):(c.add(x),true)):(f?c.add(x):c.delete(x),f),contains:x=>c.has(x)},addEventListener(){},setAttribute(){},focus(){},getBoundingClientRect(){return {left:0,top:0,width:1000,height:700}},append(...x){this.children.push(...x)},replaceChildren(){this.children=[]},show(){this.open=true},showModal(){this.open=true},close(){this.open=false},click(){this.onclick?.({target:this})}}}
const get=id=>{if(!ids.has(id))throw Error("Missing element "+id);if(!els.has(id))els.set(id,el(id));return els.get(id)},bases=["grid","satellite","street"].map(x=>{const e=el(x);e.dataset.base=x;return e});
const doc={getElementById:get,querySelectorAll:s=>s==="[data-base]"?bases:[],querySelector:s=>s.startsWith("[data-base=")?bases.find(x=>s.includes(x.dataset.base)):null,createElement:()=>el("generated"),addEventListener(){}},store=new Map(),ls={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},win={addEventListener(){}};
return new Function("document","window","localStorage","ResizeObserver","setTimeout","clearTimeout","confirm","location",combined+"\n"+TEST_BODY)(doc,win,ls,class{observe(){}},()=>0,()=>{},()=>true,{protocol:"https:"});
}





const result=runQuadraTests(read('index.html'),["parcel.js","precision.js","blocks.js","urban.js","masterplan.js","organic.js","humanized.js","design-review.js","optimizer.js","studio.js"].map(read).join('\n'));console.log(JSON.stringify(result,null,2));if(Object.values(result.t).some(v=>!v))process.exitCode=1;
