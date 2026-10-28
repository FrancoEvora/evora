/* Évora Viabilidade · parecer interno de investimento v1.
 * Reuses the exact financial-health score displayed in the executive dashboard.
 * This is deterministic triage, never an approval of a fund investment. */
(function(root){
'use strict';
const E=root.EvoraEngine;
if(!E||E.investmentAssessment)return;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const safe=value=>finite(value)?value:0;
const round=value=>Math.round(value*10)/10;

const remedies={
 profit:'Revisar preço versus demanda validada, custo de implantação, despesas e estrutura econômica do terreno. Recalcular VPL em cenários comparáveis.',
 coverage:'Rever entrada, ritmo de recebimentos e etapas da obra; comparar o caixa gerado antes da entrega com o orçamento nominal.',
 liquidity:'Reduzir o pico de descasamento entre recebimentos e desembolsos; testar reprogramação de obra e novas fontes de capital.',
 sales:'Validar absorção comercial e preço com evidências de mercado; atualizar curva de vendas e cenários adversos.',
 debt:'Conferir amortização, custos e vencimento do crédito; alinhar serviço da dívida à entrada efetiva de caixa.',
 funding:'Identificar e formalizar fonte para o déficit residual; não tratar aportes adicionais modelados como capital comprometido.'
};

function assess(project,result,report){
 if(typeof E.healthScore!=='function')throw new Error('O motor de score não foi carregado.');
 const t=result.totals,p=result.p,health=E.healthScore(project,result);
 const score=health.score;
 const tma=safe(p.tma),vgv=safe(t.vgv),vpl=safe(t.vpl),extra=safe(t.extra);
 const coverage=finite(t.coverage)?t.coverage:null;
 const count=Array.isArray(report?.scenarios)?report.scenarios:[];
 const stress=count.find(s=>s.id==='stress'||String(s.name||'').toLowerCase().includes('estresse'));
 const stressVpl=stress&&finite(stress.vpl)?stress.vpl:null;
 const stressKnown=stressVpl!==null;
 const soldAtDelivery=safe(t.soldAtCompletion);
 const totalLots=safe(t.qty);
 const hasSales=report?.sales?.available===true,hasWork=report?.work?.available===true;
 const fulfilled=report?.deliverables?.done||0;
 const deliverableCount=report?.deliverables?.total||0;
 const overdue=report?.deliverables?.overdue||0;
 const alerts=[];
 const blocks=[];
 if(vpl< -0.01)blocks.push({code:'negative_vpl',text:'VPL operacional negativo à TMA definida para o estudo.'});
 if(extra>1)blocks.push({code:'uncovered_funding',text:'A estrutura de capital ainda exige aportes adicionais não contratados no modelo.'});
 if(score<65)blocks.push({code:'low_score',text:'Score abaixo de 65/100, patamar mínimo de triagem interno.'});
 if(coverage!==null&&coverage<70)alerts.push('Caixa gerado até a entrega cobre '+round(coverage)+'% do orçamento da obra; abaixo do critério interno de 70% para classificação favorável.');
 if(!stressKnown)alerts.push('O cenário de estresse não está disponível para comparação.');
 else if(stressVpl<0)alerts.push('O VPL do cenário de estresse é negativo; avaliar perdas, estrutura de capital e capacidade de suportar o pior cenário simulado.');
 if(overdue)alerts.push(overdue+' entregável(is) registra(m) atraso no mês de corte.');
 if(!hasSales||!hasWork)alerts.push('Vendas e/ou avanço físico realizados não estão suficientemente informados para validação operacional.');
 if(!deliverableCount)alerts.push('Não há entregáveis cadastrados para demonstrar condições de aceite da implantação.');
 let category,label,summary,canCommit=false;
 if(blocks.length){
  category='do_not_invest';
  label='NÃO INVESTIR NAS CONDIÇÕES ATUAIS';
  summary='O modelo não atende aos critérios mínimos de retorno, financiamento ou score. Reestruturar e recalcular antes de apresentar uma proposta de aporte.';
 }else if(score>=80&&coverage!==null&&coverage>=70&&stressKnown&&stressVpl>=0){
  category='conditionally_favorable';
  label='INVESTIR SOMENTE APÓS DILIGÊNCIA';
  summary='O estudo é preliminarmente favorável ao prosseguimento da análise. A liberação de recursos depende de diligência independente, mandato do fundo e aprovação formal do comitê.';
 }else{
  category='pending_restructuring';
  label='NÃO INVESTIR AINDA · VALIDAR CONDIÇÕES';
  summary='Há potencial econômico calculado, mas a resiliência, a cobertura ou o score ainda não sustentam uma recomendação favorável, mesmo condicionada.';
 }
 const focused=health.weakest.map(x=>({title:x.label,text:remedies[x.id]||'Reavaliar a premissa e documentar o risco.',dimension:x.id})).slice(0,2);
 if(extra>1&&!focused.some(x=>x.dimension==='funding'))focused.unshift({dimension:'funding',title:'Funding descoberto',text:remedies.funding});
 if(vpl<0&&!focused.some(x=>x.dimension==='profit'))focused.unshift({dimension:'profit',title:'Rentabilidade',text:remedies.profit});
 const actions=focused.slice(0,3);
 const diligence=[
  {name:'Viabilidade e parâmetros comerciais',status:'Não verificado externamente',detail:'Validar preço, velocidade, comercialização, inadimplência e rentabilidade em diligência independente.'},
  {name:'Fonte e disponibilidade do funding',status:'Não verificado documentalmente',detail:'Comprovar capital próprio, crédito, condições, garantias e cronograma de liberações.'},
  {name:'Titularidade, licenciamento e conformidade',status:'Não verificado neste modelo',detail:'Confirmar domínio da área, aprovação urbanística, licenças ambientais e condicionantes.'},
  {name:'Implantação e contratos',status:'Não verificado documentalmente',detail:'Verificar orçamento contratado, cronograma, pacotes da obra, medições e aceites.'},
  {name:'Mandato do fundo e aprovação do comitê',status:'Pendente de análise própria',detail:'Comparar TMA, liquidez, duration, limites de exposição e governança ao regulamento e ao mandato aplicável.'}
 ];
 const required=blocks.map(x=>x.text);
 const scoreDimensions=health.dimensions.map(x=>({
  id:x.id,label:x.label,metric:x.metric,score:round(x.score),max:x.max,explanation:x.explain
 }));
 return {
  version:'1.0',score,classification:health.classification,tone:health.tone,
  scoreDimensions,scoreMethod:'Indicador determinístico interno de 0 a 100: rentabilidade 25; cobertura da obra 20; liquidez e exposição 20; absorção comercial 15; dívida na entrega 10; funding não coberto 10. VPL negativo limita o score a 49; funding adicional limita a 69. Não é rating de crédito nem estimativa de probabilidade de perda.',
  thresholdPolicy:'Triagem interna: abaixo de 65 pontos = não investir na configuração atual; de 65 a 79 = não investir ainda; 80 ou mais, com VPL não negativo, funding integralmente parametrizado, cobertura na entrega de pelo menos 70% e VPL de estresse não negativo = análise favorável condicionada. Os limiares são hipóteses gerenciais, não benchmarks de mercado.',
  guards:health.guards,category,label,summary,canCommit,critical:blocks,required,alerts,actions,diligence,
  supporting:{vgv,vpl,vplToVgvPct:vgv?vpl/vgv*100:null,tma,coveragePct:coverage,extraFunding:extra,projectedSalesAtDeliveryPct:totalLots?soldAtDelivery/totalLots*100:null,stressVpl,realizedSalesAvailable:hasSales,realizedWorkAvailable:hasWork,registeredDeliverables:deliverableCount,completedDeliverables:fulfilled},
  disclaimer:'Parecer automatizado de triagem construído sobre hipóteses fornecidas pelo usuário. Não é recomendação personalizada, aprovação de investimento, diligência concluída, avaliação independente ou compromisso de subscrição. Mesmo a classificação favorável não autoriza desembolso.'
 };
}
E.investmentAssessment=assess;
})(typeof window!=='undefined'?window:globalThis);
