# Aurora 2 — produto, dados e governança

A Aurora reúne inteligência territorial, estruturação imobiliária, desenvolvimento e gestão patrimonial. Esta entrega é uma base operacional integrada, com dados persistidos e permissões aplicadas no servidor. Não representa certificação de conformidade, auditoria independente ou equivalência integral aos produtos usados como referência.

## Ciclos de entrega

1. **947ebe9 — módulos e demonstração.** Publicação na Vercel `dpl_4risocvGT2E9q572Hw7dXFsRDNqA`. Revisão do painel, navegação e estruturação no navegador. 6 ativos sintéticos, 77 etapas, 6 estudos, 6 licenças, 72 linhas financeiras, 36 pontos e 2 relatórios de exemplo. Dados sem identidades públicas.
2. **84a7806 — acesso e operação.** Publicação `dpl_o64mgELHUA7shDDYKZSLyLf8rAPi`. Revisão do portal e dashboard individual no navegador. Clientes passam a receber somente publicações explicitamente autorizadas. MFA TOTP opcional com exigência de AAL2 no banco depois de ativado; matriz por ciclo; monitoramento de etapas e licenças; evidências e dependências verificadas.
3. **Fontes públicas, identidade visual e integração.** Logomarca original fornecida pelo cliente; azul-marinho, ciano e turquesa, conforme o arquivo mais recente enviado. Central de Fontes, referências públicas no território e contexto da IA. Correção de INSERT RETURNING no cadastro de ativos identificada em teste real. Ajustes em impressão, datas com ano e seleção de localização sem estudo.

## Verificação executada

- Build TypeScript/Vite e 11 testes automatizados de cálculo, CSV, proteção da API, IA, fontes e controle de destinos externos.
- Testes SQL em transações revertidas: isolamento entre organizações, Storage privado, bloqueio de escalada de privilégios, MFA, revisão de etapas, fontes não falsificáveis, snapshots, rascunhos e revogação.
- Contas temporárias reais de QA: login, organização, ativo, evidência/revisão, licença, condicionante, orçamento, relatório e publicação; cliente sem acesso inicial, autorização específica e revogação.
- Chamada real à IA publicada: contexto de etapas e licenças, resultado persistido, modelo retornado `openai/gpt-4.1-mini`.
- MFA TOTP real: ativação e acesso AAL2, nova sessão AAL1 bloqueada e remoção do fator de teste concluídos.
- API de fontes publicada: municípios oficiais, atualização manual com população de referência, execução programada e identificação de importação humana verificadas.
- Rotina publicada de monitoramento: HTTP 200 e alertas efetivos de licença e condicionante.
- 26 conexões de demonstração com aquisição real concluída: 24 consultas IBGE e 2 séries BCB. O limite documentado pelo serviço BCB de 20 observações por consulta foi detectado e incorporado.
- ANM: consulta real de contagem por envoltória concluída; resultado tratado somente como triagem espacial.
- Encerramento do QA: ativos e etapas temporários removidos; contas de teste bloqueadas, participações inativas e publicação de teste arquivada. Registros residuais de auditoria preservados, sem acesso ativo.
- Advisor de segurança: objetos Aurora sem alertas WARN/ERROR; três tabelas privadas com RLS e sem políticas são deliberadamente inacessíveis a usuários, atendidas somente por funções controladas.

## Fontes públicas

**Sincronização:** IBGE Localidades, Censo (4714), estimativa populacional (6579), economia municipal (5938), SINAPI estadual (2296), SIDRA personalizado; BCB SGS 432 e 433. ANM SIGMINE possui adaptador de triagem por envoltória, sujeito à disponibilidade do geosserviço; não foi usado para certificar imóveis.

