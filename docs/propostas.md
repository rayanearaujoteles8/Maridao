# Envio e consulta de propostas

Implementa RF05.2/UC05.2 e RF06.1/UC06.1 do documento acadêmico. Prestador abre um pedido compatível na lista e escolhe Ver / enviar proposta. Informa valor total, descrição, prazo estimado e validade. O cliente consulta em Minhas solicitações → Ver detalhes → Ver propostas. O prestador consulta somente a própria proposta nesse pedido.

Aplicar services/api/migrations/005_proposals.sql no SQL Shell como postgres conectado ao banco maridao. A migração cria tabela e índice se não existirem e concede somente SELECT e INSERT ao usuário da API. Pode ser reexecutada na ausência de alterações manuais na estrutura. Não altera as solicitações ou contas existentes. Reiniciar a API e recarregar o Expo após aplicar.

POST /requests/:id/proposals exige prestador autenticado. A conta vem exclusivamente da sessão. Categoria, cidade, UF, cobertura e estado Aberta são verificados no próprio INSERT SELECT, usando a mesma regra da listagem. A unicidade request_id/provider_id impede propostas duplicadas, inclusive em envios concorrentes. Formulário não aceita providerId, status, conta ou campos extras. Não há repetição automática do envio; em falha de conexão, atualizar propostas antes de tentar novamente.

Valor recebido como texto decimal, sem separadores de milhar, com até duas casas decimais; convertido por centavos inteiros antes de armazenar numeric(8,2), entre R$ 0,01 e R$ 999.999,99. Descrição obrigatória até 3000 caracteres, prazo declarativo obrigatório até 200 caracteres, validade obrigatória YYYY-MM-DD válida e não anterior ao dia atual de Palmas. A proposta vale até o fim do dia escolhido em America/Araguaina. Até 17/11/2026 a API só indicava a validade encerrada na consulta; desde a migração 015 a proposta vencida é gravada como Expirada (ver a atualização de 18/11/2026 ao final).

GET /requests/:id/proposals consulta até 20 propostas por página. Cliente só acessa solicitação e propostas próprias; prestador compatível ou com proposta previamente enviada só vê a própria proposta. Respostas incluem nome profissional, valor, descrição, prazo, validade e status, excluindo documentos, e-mail e telefone. UUIDs, páginas e filtros são validados. Proposta começa em Pendente pelo padrão do banco; sem seleção de status pelo aplicativo.

Edição, retirada, chat e notificações RF13 continuam pendentes. Não há pagamento no app. As propostas e seus resultados ficam disponíveis para consulta manual; não é apresentado aviso de notificação enviada.

Verificação de tipos passou na API e no aplicativo; 26 testes de unidade passaram (23 API e 3 aplicativo). Lint indisponível por ausência de ESLint no ambiente. A integração com PostgreSQL e a interface no iPhone aguardam aplicação da migração e teste da usuária; o ambiente do agente não tem acesso ao banco local.

## Aceite — RF06.2 / UC06.2 e RF06.3 / UC06.3

Aplicar migrations/005_proposals.sql, se ainda não aplicada, e migrations/006_accept_proposal.sql como postgres. A nova migração pode ser reexecutada: acrescenta o vínculo selected_proposal_id, permite o estado Aceita no pedido e concede UPDATE apenas nas colunas de estado/vínculo necessárias. Uma chave estrangeira composta impede vincular proposta de outro pedido; um índice único parcial permite no máximo uma proposta Aceita por pedido. A condição do pedido exige vínculo quando Aceita e ausência de vínculo quando Aberta. Não libera atualização genérica de dados ou exclusão.

POST /requests/:id/proposals/:proposalId/accept recebe JSON vazio. A conta e o perfil vêm exclusivamente da sessão; exige cliente e propriedade do pedido, proposta Pendente pertencente ao pedido e validade vigente no horário de Palmas. A confirmação na interface apresenta nome profissional, valor e consequência para as demais propostas.

Aceite e envio de proposta passam a bloquear a mesma linha da solicitação antes de gravar. No aceite, pedido e proposta são conferidos e bloqueados, as demais propostas Pendentes ficam Não selecionadas, a escolhida vira Aceita e o pedido vira Aceita com o vínculo correspondente, tudo na mesma transação. Propostas já Retiradas preservam esse estado. Falha em qualquer etapa provoca rollback. Repetir o aceite da mesma proposta já escolhida retorna sucesso sem alterar dados; escolher outra depois do aceite retorna conflito. O bloqueio também impede um envio concorrente de deixar proposta Pendente em pedido já aceito.

A proposta escolhida aparece primeiro na consulta. O botão de aceite só aparece para cliente, pedido Aberto e proposta Pendente não vencida; o servidor repete todas as verificações. O prestador passa a ver na lista também os pedidos aos quais já enviou propostas, inclusive resultados Aceita/Não selecionada. Essa ampliação preserva o acesso somente à própria proposta.

O estado após o aceite é Aceita, conforme exemplo do UC07.1. Não significa que o serviço começou. Início e conclusão foram implementados na etapa descrita em docs/andamento.md, exigindo migrations/007_service_progress.sql. Chat e notificações continuam pendentes. Testes de unidade verificam transação, rollback, autorização, validade, repetição e coordenação entre envio/aceite com banco simulado. Aplicação da migração e testes reais de concorrência no PostgreSQL e de interface no iPhone ainda necessários.

