# TRAÇADO Studio 0.2
Editor urbanístico da Évora. Sirva a raiz por HTTP (`python -m http.server 8000`) ou publique como site estático na Vercel.

- Desenho em metros, vias retas e curvas, paralelas, rotatórias e zonas; comandos de comprimento e ângulo, Shift ortogonal e encaixe geométrico.
- Importe KML/GeoJSON/JSON e exporte JSON/DXF/GeoJSON. Satélite e mapa dependem de conexão com os respectivos fornecedores.
- Biblioteca de versões e salvamento no navegador. Não há autenticação, sincronização ou banco de dados remoto nesta versão.
- Área viária e quadras automáticas usam amostragem espacial; não constituem projeto executivo nem aprovação urbanística.
- A ilha da rotatória integra a faixa viária. As marcações de eixo são interrompidas visualmente nos cruzamentos.

Arquitetura: index.html (estrutura), studio.css (interface), studio.js (editor e geometria), vercel.json (publicação).

## Studio 0.3 — Parcelamento e instrumentos de precisão

- Selecione quadras no mapa ou desenhe uma área loteável (U). Escolha um modelo ou informe testada, profundidade, área mínima, fileiras, orientação e proximidade viária. Pré-visualize e aplique em uma operação reversível. A prévia conserva lotes manuais e só substitui lotes automáticos de áreas que gerarem novos lotes. São lotes retangulares verificados por interseções locais; áreas irregulares podem deixar sobras. Não comprova acesso legal.
- Arraste da régua superior/lateral para criar guias H/V; I cria guia inclinada, J cria guia paralela com afastamento do eixo/divisa, M registra cota linear, T registra ângulo. Shift restringe ortogonalmente; a trava angular é configurável. 0° leste / 90° norte. Guias e cotas permanecem no JSON do projeto e não integram o DXF. Modelos personalizados ficam no navegador.
- Arquitetura: parcel.js (parcelamento), precision.js (instrumentos CAD), studio.js (aplicação), studio.css (interface), index.html (estrutura). Dados persistem localmente; sem banco remoto.

## Studio 0.4 — Quadras automáticas

- O motor vetorial recorta o domínio pela união das faixas viárias, rotatórias, áreas especiais e quadras manuais. Detecta faces fechadas sem gleba; com gleba, pode incluir faces de borda. Segmentos retos mantêm a largura; círculos e concordâncias arredondadas são aproximados por segmentos (tolerância nominal de 2,5 cm, máximo 256 vértices por círculo). Atualiza ao concluir a edição, não durante o arraste. Limites de complexidade preservam a última geometria válida.
- Área útil, envelope retangular de menor área, orientação, perímetro externo, divisas internas, medidas individuais, nomes e CSV. Dimensões envolventes não equivalem às medidas de cada divisa irregular. Quadras derivadas são protegidas contra edição direta. IDs são conciliados por contorno ou sobreposição aproximada; lotes antigos nunca são apagados na atualização e ficam sinalizados em vermelho se não couberem nas quadras atualizadas. Todo o estudo continua em armazenamento local.

Testes determinísticos de geometria e integração com DOM simulado: `node tests/quadras.test.cjs`. Os testes não substituem validação visual em navegador e levantamento topográfico.

## Studio 0.5
Fileiras opostas avaliadas independentemente, com prévia, diagnóstico e ajuste opcional de profundidade (até 15%) e testada (até 20%), preservando a área mínima. Acesso verificado apenas por proximidade geométrica à via.

Otimizador de implantação: até 24 configurações ortogonais (mais o traçado atual no modo complementar), com orientação, largura viária, comprimento de quadra e fase da malha variáveis. Mantém gleba e restrições, classifica por coerência da rede e objetivo selecionado; área viária por amostragem. Até seis propostas distintas. Aplicação arquiva o original e é reversível. Busca heurística, sem garantia de ótimo global, acesso externo ou conformidade urbanística.

### 0.5.1
Validação do otimizador com diagnósticos por campo, números decimais com vírgula/ponto, faixas compatíveis com o editor (testada 2–200 m, profundidade 2–300 m, área mínima 4–60.000 m² e vias 1–100 m), vínculo opcional de área mínima com as dimensões e correções explícitas que preservam área mínima e largura viária mínima. Ao abrir, parâmetros iniciais incompatíveis herdados podem ser ajustados no formulário, sem alterar o estudo até aplicação. Limite de comprimento de quadra 2–2.000 m, desde que comporte a testada efetiva. Limites numéricos não substituem exigências urbanísticas.