**Importação assistida com origem e histórico:** IBAMA, ICMBio, INCRA, SINISA, INDE, urbanismo municipal, RAIS/Novo Caged, INEP, CNES e MapBiomas. Estas conexões não realizam sincronização automática de arquivos ou portais. Importe indicadores agregados em CSV, com unidade, período e recorte; os arquivos são rotulados como dados conferidos pela equipe, nunca como consulta automática verificada.

Atualização manual, diária, semanal ou mensal. O agendador executa às 06h10 de Brasília, até 24 conexões por execução, e os excedentes aguardam a próxima. Limite de 100 conexões/organização. Atualização manual: intervalo mínimo de um minuto por conexão, limite diário de 200 leituras por organização. Dados e histórico ficam no tenant; o cliente acessa apenas seu relatório publicado. Falhas preservam a última leitura válida e ficam no histórico. Alterar a frequência ou reativar uma conexão a torna elegível na próxima execução.

As fontes públicas e os dados sintéticos são distinguidos. Indicadores municipais não são projetados para um raio; PIB não é renda domiciliar; SINAPI não é orçamento de obra; Selic anual não é IPCA mensal. A data de coleta é diferente do período de referência. Dados ausentes mantêm o código da fonte e não viram zero. Respostas externas têm tamanho, tempo e destinos limitados, sem URLs arbitrárias ou redirecionamentos.

O modo público de demonstração usa uma fotografia curada: nunca retorna diretamente registros editáveis do workspace, dados de usuários ou documentos. Suas leituras públicas são exemplos datados; para acompanhar novas consultas, entre no workspace autenticado.

## Referências pesquisadas

