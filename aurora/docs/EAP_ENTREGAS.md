# EAP e pacotes de entrega — Aurora

Atualização de 20/10/2026. Disponível em **Estruturação → EAP e entregas** e **Desenvolvimento → EAP e entregas**.

## Modelos originais de referência

| Ciclo | Grupos de entregas | Pacotes de trabalho | Entregáveis de referência |
|---|---:|---:|---:|
| Estruturação | 11 | 47 | 94 |
| Desenvolvimento | 12 | 62 | 124 |

Estruturação: governança e mandato, dossiê jurídico/fundiário, urbanismo, meio ambiente, engenharia/infraestrutura, mercado, produto, negociação da área, viabilidade financeira/funding, parceria/fechamento e decisão de investimento/transição.

Desenvolvimento: governança, bases e contratação de projetos, projetos urbanísticos e de infraestrutura, edificações/instalações, compatibilização, licenciamento, aprovações/registros, suprimentos, mobilização, implantação, controle da execução e comissionamento/entrega/operação.

Cada pacote inclui código estável, grupo, objetivo e escopo, entradas/interfaces, exclusões, premissas, riscos, R/A/C/I de referência, critérios de aceite, entregáveis verificáveis, predecessoras e duração indicativa. O formulário permite acrescentar pacotes e adaptar o dicionário; datas, custos e nomes devem ser planejados para cada empreendimento. A função A é a responsabilidade de negócio pelo aceite, não uma concessão automática de permissão no sistema.

## Uso e controles

1. Selecione o empreendimento e consulte ou aplique o modelo. A aplicação é transacional e incremental por código, preservando edições existentes.
2. Reconcilie o escopo contratado e todas as interfaces; ajuste responsáveis, entregáveis, critérios, riscos, dependências, datas e estimativas. Etapas do cadastro anterior permanecem disponíveis separadamente.
3. Registre uma linha de base de escopo, com decisão e impactos. Apenas revisores podem fazê-lo. Todas as versões ficam disponíveis para consulta e exportação JSON. Datas/custos incompletos são explicitamente indicados.
4. Acompanhe entregas individuais, com critério e referência de evidência. O avanço é a proporção de entregas obrigatórias conferidas; o consolidado pondera o avanço pelo peso de cada pacote e não conta novamente os grupos.
5. Submeta o pacote para revisão quando todas as entregas obrigatórias estiverem conferidas e os responsáveis, critérios e evidência de fechamento estiverem registrados. Concluir ou aprovar exige também predecessoras concluídas/aprovadas ou formalmente não aplicáveis.
6. O aceite formal usa a permissão de revisão do ciclo e registra autor, data e justificativa. O proprietário mantém a exceção de revisar sua própria autoria; outros revisores precisam de autoria independente.
7. Alterações de escopo/evidências invalidam uma aprovação. Para reabrir uma predecessora, reabra primeiro os sucessores já concluídos. Exclusões por não aplicabilidade exigem revisor e justificativa; não contam no avanço e não geram novos alertas de atraso.
8. Compare a EAP atual com qualquer linha de base. Alterações em escopo, entregas, critérios, RACI, dependências, aplicabilidade, datas, pesos e custos aparecem na comparação; andamento e evidências diárias não geram falsa alteração de escopo.

O dicionário completo pode ser exportado em CSV. Células iniciadas por operadores de fórmula são neutralizadas. Clientes continuam restritos a relatórios publicados e especificamente autorizados; não recebem acesso às tabelas operacionais ou às linhas de base. Marcar um pacote para relatório permite somente o resumo já previsto no fluxo de relatórios.

## Planejamento e limites explícitos

- Orientação a entregas e regra dos 100%: o escopo precisa ser reconciliado por pessoas competentes. A existência do modelo não atesta que todos os requisitos específicos foram identificados.
- Durações indicativas em dias corridos; datas não são automaticamente recalculadas. Não há cálculo de caminho crítico, folgas, nivelamento de recursos ou valor agregado nesta versão.
- Predecessoras representam restrições de conclusão, sem tipos/defasagens de relações de cronograma. Ciclos e vínculos entre ativos são rejeitados no banco.
- Critérios e campos de evidência apoiam a revisão humana; não atestam autenticidade documental ou regularidade técnica/legal. A referência pode apontar para o Cofre privado, versão documental ou protocolo.
- Custos de pacotes são estimativas de escopo. O orçamento financeiro continua em seus lançamentos próprios; somá-los duplicaria valores.
- A linha de base registra uma decisão e preserva a versão; não implementa um sistema separado de solicitações de mudança com múltiplas alçadas.
- A IA recebe códigos, entregas, critérios, responsáveis, dependências e aplicabilidade sob as permissões atuais. Contextos extensos preservam JSON válido e informam quais conjuntos foram parcialmente omitidos.

## Demonstração

250 pacotes e 500 entregáveis, em quatro EAPs de estruturação e uma de desenvolvimento, com nove linhas de base preservadas após a revisão do planejamento demonstrativo. Jardins do Vale inclui uma mudança ilustrativa na estratégia de contratação para demonstrar a comparação. Custos, cronogramas, evidências e aceites são **sintéticos e explicitamente identificados**; não são documentos, aprovações de órgãos nem comprovação de execução real.

`database/011_wbs_demo_planning.sql` documenta o ajuste das datas e registra novas versões, sem substituir as linhas de base iniciais.

`database/010_wbs_demo.sql` inicializa apenas novos pacotes dos ativos demonstrativos autorizados. `database/refresh_wbs_curated_demo.sql` atualiza a cópia pública curada, com lista explícita de campos e sem identidades reais. Nenhuma consulta operacional é liberada a visitantes.

## Manutenção e verificação

- Catálogo: `shared/wbs-templates.json`; autoria reproduzível: `scripts/build-wbs-template.py`.
- Migração: `supabase/migrations/20261020221059_work_breakdown_packages.sql`.
- Tabelas: novos campos em `aurora_work_items`, `aurora_wbs_baselines` protegida por RLS e catálogo privado sem acesso direto.
- RPCs autenticadas: `aurora_apply_wbs`, `aurora_baseline_wbs`; aceite mantém `aurora_review_work`.
- Atualizações futuras de catálogo devem usar uma nova migração; nunca editar a migração já aplicada. Modelos aplicados não são sobrescritos automaticamente.
- `npm test`: catálogo, dependências, progresso ponderado, exclusões, comparação, exportação e contexto de IA, além das regressões existentes.
- `tests/wbs-rls.sql`: testes reais transacionais, com rollback, de isolamento, revisão, evidências, exclusões, dependências, idempotência e imutabilidade. `tests/enterprise-rls.sql` verifica a compatibilidade dos relatórios e perfis anteriores.

## Referências de estruturação

- [PMI — Practice Standard for Work Breakdown Structures](https://www.pmi.org/learning/library/practice-standard-work-breakdown-structures-8063): decomposição orientada a entregas, dicionário e cobertura integral do escopo.
- [ISO 21511:2018](https://www.iso.org/standard/69702.html): conceitos e diretrizes para EAPs. A versão de referência é a edição publicada de 2018; não há alegação de certificação.

O conteúdo dos pacotes foi elaborado para a Aurora e deve ser adaptado ao produto e à jurisdição; não reproduz um padrão proprietário de concorrente.
