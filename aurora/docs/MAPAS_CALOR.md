# Mapas territoriais da Aurora

Disponíveis em **Território** e em **Inteligência → Mapas de calor**.

## Camadas

- **População:** densidade calculada a partir de `v0001 / AREA_KM2` do Censo 2022.
- **Domicílios:** `v0002 / AREA_KM2`. Inclui domicílios vagos e de uso ocasional; não significa famílias residentes ou demanda de compra.
- **Atividade e serviços:** contagem de elementos geolocalizados do OpenStreetMap por hexágono, ou pontos cadastrados pela equipe. A base colaborativa pode ter lacunas e duplicidades entre nós e áreas; não é um censo de empresas nem mede passantes.

O perímetro do imóvel é independente do círculo de estudo, de 1, 2, 3, 5 ou 7 km. Camadas sem fonte não recebem dados inventados. Trânsito e fluxo de passantes continuam identificados como não conectados.

As consultas públicas coletam uma envoltória que contém o círculo de 7 km; cada raio é recortado localmente. Leituras antigas de 3 km precisam ser atualizadas para os novos raios. Elas não são reutilizadas como cobertura completa de 5 ou 7 km. Limites de registros ou de tamanho continuam identificados como recorte parcial.

## Fontes e consultas

1. Estatísticas nacionais originais do IBGE, básico publicado em 20/05/2026, referência 2022. Cache contém 468.099 registros (incluindo áreas estaduais operacionais), em 27 arquivos por UF, com ocupados, vagos, uso ocasional e rendimento do responsável. Código completo de 15 posições, sem associação aproximada por nome. Valores suprimidos/ausentes permanecem `null`.
2. Malha definitiva `CGMAT:qg_2022_600_setcensitario__v02`, obtida do WFS oficial do IBGE, em WGS84, por envoltória de aproximadamente ±7 km. A geometria é simplificada apenas para exibição; os valores e a área do setor são os originais.
3. Pontos públicos: Overpass API na instância pública VK Maps, documentada pela comunidade OpenStreetMap como utilizável por aplicações de qualquer projeto. Sem credencial. Erros e timeouts preservam a última leitura válida. Não há garantia de disponibilidade da instância pública; para escala, provisionar serviço dedicado.

Cada novo ativo recebe **dez conexões**: as sete anteriores, mais IBGE setorial (mensal), OpenStreetMap (semanal) e CNPJ municipal (mensal). Proprietários/administradores/gestores com acesso à Inteligência podem alterar a frequência e pausar nas Fontes públicas. Analistas autorizados podem atualizar. Perfis de consulta leem; clientes recebem apenas relatórios autorizados e não acessam a base interna.

O agendamento diário da Vercel processa as conexões vencidas com o mecanismo existente de autorização, segredo de worker, limite diário e leases. Referência 2022 não muda quando a geometria é consultada novamente. Revisões dos atributos exigem reconstruir o cache a partir do CSV oficial e publicar a nova versão:

```sh
python scripts/prepare-socioeconomics.py /path/to/basico.zip /path/to/renda.zip
npm test
npm run build
```

O manifesto registra URL, referência, edição e SHA-256 do arquivo. Nenhum dado censitário é projetado automaticamente para o ano corrente.

## Representações e metodologia

- **Setores:** densidade uniforme dentro do setor original, exibida no círculo. Ao clicar, os totais são identificados como do setor inteiro. Não são a população dentro do recorte.
- **Hexágonos H3 8 e 9:** repartição proporcional à área de interseção. `quantidade estimada = soma(densidade do setor × área de interseção)`. A densidade final divide a quantidade pela área da célula recortada. Supõe distribuição uniforme dentro de cada setor e é identificada como estimativa espacial.
- Células com menos de 95% de área coberta por setores com valor válido ficam sem valor. Cobertura e falhas de geometria são visíveis.
- Pontos cadastrados são associados uma vez ao seu H3, respeitando categoria e raio. O zero conta elementos retornados pela base, não ausência de atividade real.
- Faixas fixas permitem comparar ativos. Quintis usam apenas o recorte atual e são rotulados como escala local.

Não há estimativas apresentadas como observações por quarteirão, renda inferida de densidade, contagem de veículos inferida de velocidade, ou pontuação de investimento sem um modelo validado.

## Governança e desempenho

- As fontes mantêm a RLS do ciclo de Inteligência. As views leves são `security_invoker=true`.
- Geometrias completas são carregadas apenas ao selecionar a camada. Histórico e inicialização usam resumos sem `spatial`.
- Demonstração: seis imóveis sintéticos, malhas e estatísticas públicas reais. Arquivos públicos de geometria contêm somente as leituras selecionadas para a demonstração. Nenhuma identidade real é publicada.
- URLs de aquisição são fixas, com lista de hosts, HTTPS, sem redirects, timeout, limite de resposta e limites de registros. Nenhuma URL arbitrária é aceita do navegador.
- Exportações GeoJSON/CSV incluem indicador, unidade, referência, origem, cobertura e metodologia. CSV neutraliza fórmulas.
- Frontend carrega a biblioteca H3 e operações geométricas sob demanda.

## Verificação

`tests/heatmaps.test.mjs`: conservação da repartição espacial, recorte, valores originais, ausência vs. zero, raio/categoria de pontos, limites, associação por código e consultas incompletas.

`tests/heatmap-rls.sql`: isolamento por organização e módulo, clientes sem acesso à base, leitura completa autorizada, resumos leves, consulta sem permissão de atualização e proteção contra falsa importação oficial. Transação integralmente revertida.

Rendimento, ocupados, paginação e comparação: ver [DADOS_MERCADO.md](DADOS_MERCADO.md).
