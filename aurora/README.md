# Aurora 2 — plataforma imobiliária

Produção: https://aurora-territorial.vercel.app/

Demonstração sem login: https://aurora-territorial.vercel.app/?demo=1

Novas EAPs: **47 pacotes de estruturação e 62 de desenvolvimento**, com entregáveis, dicionário, critérios de aceite, dependências e linhas de base. Consulte [funcionamento, controles e limites](docs/EAP_ENTREGAS.md).

Mapas de calor em **Território** e **Inteligência**: população/domicílios por setor, grade H3, cobertura, origem e exportações. Nove conexões automáticas por ativo. Consulte [metodologia e fontes](docs/MAPAS_CALOR.md).

Veja [escopo, três ciclos de entrega, referências, dados e limitações](docs/RELEASE_V2.md).

Acesso por e-mail individual; não existe senha padrão compartilhada. Clientes consultam somente relatórios publicados com autorização explícita. Dados internos são isolados por organização, perfil e ciclo.

## Documentação inicial e operação

# AURORA

Plataforma de inteligência, estruturação, desenvolvimento e gestão de ativos imobiliários urbanos e rurais.

## Aplicação

- **Produção:** https://aurora-territorial.vercel.app
- **Código:** repositório `FrancoEvora/evora`, branch `aurora-platform`, diretório `aurora/`.
- React + TypeScript + Vite; funções Node.js na Vercel; Supabase Auth, Postgres e Storage; Vercel AI Gateway.
- Versão funcional: Aurora 2, 20/10/2026.

## Funcionalidades

- Login, cadastro, recuperação de senha e sessão individual via Supabase Auth.
- Organizações independentes; criação de espaço por usuário com e-mail confirmado.
- Perfis: proprietário, administrador, gestor, analista, consulta e cliente.
- Convites vinculados a e-mail, expiração em 7 dias e revogação. Geração de link para compartilhamento manual; nenhum e-mail é enviado pelo recurso de convite.
- Clientes veem apenas relatórios publicados e explicitamente autorizados. Todas as operações são protegidas no banco por RLS; o menu não é uma barreira de segurança.
- Ativos urbanos/rurais com etapa, localização, área, estimativa de valor e poligonal KML/KMZ/GeoJSON.
- Mapa OpenStreetMap e camada de imagem Esri, com atribuição.
- Cofre documental privado com arquivos até 20 MB, validade, extração de texto de PDF/DOCX/TXT e acesso por ativo.
- Ações, responsáveis, prioridades, prazos e registro de cumprimento.
- Diário de campo com autoria, data e geolocalização opcional.
- Análise de IA por ativo, contexto consultado no servidor sob as permissões do usuário, histórico e exportação.
- Rotinas de IA diárias/semanais, execução pelo cron da Vercel, lease e validação das permissões atuais do criador.
- Monitoramento de ações (7 dias) e documentos (30 dias), incluindo vencidos; alertas persistentes.
- Auditoria em banco, exportação dos dados autorizados, interface responsiva em português.

## Rodar e validar

```sh
npm ci
cp .env.example .env.local
# Configure apenas os valores deste projeto. Nunca versione segredos.
npm run build
npm test
npm run dev
```

Para usar variáveis da Vercel, vincule primeiro ao projeto e execute `vercel env pull .env.local`. Variáveis Secret de produção não são retornadas por esse comando. Desenvolvimento local exige uma chave de Gateway própria; em produção a autenticação é OIDC.

`tests/rls.sql` exercita o banco real em transação com ROLLBACK e usuários sintéticos: isolamento entre organizações e arquivos, cliente com/sem compartilhamento, leitura sem edição, revogação, escalada de privilégio e proteção do worker. Nunca remova o ROLLBACK.

## Infraestrutura e segredos

