# Supabase — Évora Viabilidade

## Estado atual

A aplicação está preparada para usar o projeto Supabase `evora-gestao` (`qsdffayasuzsmngteika`) em `sa-east-1`.

O projeto está inativo por pendências de cobrança da organização. Enquanto ele não for restaurado, a aplicação mantém o armazenamento local como contingência e exibe `Supabase pendente`.

## Arquitetura

- `viability_projects`: um registro por empreendimento e usuário.
- `viability_user_settings`: empreendimento ativo e versão do schema por usuário.
- Autenticação por e-mail e senha no Supabase Auth.
- Row Level Security em todas as tabelas expostas.
- Políticas separadas de `SELECT`, `INSERT`, `UPDATE` e `DELETE`, sempre limitadas a `auth.uid() = user_id`.
- O navegador recebe somente a chave publicável. Nunca usar `service_role` no cliente.
- `localStorage` funciona como cache e contingência offline.
- No primeiro login, os estudos existentes no navegador são mesclados e enviados ao Supabase.

## Ativação

1. Regularizar a cobrança da organização Supabase.
2. Restaurar o projeto `evora-gestao`.
3. Executar `schema.sql` no projeto.
4. Verificar que as tabelas aparecem na Data API e que RLS está ativa.
5. Obter uma chave publicável ativa do projeto.
6. Atualizar `supabase-config.json`:

```json
{
  "configured": true,
  "url": "https://qsdffayasuzsmngteika.supabase.co",
  "publishableKey": "sb_publishable_...",
  "projectRef": "qsdffayasuzsmngteika",
  "status": "ready",
  "message": "Supabase pronto."
}
```

7. Configurar no Supabase Auth:
   - Site URL: URL pública da plataforma.
   - Redirect URL: URL pública da plataforma.
   - Confirmação de e-mail conforme a política de acesso desejada.
8. Publicar uma nova versão da aplicação.

## Verificação obrigatória

- Criar usuário A e usuário B.
- Confirmar que A não consegue ler, alterar ou excluir registros de B.
- Criar, editar, duplicar e excluir um empreendimento.
- Validar sincronização em dois navegadores.
- Validar migração dos estudos locais no primeiro login.
- Desconectar a internet, editar um estudo e confirmar a sincronização após reconectar.
- Rodar os advisors de segurança e desempenho do Supabase.

## Observação

O arquivo `schema.sql` é idempotente para a criação básica das tabelas e políticas, mas deve ser revisado e aplicado em um projeto ativo antes de liberar a sincronização para usuários finais.
