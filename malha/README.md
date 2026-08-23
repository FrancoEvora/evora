# MALHA

Plataforma de inteligência territorial e fundiária para originação imobiliária.

## Estado atual

- Município-laboratório: Uberlândia/MG (`3170206`)
- Versão: V8
- Front-end: `index.html`
- APIs Vercel: `api/ibge.js` e `api/osm.js`
- Produção atual: `malha-uberlandia.vercel.app`

## Arquitetura

GitHub deve ser a fonte de verdade do código. A Vercel deve servir apenas como camada de build/deploy. Até a criação de um repositório dedicado `FrancoEvora/malha`, o código está isolado nesta pasta `malha/` do repositório `FrancoEvora/evora` para garantir versionamento e histórico.

## Princípios de dados

Cada informação territorial deve ser classificada como `OFICIAL`, `OBSERVADO` ou `INFERIDO`. Inferências nunca devem ser apresentadas como limites legais ou fatos registrais.
