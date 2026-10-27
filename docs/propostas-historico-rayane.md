# Propostas e histórico — tarefas da Rayane, 27/10/2026

Branch: rayane/propostas-historicos. Relacionado às issues #10 (UC05.3/UC05.4), #12 (UC09.1–UC09.3) e refinamento de interface #1. Não inclui avaliações, reputação, chat, notificações nem pagamento.

## Ativação

No SQL Shell, autenticada como postgres, depois das migrações 001–008:

    \i 'C:/Users/rayan/Documents/Codex/maridao/services/api/migrations/009_proposal_management.sql'

A migração acrescenta version (inicia em 1), updated_at e withdrawn_at a proposals e concede ao usuário da API UPDATE apenas nos campos necessários. Não exclui registros. Pode ser reexecutada. Não reaplicar migrações antigas que restringem os estados.

Reiniciar a API e recarregar o Expo. A API e o app desta entrega devem ser atualizados juntos: o aceite agora exige a versão mostrada ao cliente. Até aplicar 009, consultas de propostas/histórico falharão porque os campos ainda não existem. Migração não aplicada automaticamente: a conexão disponível é maridao_api, sem autorização administrativa; postgres exige autenticação da usuária.

## Edição e retirada — #10

PATCH /requests/:id/proposals/:proposalId recebe os quatro campos originais e version. POST /requests/:id/proposals/:proposalId/withdraw recebe somente version. Prestador só altera a própria proposta Pendente enquanto o pedido estiver Aberto. Proposta vencida ainda pendente pode renovar sua validade, mediante data válida e regras de valor/prazo existentes. Não é possível restaurar ou reenviar uma Retirada: preservado índice único por pedido/prestador. Não se muda autoria, estado do pedido ou histórico de criação.

Bloqueio da solicitação antes da proposta em todas as alterações, compatível com aceite/envio/cancelamento automático. Versão evita sobrescrever edição concorrente e impede aceitar um preço antigo. Se aceite ou cancelamento vencer a disputa, edição e retirada recebem conflito. Retirada é confirmação explícita e preserva os dados e o horário. Repetição da retirada em pedido ainda Aberto não altera o horário. Alterações e horários são persistidos em transação; erros provocam rollback.

No app: Editar proposta preenche os dados atuais, abre o formulário e permite cancelar sem gravar. Salvar alterações e Retirar proposta exibem sucesso somente após a resposta real. Em falha de rede, usar Atualizar propostas para conferir o resultado antes de repetir. Cliente vê valor atualizado após atualizar/reabrir a tela. Não existe atualização em tempo real nem notificação.

## Meu histórico — #12

Acesso nos painéis de cliente e prestador. GET /requests/history?page=N inclui todos os pedidos do próprio cliente; para prestadores, somente pedidos com proposta de sua autoria, incluindo retirada, não seleção e cancelamento. Oportunidades sem participação continuam na lista de pedidos.

Paginação no servidor: 20 registros, busca de um adicional para hasMore; ordem estável por criação do pedido e UUID decrescentes. Não filtra somente a primeira página. O servidor deriva a conta da sessão, rejeita filtros/identidade extras e não inclui dados de contato ou propostas concorrentes. Cliente vê resumo da proposta escolhida, quando houver, e consulta as demais no detalhe autorizado existente. Prestador vê exclusivamente sua própria proposta.

Cartões mostram publicação, estado do pedido e da proposta quando aplicável, valor e horários de início/conclusão/retirada. Detalhe abre a tela de propostas com retorno ao histórico; exibe também criação e cidade. Mantida identidade Maridão. Estados de carregamento, lista vazia, erro, repetição de consulta e carregar mais têm ações reais.

## Validação e limites

Tipos da API e mobile passaram; 48 testes unitários da API e três testes mobile passaram. Lint dos três arquivos mobile alterados passou. O lint global continua com três erros e dois avisos anteriores em service-progress, use-catalog, use-color-scheme.web e minha-conta, sem novos erros nestas telas.

Teste PostgreSQL executado com tabelas temporárias derivadas da estrutura existente, campos da migração acrescentados somente às cópias e fixtures fictícias: edição, retirada, aceite com revisão desatualizada, proibição de alterações após aceite/cancelamento, histórico de 25 registros em duas páginas e isolamento entre contas. Tudo revertido ao terminar. Não valida concessões da migração no banco principal nem disputa simultânea entre duas conexões.

Para repetir o teste isolado na pasta services/api:

    $env:MARIDAO_DB_TEST='1'
    $env:MARIDAO_DB_TEMP='1'
    npm run test:proposals:db

Depois da migração, para validar as tabelas principais com fixtures em transação e rollback:

    $env:MARIDAO_DB_TEST='1'
    Remove-Item Env:MARIDAO_DB_TEMP -ErrorAction SilentlyContinue
    npm run test:proposals:db

Conferência final no iPhone ainda necessária, especialmente fonte ampliada, teclado/rolagem e confirmações. Não fechar issues #1/#10/#12 antes de ativar a migração, testar o fluxo real e revisar o pull request.

## Roteiro manual

1. Prestador abre uma proposta Pendente de pedido Aberto, edita valor/descrição/prazo/validade, cancela a primeira edição e confirma que não mudou. Edita novamente e salva.
2. Cliente atualiza e vê os novos dados. Se mantiver a versão antiga aberta e tentar aceitar, recebe aviso para atualizar; depois pode confirmar a nova versão.
3. Em outro pedido, prestador cancela a confirmação de retirada; nada muda. Confirma a retirada; aparece Retirada e o cliente não pode aceitar.
4. Após aceite, cancelamento automático, início e conclusão, conferir ausência dos controles e rejeição das requisições indevidas.
5. Meu histórico nas duas contas: consultar detalhes e voltar, carregar mais, conferir registros cancelados/retirados e testar falha de conexão. Outro prestador não pode ver propostas concorrentes.
6. Testar disputa em dois aparelhos/sessões: edição versus aceite; retirada versus aceite; edição/retirada versus novo pedido que cancela o anterior. Só a operação compatível com o estado bloqueado pode confirmar.


## Revisão de 27/10 após orientações da banca

Aplicar também 010_customer_confirmation.sql. Ela acrescenta eventos de edição/retirada e cancelamento, confirmação de conclusão por código do cliente e protocolos de suporte. Conclusão unilateral foi substituída. Detalhes e procedimento administrativo restrito em docs/andamento.md. Os testes PostgreSQL isolados foram ampliados; as migrações no banco principal e os testes no iPhone continuam pendentes.
