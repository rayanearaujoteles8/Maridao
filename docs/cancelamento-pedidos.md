# Cancelamento de pedidos

Este arquivo trata de dois caminhos: a substituição automática de pedidos abertos (regra de 22/10/2026, abaixo) e o cancelamento pedido pelo cliente ou pelo prestador (18/11/2026, ao final).

## Substituição de pedidos abertos

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

## Cancelamento pelo cliente e pelo prestador — 18/11/2026

Implementa RF04.4 / UC04.4 e RNF02.4. Exige a migração 013_request_cancellation.sql (aplicada por npm run db:activate).

POST /requests/:id/cancel recebe {"reason": "texto"} com até 500 caracteres. Sem motivo, enviar {}.

| Quem | Etapas em que pode cancelar | Motivo |
| --- | --- | --- |
| Cliente dono do pedido | Aberta, Aceita, Em andamento | Opcional em Aberta; obrigatório em Aceita e Em andamento |
| Prestador da proposta aceita | Aceita, Em andamento | Sempre obrigatório |

Prestador que só tem proposta pendente não cancela o pedido: retira a proposta. Pedido Concluída ou já Cancelada responde 409. Em Aguardando confirmação o cancelamento não é permitido; se o cliente contestar a conclusão, o pedido volta a Em andamento e pode ser cancelado.

Efeitos, na mesma transação:

- Pedido passa a Cancelada. O horário de início é mantido quando o atendimento já tinha começado.
- Propostas Pendentes passam a Não selecionada. Propostas Expiradas e Retiradas mantêm o status.
- A proposta aceita, se houver, passa a Cancelada. O vínculo com o pedido é mantido e o chat continua legível, sem novas mensagens.
- Protocolo de suporte aberto do pedido é encerrado como Cancelado.
- Evento request_cancelled em request_events, com data, autor, etapa anterior e motivo.
- Aviso à outra parte. Quem cancelou não recebe aviso da própria ação.

| Situação | Quem recebe | Texto do aviso |
| --- | --- | --- |
| Cliente cancela depois do aceite | Prestador escolhido | Atendimento cancelado pelo cliente: veja o motivo na solicitação |
| Prestador cancela | Cliente | Solicitação cancelada pelo prestador: veja o motivo e, se quiser, crie uma nova solicitação |
| Administração cancela por protocolo de suporte | Cliente e prestador escolhido | Solicitação cancelada pela administração: veja o motivo na solicitação |
| Pedido Aberta é cancelado, substituído ou a conta do cliente é encerrada | Cada prestador com proposta pendente | Solicitação cancelada: sua proposta foi encerrada |

Leituras: GET /requests e o detalhe do pedido trazem can_cancel e cancellation; GET /requests/history traz cancellation. O objeto cancellation informa quem cancelou (by: customer, provider, administration ou system), quando (at), por qual caminho (action: request_cancelled, request_replaced, account_closed ou support_cancelled) e o motivo (reason). O motivo só é devolvido ao cliente do pedido e ao prestador da proposta escolhida. Pedidos cancelados antes desta revisão, sem evento, aparecem só como Cancelada. A administração consulta os cancelamentos de uma conta em GET /admin/users/:id (lista cancellations).

No aplicativo: a tela Cancelar Solicitação abre em folha, pede o motivo e a confirmação; para o prestador o título é Cancelar atendimento. O botão só aparece quando can_cancel é verdadeiro. O autor e o motivo do cancelamento aparecem na lista de pedidos e no histórico.

Verificação: tests/request-cancellation.test.ts (unidade) e npm run test:cancel:db com MARIDAO_DB_TEST=1 (banco, em transação desfeita ao final).

Correção sobre a seção de substituição acima: desde a migração 016, o aviso enviado aos prestadores com proposta pendente em pedido substituído é "Solicitação cancelada: sua proposta foi encerrada"; o cliente não recebe mais um aviso por proposta.
