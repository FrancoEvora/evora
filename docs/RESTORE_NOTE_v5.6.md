# Nota técnica — v5.6

A v5.6 restaura a aplicação comercial da v4.3.

O objetivo foi separar duas coisas:

1. **Produto comercial**: deve permanecer baseado na v4.3, que tinha a jornada, simulador, propostas, reservas, clientes e relatórios.
2. **Deploy sem banco**: deve ser apenas uma embalagem para Vercel/static hosting.

A v5.5 misturou as duas coisas e acabou virando uma aplicação reduzida.  
A v5.6 corrige isso.
