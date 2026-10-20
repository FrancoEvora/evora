export function packageProgress(item) {
 const required=(item.deliverables||[]).filter(d=>d.required);
 return item.scope_status==='excluded'||!required.length?0:Math.round(100*required.filter(d=>d.checked).length/required.length);
}
export function wbsMetrics(items) {
 const included=items.filter(x=>x.scope_status!=='excluded');
 const weight=included.reduce((n,x)=>n+Number(x.weight||1),0);
 return {included:included.length,excluded:items.length-included.length,progress:weight?Math.round(included.reduce((n,x)=>n+packageProgress(x)*Number(x.weight||1),0)/weight):0,
 approved:included.filter(x=>x.status==='approved').length,deliverables:included.reduce((n,x)=>n+(x.deliverables||[]).filter(d=>d.required).length,0),
 delivered:included.reduce((n,x)=>n+(x.deliverables||[]).filter(d=>d.required&&d.checked).length,0),
 unplanned:included.filter(x=>!x.start_on||!x.due_on).length,unpriced:included.filter(x=>x.planned_cost==null).length};
}
export function scopeDefinition(x) {
 const keys=['id','wbs_code','wbs_group','title','description','details','owner_label','accountable_label','acceptance_criteria','start_on','due_on','duration_days','planned_cost','weight','scope_status','scope_note','predecessor_ids','dependency_id'];
 return {...Object.fromEntries(keys.map(k=>[k,x[k]??null])),deliverables:(x.deliverables||[]).map(({checked,evidence,...d})=>d)};
}
function canonical(x) {return Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):x;}
export function baselineChanges(items,baseline) {
 const before=new Map((baseline?.snapshot?.packages||[]).map(x=>[x.id,x]));
 const changed=items.filter(x=>JSON.stringify(canonical(scopeDefinition(x)))!==JSON.stringify(canonical(before.get(x.id)))).map(x=>x.id);
 const ids=new Set(items.map(x=>x.id));
 return {changed,removed:[...before.keys()].filter(id=>!ids.has(id))};
}
export function dictionaryCsv(items,allItems=items) {
 const headers=['Código EAP','Grupo','Pacote','Escopo','Entradas e interfaces','Exclusões','Premissas','Riscos','R · execução','A · aceite','C · consultados','I · informados','Critérios de aceite','Entregáveis e critérios','Predecessoras','Início','Prazo','Duração de referência (dias corridos)','Custo planejado (R$)','Peso','Aplicabilidade','Justificativa','Situação','Avanço por entregas (%)'];
 const quote=v=>{let t=String(v??'');if(/^[=+@\-\t\r]/.test(t))t="'"+t;return '"'+t.replaceAll('"','""')+'"'};
 const rows=items.map(x=>[x.wbs_code,x.wbs_group,x.title,x.description,x.details?.['Entradas e interfaces'],x.details?.['Exclusões do pacote'],x.details?.Premissas,x.details?.['Riscos e respostas'],x.owner_label,x.accountable_label,x.details?.['Consultados (C)'],x.details?.['Informados (I)'],x.acceptance_criteria,(x.deliverables||[]).map(d=>`${d.title} | ${d.criterion} | ${d.required?'obrigatório':'complementar'} | ${d.checked?'entregue':'pendente'} | ${d.evidence}`).join('\n'),[...(x.predecessor_ids||[]),...(x.dependency_id?[x.dependency_id]:[])].map(id=>{const p=allItems.find(y=>y.id===id);return p?.wbs_code||p?.title||id}).join(', '),x.start_on,x.due_on,x.duration_days,x.planned_cost,x.weight,x.scope_status==='excluded'?'Não aplicável':'Incluído',x.scope_note,x.status,packageProgress(x)]);
 return '\uFEFF'+[headers,...rows].map(r=>r.map(quote).join(';')).join('\r\n');
}