Verificação desta etapa em 22/10/2026: tipos passaram na API e no aplicativo; 32 testes de unidade passaram (29 API e 3 aplicativo). O lint tentou configurar ESLint ausente e não foi concluído; a alteração automática de dependências foi revertida. Teste manual: publicar um pedido, receber duas propostas válidas de prestadores diferentes, cancelar a primeira confirmação e conferir ausência de alteração, depois confirmar uma proposta e verificar Aceita/Não selecionada nos dois perfis. Tentar aceitar outra proposta deve falhar; pedido de outro cliente e proposta vencida não podem ser aceitos. Para concorrência real, repetir o aceite de propostas diferentes em duas sessões do mesmo cliente e verificar que existe apenas uma escolhida.

## Atualização — edição, retirada e históricos (27/10/2026)

Implementação e ativação em docs/propostas-historico-rayane.md. Migração 009 obrigatória. Esta entrega substitui a indicação anterior de edição/retirada pendentes, sem declarar a validação no iPhone concluída. Aceite passa a receber version para conferir os dados efetivamente mostrados ao cliente.

## Atualização — versões, reenvio e proposta expirada (18/11/2026)

Implementa RF05.2, RF05.3, RF05.4, RF06 e RF09.3 (UC05.3, UC05.4, UC06.1 a UC06.3, UC09.3). Exige a migração 015_proposal_versions.sql (aplicada por npm run db:activate). Substitui o que as seções anteriores dizem sobre edição, validade encerrada e avisos de edição.

A proposta continua sendo uma só por prestador e pedido, com o mesmo identificador.

| Status da proposta | Significado |
| --- | --- |
| Pendente | Vigente e dentro da validade. |
| Expirada | A validade passou. Pode ser reenviada; não pode ser retirada nem aceita. |
| Aceita | Escolhida pelo cliente. |
| Não selecionada | Outra proposta foi aceita, ou o pedido aberto foi cancelado. |
| Retirada | Retirada pelo prestador. Não aparece mais para o cliente. |
| Cancelada | Era a aceita e o pedido foi cancelado; ou era pendente em pedido substituído por outro. |
| Substituída | Só nas versões anteriores, no histórico de versões. |

Reenvio: Editar proposta passou a se chamar Reenviar proposta, no mesmo caminho PATCH /requests/:id/proposals/:proposalId. Cada reenvio copia a versão anterior para maridao.proposal_versions como Substituída, grava os novos dados, deixa a proposta Pendente e soma 1 em version. Vale para proposta Pendente ou Expirada, com o pedido Aberta, e exige prestador com cadastro Aprovado. A retirada não soma mais em version.

Expiração: a proposta Pendente cuja validade é anterior ao dia de hoje em Palmas (America/Araguaina) passa a Expirada. A passada roda quando a API inicia, a cada 10 minutos, antes das leituras e ações sobre pedidos e propostas e, manualmente, com npm run proposals:expire. Cada expiração grava o evento proposal_expired (autor system) e avisa só o prestador. A proposta Expirada não volta sozinha a Pendente: só pelo reenvio com nova validade.

Aceite e cancelamento: só as demais propostas Pendentes com validade em dia passam a Não selecionada. Expiradas e Retiradas mantêm o status.

Versões: GET /requests/:id/proposals/:proposalId/versions devolve a versão vigente e as anteriores, da mais recente para a mais antiga, com valor, descrição, prazo, validade, data de envio e data de substituição. Acesso do prestador autor e do cliente do pedido; o cliente não vê versões de proposta Retirada e um prestador não vê as do concorrente. O histórico de versões só aceita leitura e inclusão pela API. Propostas editadas antes da migração 015 não tiveram as versões antigas guardadas; a resposta indica isso em missing_previous_versions.

Leituras: cada proposta de GET /requests/:id/proposals traz can_resend, can_withdraw, can_accept, versions_count, has_previous_versions e sent_at. GET /requests/history traz proposal_version, proposal_versions_count e proposal_has_previous_versions. As recusas das rotas de proposta trazem code e o status atual.

| Aviso | Quem recebe |
| --- | --- |
| Proposta reenviada: confira os novos dados | Cliente |
| Proposta expirada: a validade terminou | Prestador autor |
| Proposta aceita: combine os detalhes com o prestador pelo chat | Cliente |
| Sua proposta foi aceita: combine os detalhes com o cliente pelo chat | Prestador escolhido |
| Proposta não selecionada: o cliente escolheu outra proposta | Prestadores não escolhidos |

O aviso Proposta editada não é mais emitido.

No aplicativo: os botões Reenviar proposta, Retirar proposta e Aceitar seguem os campos can_* da API. A proposta Expirada aparece marcada, sem botão de aceite. Ver versões abre a tela Versões da Proposta, a partir das propostas do pedido e do histórico.

Verificação: tests/proposal-versions.test.ts (unidade) e npm run test:versions:db com MARIDAO_DB_TEST=1 (banco, em transação desfeita ao final).
