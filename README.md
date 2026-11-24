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

### 0.5.2 — proporção viária e limites da gleba
Largura local padrão do otimizador independente do editor (12–16 m, ajustável); objetivo padrão de equilíbrio, limite inicial ajustável de 35% de área viária estimada, confirmação para malha acima de 30 m. Testa malhas internas e perimetrais. As vias novas usam faixas completas dentro da gleba e reserva para extremidades; a visualização das vias propostas é recortada pelo perímetro. Acessos externos continuam a exigir desenho manual. Usa a mesma validação de contenção retangular para geração e reconciliação de lotes. Não altera automaticamente estudos existentes; gere uma nova alternativa. As premissas não constituem norma urbanística.

### 0.6 — programa urbanístico e leitura de masterplan
Programa padrão configurável: verde 10%, praças 3%, institucional 5%, lazer 2% da gleba, não parâmetros legais. As reservas são polígonos efetivos, selecionados em quadras com frente viária antes do parcelamento. O algoritmo pode reservar quadras inteiras ou dividir faces convexas; não ocupa lotes preservados nem áreas especiais. APP não é creditada como parque. Metas de espaços públicos são mínimas; alternativas incompletas não são oferecidas como válidas. Áreas existentes são creditadas por amostragem conservadora, novas áreas por geometria. Critério de qualidade urbana incorpora cobertura de lotes a até 250 m em linha reta de espaços de convivência (proxy, não rota de caminhada), eficiência viária e aproveitamento. Hierarquia opcional de vias coletoras dentro da largura máxima. Rótulos por nível de zoom; representação esquemática de passeios, arborização e lazer, não projeto paisagístico. Acessibilidade, topografia, legislação e aprovação continuam a exigir análise técnica.

### 2.0 — motor de concepção adaptativa
Partidos bairro-jardim e circuito compacto: circuito de contorno derivado do perímetro, curvas aproximadas por segmentos com verificação de folga, núcleo verde/praça anterior às vias internas, conexões entre circuitos, reservas complementares e lotes convexos adaptativos com testadas e áreas mínimas. Busca heurística; malha anterior continua selecionável e o modo complementar conserva o traçado. Propostas adaptativas podem ser recusadas em glebas estreitas, com concavidades profundas ou restrições junto ao perímetro. Sem topografia, ligação externa, projeto executivo de curvas, calçadas ou paisagismo. Prancha SVG com escala, norte, legenda e quadro urbanístico.

Acesso externo opcional por divisa indicada pelo usuário (ponto médio; exige conferência de ligação e geometria). Prancha também disponível no editor para o projeto atual. Árvores, caminhos e pavimentação da prancha são símbolos conceituais.

Verificação: oito suítes de testes determinísticos de geometria e DOM simulado; amostra irregular reconstruída aproximadamente a partir da forma apresentada, não levantamento do usuário. A planta dessa amostra foi renderizada e inspecionada em navegador local. Teste interativo completo no navegador remoto não concluído por falha do Chromium. O saldo indicado compreende usos fora dos lotes, vias e programa público; pode incluir APP e outras áreas cadastradas.

### 2.1 — bordas ativas (candidato)
Circuito recuado e parcelas convexas entre o meio-fio e as divisas da gleba, validadas por área, testada, sobreposição e acesso interno. Aplicação inicial limitada a glebas convexas. Comparação com o partido anterior disponível. Não constitui projeto executivo.
