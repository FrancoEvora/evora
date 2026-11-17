/* XLSX interchange for the viability model. All workbook processing is local. */
(function () {
'use strict';
const X = window.XLSX;
const E = window.EvoraEngine;
E.defaults.eapJson='[]';
const text = value => String(value ?? '').trim();
const fold = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const check = (condition, message) => { if (!condition) throw Error(message); };
function table(book, name) {
  const sheet = book.Sheets[name];
  check(sheet && sheet['!ref'], 'Aba ausente ou vazia: ' + name);
  const range = X.utils.decode_range(sheet['!ref']);
  check(range.e.r < 50000 && range.e.c < 300, 'Dimensões excessivas em ' + name);
  for (const [address,cell] of Object.entries(sheet)) {
    if (!address.startsWith('!') && (cell.t === 'e' || (cell.f && cell.v == null)))
      throw Error(name + '!' + address + ': recalcule e salve a planilha no Excel.');
  }
  return X.utils.sheet_to_json(sheet, {header:1, raw:true, blankrows:true, range:0});
}
function cronogramas(book) {
  const name = book.SheetNames.find(n => /^CRONOGRAMAS?\b/.test(fold(n)));
  check(name, 'Use uma planilha exportada pela plataforma ou uma aba Cronogramas com centros de custos e meses.');
  const rows = table(book, name), groups = [];
  for (let i = 0; i < rows.length; i++) {
    const header = rows[i].map(fold), col = header.indexOf('CENTROS DE CUSTOS');
    if (col < 0) continue;
    const amount = header.indexOf('VALOR TOTAL'), months = [];
    header.forEach((v,c) => { const m = /^MES\s+(\d+)$/.exec(v); if (m) months.push([+m[1],c]); });
    check(amount >= 0 && months.length && months.every(([m],k) => m === k+1 && m <= 120), 'Confira o cabeçalho de meses na linha ' + (i+1));
    let title = '';
    for (let j=i-1; j>=0; j--) {
      const candidate=text(rows[j][col]);
      if (candidate && !/VERS[AÃ]O|CRONOGRAMA|MACRO OBRA/i.test(candidate)) {title=candidate;break;}
    }
    const stages = [], warnings = [];
    let subtotal;
    for (let j=i+1;j<rows.length;j++) {
      const row=rows[j], label=text(row[col]);
      if (!label) continue;
      if (fold(label)==='TOTAL') {subtotal=row[amount];i=j;break;}
      const budget=row[amount], weights=months.map(([,c]) => row[c] ?? 0);
      check(typeof budget==='number' && budget>=0 && budget<=1e11, 'Valor total inválido na linha '+(j+1));
      const sum=weights.reduce((a,b)=>a+b,0);
      check(weights.every(w=>Number.isFinite(w)&&w>=0) && Math.abs(sum-1)<=0.005, 'Os percentuais mensais de '+label+' devem somar 100%.');
      if(Math.abs(sum-1)>0.000001) warnings.push(label+': a soma mensal de '+(sum*100).toLocaleString('pt-BR',{maximumFractionDigits:4})+'% será ajustada proporcionalmente para 100%.');
      const first=weights.findIndex(w=>w>0), last=weights.findLastIndex(w=>w>0);
      stages.push({id:E.workStageHelpers.uid(),name:label,budget,start:first+1,duration:last-first+1,curve:'custom',weights:weights.slice(first,last+1),contingency:0});
    }
    const total=stages.reduce((s,item)=>s+item.budget,0);
    check(stages.length && Number.isFinite(subtotal) && Math.abs(total-subtotal)<0.011,'O subtotal de '+(title||name)+' diverge dos centros de custos.');
    groups.push({name:title||'Obra '+(groups.length+1),stages,total,warnings});
  }
  check(groups.length,'Nenhum bloco de centros de custos encontrado.');
  const scopeKey=label=>fold(label).replace(/\s+/g,' ');
  const stagesByName=new Map();
  for(const group of groups) for(const stage of group.stages){
    const key=scopeKey(stage.name);
    if(stagesByName.has(key)) stagesByName.set(key,null);
    else stagesByName.set(key,{group,stage});
    group.eap ??= [];
    group.eap.push([stage.id,group.name,'','','',null,null,null]);
  }
  const detail=book.SheetNames.find(n=>/^ORCAMENTO SINTETICO\b/.test(fold(n)));
  if(detail){
    const detailRows=table(book,detail);
    const headerIndex=detailRows.findIndex(row=>row.map(fold).includes('BALIZAMENTO'));
    check(headerIndex>=0,'Orçamento Sintético sem coluna BALIZAMENTO.');
    const header=detailRows[headerIndex].map(fold);
    const cols=['CODIGO','DESCRICAO','BALIZAMENTO','UNIDADE','QUANT','PRECO','PRECO TOTAL'].map((key,i)=>header.findIndex(h=>i<4?h===key:i===5?/^PRECO(?:\s*\(|$)/.test(h):h.startsWith(key)));
    check(cols.every(i=>i>=0),'Confira as colunas do Orçamento Sintético.');
    for(const row of detailRows.slice(headerIndex+1)){
      const [code,label,center,unit,qty,price,total]=cols.map(i=>row[i]);
      if(!text(center))continue;
      const target=stagesByName.get(scopeKey(center));
      check(target,'Centro de custo ausente ou ambíguo no cronograma: '+center);
      check(text(code)&&text(label)&&Number.isFinite(total),'Serviço sem identificação ou total: '+text(code));
      target.group.eap.push([target.stage.id,target.group.name,text(code),text(label),text(unit),qty??null,price??null,total]);
    }
  }
  return groups;
}
function append(book,name,rows,widths) {
  const sheet=X.utils.aoa_to_sheet(rows);
  sheet['!cols']=widths.map(wch=>({wch}));
  X.utils.book_append_sheet(book,sheet,name);
  return sheet;
}
function exportStudy(params,result,columns,labels) {
  const book=X.utils.book_new(), assumptions=[['Chave','Premissa','Unidade','Valor']];
  for (const key of Object.keys(E.defaults)) {
    if(key==='workStagesJson'||key==='eapJson') continue;
    const value=params[key] ?? E.defaults[key];
    const cell=Array.isArray(value)?JSON.stringify(value):value;
    check(typeof cell!=='string'||cell.length<=32767,'O campo '+key+' excede o limite de uma célula Excel. Use o backup JSON.');
    assumptions.push([key,labels[key]?.[0]||key,labels[key]?.[1]||'',cell]);
  }
  append(book,'Premissas',assumptions,[24,45,16,38]);
  const stages=JSON.parse(params.workStagesJson||'[]');
  append(book,'Etapas',[['ID','Centro de custo','Orçamento (R$)','Início (M)','Duração (meses)','Contingência (%)','Curva','Pesos mensais (JSON)'],...stages.map(s=>[s.id,s.name,s.budget,s.start,s.duration,s.contingency,s.curve,JSON.stringify(s.weights)])],[36,48,22,14,18,20,15,45]);
  const eap=JSON.parse(params.eapJson||'[]'), stageNames=new Map(stages.map(s=>[s.id,s.name]));
  if(eap.length)append(book,'EAP',[['ID da etapa','Obra','Código','Serviço','Unidade','Quantidade','Preço unitário','Total do serviço','Centro de custo'],...eap.filter(row=>stageNames.has(row[0])).map(row=>[...row,stageNames.get(row[0])])],[36,32,16,78,12,18,18,22,44]);
  const t=result.totals;
  append(book,'Resultados',[['Indicador','Valor','Unidade'],['VGV',t.vgv,'R$'],['Orçamento-base da obra',params.work,'R$'],['Desembolso nominal de obra',t.work,'R$'],['Exposição máxima',t.peak,'R$'],['Resultado operacional nominal',t.profit,'R$'],['Payback definitivo',t.payback??'Não atingido','Mês'],['Lotes',t.qty,'un.']],[32,24,14]);
  append(book,'Fluxo mensal',[columns.map(c=>c[1]),...result.rows.map(row=>columns.map(([key])=>row[key]))],columns.map(c=>Math.max(16,c[1].length+2)));
  return book;
}
function readStudy(book) {
  const [head,...rows]=table(book,'Premissas');
  check(head[0]==='Chave' && head[3]==='Valor','Cabeçalho inválido na aba Premissas.');
  const params={}, seen=new Set();
  for(const [key,,,value] of rows) {
    if(!key) continue;
    check(Object.hasOwn(E.defaults,key)&&!seen.has(key),'Chave desconhecida ou repetida: '+key);
    seen.add(key);
    const base=E.defaults[key];
    if(typeof base==='number') check(Number.isFinite(value),'Informe um valor numérico para '+key);
    params[key]=Array.isArray(base)?JSON.parse(value):value??'';
  }
  check(Object.keys(E.defaults).every(k=>k==='workStagesJson'||k==='eapJson'||seen.has(k)),'Faltam premissas. Use a planilha completa exportada pela plataforma.');
  const stages=table(book,'Etapas').slice(1).filter(r=>r.some(v=>v!=null)).map(([id,name,budget,start,duration,contingency,curve,weights])=>{
    check(text(name)&&Number.isFinite(budget)&&budget>=0&&budget<=1e11&&Number.isInteger(start)&&start>=0&&start<=119&&Number.isInteger(duration)&&duration>=1&&duration<=120&&Number.isFinite(contingency)&&contingency>=0&&contingency<=100&&E.workStageHelpers.CURVES.includes(curve),'Etapa inválida: '+text(name));
    const parsed=JSON.parse(weights||'[]');
    if(curve==='custom') check(Array.isArray(parsed)&&parsed.length===duration&&parsed.every(n=>Number.isFinite(n)&&n>=0)&&parsed.some(n=>n>0),'Pesos inválidos: '+name);
    return {id,name,budget,start,duration,contingency,curve,weights:parsed};
  });
  check(params.workMode!=='stages'||stages.length,'Inclua pelo menos uma etapa.');
  params.workStagesJson=JSON.stringify(stages);
  const ids=new Set(stages.map(s=>s.id));
  const eap=book.Sheets.EAP?table(book,'EAP').slice(1).filter(r=>r.some(v=>v!=null)).map(row=>{
    const [id,obra,code,label,unit,qty,price,total]=row;
    check(ids.has(id)&&text(obra)&&(!text(code)||text(label)&&Number.isFinite(total)),'Linha inválida na aba EAP: '+text(code));
    return [id,text(obra),text(code),text(label),text(unit),qty??null,price??null,total??null];
  }):[];
  params.eapJson=JSON.stringify(eap);
  return params;
}
window.EvoraSheets={exportStudy,readStudy,cronogramas};
})();
