# Évora Launch OS v5.9

Evolução da v5.8.2 com envios preparados para backend e controles financeiros.

## Envios preparados para backend

A tela de Envio de Materiais agora permite:

- registrar envio realizado;
- preparar WhatsApp;
- preparar e-mail;
- copiar mensagem;
- enfileirar payload para backend futuro;
- enviar materiais para leads e clientes de pós-venda.

A fila de backend grava os payloads para futura integração com:

- WhatsApp Cloud API;
- e-mail transacional;
- storage de materiais;
- logs de entrega/leitura.

## Financeiro

Novo módulo Financeiro e Carteira:

- recebíveis;
- inadimplência;
- margem atual por m²;
- preço médio de vendas;
- preço médio por m²;
- descontos no mês e acumulados;
- geração preparada de boletos;
- mensagens de alerta e cobrança por WhatsApp/e-mail;
- relatório financeiro em PDF.

## Sem banco de dados

Continua usando localStorage.

## Vercel

Build Command: npm run build  
Output Directory: public  
Install Command: npm install