- O projeto Supabase existente `evora-gestao` hospeda **tabelas novas e isoladas `aurora_*`**, schema privado `aurora_private` e bucket privado `aurora-vault`. A configuração global do Auth e as tabelas de negócio existentes não foram alteradas.
- A identidade é compartilhada com a base de usuários Évora; a participação e as permissões Aurora são próprias. Uma conta de outro aplicativo não recebe acesso a dados Aurora sem criar seu espaço ou aceitar convite.
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`: configuração pública do cliente. A chave publishable não concede acesso sem RLS.
- `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`: acesso servidor sob a identidade do usuário. **Nenhuma service-role key é usada.**
- `CRON_SECRET`: segredo de 48 bytes, exclusivo desta implantação; SHA256 correspondente em `aurora_private.worker_config`. O segredo autoriza apenas funções restritas do worker Aurora. Jamais o exponha no cliente ou em logs.
- `AI_GATEWAY_MODEL`: ID validado no catálogo do Gateway; configurado na Vercel. O token OIDC é lido a cada chamada por `@vercel/oidc`, do contexto da função em produção e de `VERCEL_OIDC_TOKEN` no desenvolvimento. Nunca é armazenado ou devolvido ao navegador.
- Cadência do cron: `0 9 * * *` UTC, a partir de 06h de Brasília. Até 3 análises por chamada, lease de 10 minutos. A janela pode variar conforme o plano Vercel.
- Limite manual: 30 análises por usuário/dia e 200 por organização/dia. Reserva é contada mesmo quando o provedor falha, prevenindo abusos de tentativas.

## Publicação

O diretório raiz do projeto Vercel é `aurora`. Build `npm run build`, saída `dist`, Node 24. O código pode ser publicado da branch `aurora-platform` via integração Git. Preserve a branch principal e os demais diretórios do repositório.

Revise as URLs de redirecionamento do Supabase Auth ao adicionar domínio: URL de produção e `/?recovery=1`. A confirmação/recuperação depende do provedor de e-mail e da configuração global existente. Não altere a URL principal de outros aplicativos que compartilham Auth.

## Limites explícitos

- Quatro módulos operacionais compartilham o mesmo dossiê; não são motores completos de avaliação financeira, orçamento de obra, CRM ou ERP. Valores são informados pelo usuário, não estimados automaticamente.
- A IA não pesquisa fontes externas nem atesta regularidade jurídica, ambiental ou viabilidade. Usa até 8 documentos recentes (10 mil caracteres por documento), 60 ações, 10 registros, 100 etapas, 30 licenças, 120 linhas financeiras, 10 estudos e 12 conexões públicas por solicitação. Textos escaneados sem camada textual precisam de OCR externo.
- E-mail, WhatsApp e Google Drive ainda não estão conectados. Não há envios externos automáticos.
- IA depende de acesso, créditos e limites do Vercel AI Gateway. A aplicação exibe erros reais, sem respostas simuladas.
- Dados anteriores permanecem no navegador original em `/legacy/`. Não há migração automática do cofre local criptografado para o banco. A versão anterior é preservada como ferramenta de acesso/exportação; seus antigos endpoints de IA foram substituídos.
- O painel carrega até 1.000 registros por tipo e 100 eventos de auditoria; pagine o produto antes de carteiras maiores. Cadastros sem informação aparecem como não informados.
- O Supabase Auth mantém a configuração global existente. MFA TOTP está disponível nas configurações da conta. SSO corporativo, SMTP dedicado e política de retenção devem ser planejados conforme a operação.

## Estrutura

`src/`: experiência de usuário e acesso por sessão; `api/`: rotas servidor; `database/`: esquema aplicado; `tests/`: verificações; `public/legacy/`: cliente anterior preservado para acesso aos dados locais.

O ambiente de demonstração contém ativos e processos sintéticos identificados, além de leituras públicas reais datadas. Não há usuários padrão nem senha compartilhada de demonstração.

Dados de mercado e metodologia: [docs/DADOS_MERCADO.md](docs/DADOS_MERCADO.md).
