# Évora Launch OS v5.7 — v4.3 restaurada + login local

Esta versão corrige a falha da v5.6: mantém a aplicação comercial da v4.3 **e** adiciona as telas locais de login, usuários, permissões, senhas e logs.

## Mantém da v4.3

- Sala de Guerra
- Leads
- SDR
- Corretores
- Lotes
- Simulador
- Propostas
- Reservas
- Contratos
- Clientes
- Relatórios setoriais
- PDF/HTML de relatórios
- Reserva automática ao gerar proposta
- Fluxo aprovação → envio → confirmação → contrato
- Pós-venda e comunicação de clientes

## Adiciona da v5.x

- Tela de login local
- Usuários
- Corretores com CRECI/PDF
- Papéis e permissões
- Gestão de senhas
- Logs locais
- Administrador podendo excluir leads e usuários

## Primeiro acesso

```text
admin@evora.local
Evora@2026!
```

## Sem banco

Os dados ficam no navegador por `localStorage`.  
A sessão usa `sessionStorage`.

## Vercel

```text
Build Command: npm run build
Output Directory: public
Install Command: npm install
```
