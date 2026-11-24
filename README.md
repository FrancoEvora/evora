# TRAÇADO Studio 0.2
Editor urbanístico da Évora. Sirva a raiz por HTTP (`python -m http.server 8000`) ou publique como site estático na Vercel.

- Desenho em metros, vias retas e curvas, paralelas, rotatórias e zonas; comandos de comprimento e ângulo, Shift ortogonal e encaixe geométrico.
- Importe KML/GeoJSON/JSON e exporte JSON/DXF/GeoJSON. Satélite e mapa dependem de conexão com os respectivos fornecedores.
- Biblioteca de versões e salvamento no navegador. Não há autenticação, sincronização ou banco de dados remoto nesta versão.
- Área viária e quadras automáticas usam amostragem espacial; não constituem projeto executivo nem aprovação urbanística.
- A ilha da rotatória integra a faixa viária. As marcações de eixo são interrompidas visualmente nos cruzamentos.

Arquitetura: index.html (estrutura), studio.css (interface), studio.js (editor e geometria), vercel.json (publicação).
