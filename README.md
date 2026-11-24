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