- [Geofusion Intelligence](https://geofusion.com.br/geofusion-intelligence/): exploração territorial e comparação de localizações. Não existe integração ou licença de dados proprietários Geofusion nesta entrega.
- [Esri Business Analyst](https://www.esri.com/en-us/arcgis/products/arcgis-business-analyst/overview): recortes territoriais, indicadores e comparação.
- [IBGE APIs](https://servicodados.ibge.gov.br/api/docs/agregados?versao=3) e [Localidades](https://servicodados.ibge.gov.br/api/docs/localidades).
- [Banco Central — Selic](https://dadosabertos.bcb.gov.br/dataset/432-taxa-de-juros---meta-selic-definida-pelo-copom).
- [IBAMA — embargos](https://dadosabertos.ibama.gov.br/dataset/termos-de-embargo), [ICMBio](https://www.gov.br/icmbio/pt-br/dados-icmbio/dados_geoespaciais), [INCRA](https://acervofundiario.incra.gov.br/geodownload/geodados.php) e [ANM](https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/FeatureServer).
- [SINISA](https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/saneamento/sinisa/resultados-sinisa), [PDET](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/estatisticas-trabalho/microdados-rais-e-caged), [INEP](https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-escolar), [CNES](https://datasus.saude.gov.br/cnes-estabelecimentos), [MapBiomas](https://brasil.mapbiomas.org/downloads/).
- [Lei 6.766](https://www.planalto.gov.br/ccivil_03/leis/l6766.htm), [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) e [Lei 15.190 — texto atualizado](https://www2.camara.leg.br/legin/fed/lei/2025/lei-15190-8-agosto-2025-797833-normaatualizada-pl.html): organização dos controles e rastreabilidade. Prazos e exigências precisam ser validados no caso concreto e na jurisdição competente.
- [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/), [OWASP ASVS](https://owasp.org/projects/asvs), [NIST identidade digital](https://pages.nist.gov/800-63-4/sp800-63b.html): referências de acessibilidade e controle de acesso, sem declaração de certificação.

## Limites do produto

- Aprovação interna registra decisão, autor, justificativa e evidência; não é assinatura eletrônica qualificada.
- Cenários financeiros simplificados, sem motor completo de financiamento, TIR/VPL ou waterfall contratual.
- Mapas de entorno por distância geométrica, sem isócronas, cálculo automático de demanda ou cadastro licenciado de pontos comerciais.
- Bases ambientais/fundiárias exigem interpretação e cruzamento técnico; ausência de registro não comprova regularidade.
- MFA usa aplicativo autenticador; não há códigos de recuperação próprios, SAML/SCIM ou política de MFA obrigatório para toda a organização.
- Botões de exportação podem ser controlados; conteúdo já visualizado pode ser copiado pelo destinatário. Revogação vale para novas consultas.
- E-mail/WhatsApp operacionais, assinatura digital, ERP/BIM e bases comerciais não estão conectados. O envio de convites é manual.
- Os testes realizados não substituem teste de carga, pentest independente, política de retenção, plano de recuperação e homologação do cliente antes de uso crítico em larga escala.

## Correção de acesso aos exemplos

O primeiro acesso selecionava a organização vazia, apesar de a mesma conta possuir o ambiente de exemplos. A seleção agora prioriza uma operação com ativos, ou a demonstração preenchida quando a operação está vazia. Escolhas explícitas são lembradas por conta; links com `workspace` são validados contra as organizações autorizadas. Há atalhos permanentes para exemplos e para a operação. O catálogo de 18 fontes aparece por padrão quando não existem conexões.

Consulta autenticada ao banco confirmou 6 ativos e 26 conexões visíveis para o proprietário no ambiente de demonstração. Os dados permanecem identificados por ambiente. Quatro testes de regressão cobrem abertura, preferência, prioridade da operação e rejeição de organizações não autorizadas; a suíte totaliza 15 testes.


## Poligonais e fontes automáticas — 20/10/2026

- Ativos exigem Polygon/MultiPolygon em WGS84. Desenho no mapa com desfazer/concluir ou importação KML, KMZ e GeoJSON. PostGIS valida topologia, coordenadas e limite de 10.000 vértices; pontos, linhas, contornos abertos e autointerseções são rejeitados.
- Área geodésica calculada (`polygon_area_ha`) separada da área declarada; ponto de referência interno obtido por `ST_PointOnSurface`. A geometria não certifica domínio nem limites fundiários.
- Município selecionado no catálogo oficial IBGE. Código e UF são conferidos no banco; os dados municipais/estaduais mantêm sua abrangência e não são atribuídos ao perímetro.
- A criação do ativo e de sete conexões ocorre na mesma transação por trigger privado: Censo, estimativa populacional, PIB, SINAPI, Selic, IPCA e ANM. BCB diário; IBGE e ANM semanais. A tela inicia a primeira consulta após salvar; o cron retoma pendências sem depender do navegador. Permissões e limites existentes continuam aplicados.
- Índice único impede duplicações das sete fontes padrão. Alterações de recorte invalidam a leitura corrente das conexões automáticas e cancelam leases antigos; histórico preservado. Pausas e frequência escolhidas pelo usuário são mantidas.
- ANM continua sendo uma triagem de processos na envoltória de ±5 km do ponto de referência, explicitamente identificada no indicador; não é laudo de interseção com o perímetro. IBGE customizado e bases de importação assistida exigem configuração específica.
- Seis exemplos possuem perímetros sintéticos identificados nas notas. Todas as 42 conexões têm leitura pública real disponível. A fotografia pública de demonstração foi atualizada apenas com os ativos já aprovados para publicação, sem identidades, leases ou credenciais.
- Migração criada pelo CLI em `supabase/migrations/20261020214130_asset_polygons_default_sources.sql`, aplicada após as migrações 001–009 de `database/`. Não executar as migrações antigas novamente.
- Verificação: 18 testes Node e build; `tests/polygon-defaults-rls.sql` executado com rollback confirma perímetro obrigatório, topologia, área, sete conexões atômicas, idempotência, mudança do município, preservação da pausa e isolamento entre organizações. Advisor: nenhum WARN/ERROR em objetos Aurora; INFO das três tabelas privadas sem políticas é intencional. Configurações globais de Auth e objetos de outros produtos não alterados.
