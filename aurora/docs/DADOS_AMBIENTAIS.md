# Dados ambientais, patrimônio e aprovações

A aba **Inteligência → Ambiental e patrimônio** consulta cinco conexões provisionadas por ativo. São registros públicos reais, inclusive nos seis ativos fictícios da demonstração. O Graprohab é não aplicável aos exemplos de MG.

| Conexão | Camadas | Abrangência | Frequência inicial |
|---|---|---|---|
| IDE-Sisema | UCs estaduais/municipais, amortecimento de planos de manejo, terras indígenas/quilombolas, rios de preservação permanente | MG | Mensal |
| IBAMA/PAMGIA | Termos de embargo com geometria publicada | Brasil | Semanal |
| ICMBio/INDE | UCs federais (ago/2026) e cavidades CANIE (mai/2026) | Brasil | Mensal |
| IPHAN/SICG | Sítios arqueológicos pontuais e polígonos de bens materiais | Brasil | Mensal |
| Graprohab | Desmembramentos, loteamentos/conjuntos e condomínios: protocolos, dispensas e certificados do mapa público divulgado pela SDUH/SP | SP | Mensal |

Os endpoints são fixos em `api/_lib/environmental-sources.js`. WFS 2.0 com BBOX explícito EPSG:4326; ArcGIS GeoJSON no IBAMA; download uMap no Graprohab, com cache de uma hora por instância. O portal oficial da SDUH publica o link para o mapa uMap 1444131. Esse é um mapa público, não uma API estadual com SLA.

## Privacidade e permissões

Só o usuário com escrita em Inteligência pode consultar e administrar fontes. Tenant RLS e a função autorizada de claim verificam o acesso. O job recebe poligonal, UF e coordenadas canônicas do ativo no servidor; a poligonal não é enviada ao provedor. Geosserviços recebem apenas a envoltória do círculo de 7 km; o Graprohab é baixado integralmente e filtrado na Aurora. Dados de pessoas autuadas, CPF/CNPJ do autuado, proprietários e contatos não são persistidos.

Por proteção da localização, as novas conexões ambientais operacionais ficam provisionadas e pausadas até autorização do administrador. A demonstração é consultada automaticamente. Em Fontes públicas, ativar **Autorizar consultas externas programadas** habilita a periodicidade escolhida. A consulta manual também informa o compartilhamento do recorte. O worker exige o segredo vigente e mantém leases, limites e histórico; não utiliza service_role no navegador.

## Método e limites

- Interseção geométrica de pontos/multipontos e polígonos/multipolígonos com o círculo geodésico de 72 segmentos. Anéis internos dos polígonos são respeitados.
- Contagens por camada no raio de 1, 2, 3, 5 ou 7 km. Identificação de registros que também interceptam a poligonal do imóvel. Se o imóvel se estende além do raio, a tabela considera somente o recorte.
- Máximo de 500 registros processados por camada, com solicitação de 501 para sinalizar truncamento; 6 MB por resposta de geosserviço, 20 MB no download estadual Graprohab e 3,8 MB por snapshot compacto. Limites e falhas ficam explícitos. Camada indisponível ou geometria não processada produz contagem desconhecida, nunca zero.
- Os polígonos são recortados ao círculo de 7 km para visualização e exportação. Interseção com o imóvel usa a geometria original recebida, antes do recorte. Exportações não são limites certificados.
- CSV exporta registros com origem, consulta e cobertura. GeoJSON inclui também metadados de todas as camadas, inclusive falhas e não aplicabilidade. As camadas ocultadas no mapa continuam nos arquivos, conforme indicado na interface.
- Uma falha total preserva a leitura anterior; uma falha de camada produz snapshot explicitamente parcial, sem atribuir zero à camada faltante.
- Sem data de edição conhecida, a interface diz que a data-base depende da camada/registro. Data de consulta não é atualização do dado. Os nomes de camadas ICMBio são vinculados às edições verificadas; mudanças de nome devem passar por revisão.

Não é certidão de inexistência de restrições, análise integral de APP/reserva legal/CAR nem licença. Pontos arqueológicos não são perímetros de sítios. Bens do IPHAN não são automaticamente tombados. Algumas RPPNs são círculos aproximados na base ICMBio. Não são criados buffers legais genéricos de cavernas ou UCs. Não se somam camadas como bens únicos. A existência de um registro e sua situação jurídica devem ser confirmadas no órgão competente.

## Validação

`tests/environment.test.mjs`: interseção com vazios, distância, privacidade de propriedades e abrangência estadual sem consulta indevida. `tests/heatmap-rls.sql`: quinze conexões, tenant/módulo/cliente, escrita, job com poligonal, origem oficial e provisionador privado. `tests/polygon-defaults-rls.sql`: cadastro atômico, idempotência, mudança de município e preservação de pausa. Os testes SQL são transacionais com rollback.
