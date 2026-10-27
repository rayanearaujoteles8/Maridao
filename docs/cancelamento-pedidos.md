# Substituição de pedidos abertos

Regra aprovada em 22/10/2026: ao publicar um novo pedido, cancelar os anteriores do mesmo cliente e categoria apenas se ainda estiverem Abertos e sem proposta aceita. Categorias antigas equivalentes usam a mesma normalização da busca. Preservar Aceita, Em andamento e Concluída, outras categorias e outros clientes.

A criação usa transação, bloqueio transacional por cliente para serializar publicações simultâneas, e bloqueio das solicitações anteriores compatível com envio e aceite de propostas. Se o aceite vencer a disputa, aquele pedido não é cancelado; se o cancelamento vencer, o aceite/envio é rejeitado. Propostas Pendentes dos pedidos cancelados ficam Canceladas; histórico e propostas Retiradas são preservados. Falha na criação desfaz todos os cancelamentos. Nenhuma permissão adicional no banco é concedida.

## Ativação local

Aplicar como postgres, após 007_service_progress.sql:

```sql
\i 'C:/Users/rayan/Documents/Codex/maridao/services/api/migrations/008_replace_open_requests.sql'
```

Reiniciar a API e recarregar o Expo. Não reaplicar migrações 006/007 após a 008, pois restringem os estados antigos. A 008 não cancela pedidos retroativamente; a regra acontece na próxima publicação.

A tela informa a consequência antes de publicar e exibe o número real de pedidos substituídos após sucesso. Listas e detalhes exibem Cancelada; não oferecem enviar/aceitar propostas nesses pedidos.

Verificação: tipos API/mobile e 42 testes de unidade passaram (39 API, 3 mobile). Casos novos cobrem ordem dos bloqueios, escopo parametrizado, cancelamento de propostas pendentes, primeiro pedido, entrada inválida e rollback. Lint tentado; ESLint não configurado. Aplicação da migração, concorrência em PostgreSQL e fluxo visual no iPhone ainda precisam ser validados.

Teste manual: criar A e depois B na mesma categoria, conferir A Cancelada e B Aberta; conferir propostas antigas Canceladas; publicar em outra categoria e verificar preservação. Aceitar uma proposta e publicar novo pedido da mesma categoria: o pedido aceito deve permanecer. Conferir duas publicações simultâneas e disputa de publicação/aceite em banco de teste. Não utilizar dados pessoais reais nesses testes.


## Rastreabilidade revisada em 27/10/2026

A migração 010 cria request_events. Cada pedido substituído gera request_replaced com autor, horário do servidor, estado Aberta → Cancelada, motivo e referência ao novo pedido. Evento e criação/cancelamentos pertencem à mesma transação; falha no evento reverte a publicação inteira. Registros anteriores sem evento permanecem legados, sem motivos ou datas inventados. Ver docs/andamento.md.
