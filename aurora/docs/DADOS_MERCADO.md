# Dados socioeconômicos e empresariais

Disponíveis em Inteligência → Dados e mercado, e no atalho Comparar dados do mapa.

## Censo 2022

Cache nacional com 468.099 códigos de setor, incluindo áreas operacionais. Os atributos são associados à malha por código completo de 15 dígitos. Fontes oficiais:

- Básico, edição 20/05/2026: `https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/Agregados_por_Setor_csv/Agregados_por_setores_basico_BR_20260520.zip`
- Rendimento, edição 08/05/2026: `https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios_Rendimento_do_Responsavel/Agregados_por_setores_renda_responsavel_BR_20260508_csv.zip`
- Dicionário de rendimento: `https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios_Rendimento_do_Responsavel/dicionario_de_dados_renda_responsavel_20260508.xlsx`

Referência estatística permanece **2022**, independentemente da publicação em 2026 ou da data da consulta. Os ZIPs oficiais possuem CSVs separados por ponto e vírgula, codificados em Latin-1. Números ausentes/suprimidos são nulos. O manifesto inclui hashes SHA-256, edições e URLs.

Campos do cache: população (v0001), domicílios totais (v0002), particulares ocupados (v0007), particulares permanentes vagos (v0009), particulares de uso ocasional (v0008), rendimento médio (V06004), responsáveis (V06001). A associação de renda encontrou 458.772 setores; a ausência de associação não é convertida em zero.

**V06004:** valor do rendimento nominal médio mensal das pessoas responsáveis **com rendimentos** por domicílios particulares permanentes ocupados. Não é renda domiciliar total, renda atual ou capacidade de compra. No mapa, seu valor é preservado no setor original: sem redistribuição para hexágonos. Na comparação, o indicador é a mediana não ponderada das médias dos setores residenciais que interceptam o raio; não é uma média da população do recorte. V06001 não é usado como denominador de uma renda agregada, pois conta responsáveis em geral e não fornece separadamente o denominador de responsáveis com rendimentos.

População, ocupados, vagos e uso ocasional no raio são estimativas por área de interseção, com distribuição uniforme dentro do setor. A cobertura de população e domicílios é por área. A cobertura de rendimento da comparação é por proporção de setores residenciais com valor válido: setores com zero ocupados não são elegíveis; ocupados ausentes permanecem elegíveis por precaução. No mapa de rendimento a cobertura territorial é identificada separadamente. Abaixo de 95%, o resultado permanece ausente. Domicílios vagos não equivalem à oferta imobiliária disponível.

A malha agora usa páginas ordenadas por cd_setor, sem duplicatas entre páginas: 1.200 por página, até seis páginas e orçamento de tempo. O limite da leitura geográfica/empresarial no histórico passou para 6 MB; outras fontes e importações manuais conservam 1 MB. Retornos incompletos continuam sinalizados. Os resumos de inicialização e histórico excluem geometrias e registros empresariais.

Para reconstruir o cache:

```sh
python scripts/prepare-socioeconomics.py basico.zip renda.zip
npm test
npm run build
```

A atualização mensal da conexão consulta novamente a geometria; novas edições dos atributos censitários exigem reconstruir e publicar o cache. Não há projeção automática do Censo para a população atual.

## CNPJ por município

Fonte original: dados abertos da Receita Federal. A consulta é realizada pela instância comunitária **Minha Receita**, sem chave, documentada em `https://docs.minhareceita.org/como-usar/`. Ela não é um serviço oficial da Receita e não oferece SLA. A data-base vem de `/updated`, preservando inclusive a precisão mensal, por exemplo `2026-10`.

Cada ativo recebe uma décima conexão, mensal. A consulta usa o código IBGE do município, páginas de 256, até quatro páginas por execução, cursor opaco fornecido pelo servidor e deduplicação por CNPJ completo. Se a base permanecer na mesma edição, uma coleta incompleta continua do cursor anterior. A próxima execução é antecipada para o próximo worker diário durante a coleta. Ao concluir, retorna à cadência configurada. Limite operacional: 10.000 estabelecimentos por leitura, identificado como parcial quando atingido. Uma edição nova reinicia a coleta.

Matriz e filiais são estabelecimentos distintos. CNAE principal classifica atividade; somente situação cadastral 2 conta como ativa. Não se presume funcionamento físico. Os registros são **municipais**, sem coordenadas ou geocodificação: nunca são apresentados como empresas no raio, nem plotados no centroide do município. Coleta parcial não tem representatividade estatística e não permite extrapolar total municipal.

Persistem somente CNPJ, nome comercial/empresarial, CNAE e descrição, situação, início da atividade, código municipal, cidade, UF, bairro e endereço cadastral. Sócios, CPFs, telefones e e-mails retornados pelo provedor são descartados. URLs de provedor são fixas, com HTTPS, sem redirects, timeout e limite de resposta.

## Acesso, comparação e exportação

Mantém a autorização corrente de Inteligência e o isolamento por organização. Clientes externos não acessam a base interna. Leituras completas são carregadas somente quando o painel é aberto. A demonstração usa imóveis fictícios e leituras públicas reais, curadas em arquivos separados.

Comparação de até quatro ativos, com o mesmo raio de 1, 2, 3, 5 ou 7 km. CSV registra métodos, escalas, referências, cobertura, completude e fontes. O CSV empresarial respeita os filtros, inclui data-base e consulta e identifica endereço sem geocodificação. Fórmulas de planilha são neutralizadas.

Verificações: `market-data.test.mjs`, `heatmap-rls.sql`, `polygon-defaults-rls.sql`.
