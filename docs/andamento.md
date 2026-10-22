# Andamento do atendimento

Implementa RF07.1/UC07.1, RF07.2/UC07.2 e RF07.3/UC07.3 do documento Maridão (2), páginas 45–47. Fluxo: Aberta → Aceita (aceite existente) → Em andamento → Concluída. Somente o prestador cuja proposta foi aceita inicia e conclui; o cliente acompanha as etapas na própria solicitação. Outros prestadores consultam apenas os resultados das próprias propostas e não recebem controles de alteração.

## Ativação

Como postgres no SQL Shell, executar migrations/007_service_progress.sql depois das migrações 005 e 006 já aplicadas. A migração acrescenta started_at e completed_at, amplia as condições de estado e concede UPDATE somente nas duas novas colunas de horário. Mantém o vínculo obrigatório à proposta escolhida e exige coerência entre etapa e horários. Pode ser reexecutada sem apagar registros. Não executar novamente a migração 006 depois da 007, pois a versão anterior restringe os estados a Aberta/Aceita.

Reiniciar a API e recarregar o Expo. No perfil do prestador escolhido: Solicitações e propostas → Ver detalhes → Iniciar atendimento; depois Concluir atendimento. Os controles também aparecem no cabeçalho dos detalhes de propostas. Cada alteração tem confirmação. O cliente usa Atualizar solicitações para acompanhar; sem atualização automática ou aviso de notificação enviado.

## API e segurança

POST /requests/:id/status recebe somente status, com os valores Em andamento ou Concluída. Conta e perfil são derivados da sessão; clientes recebem 403. O servidor valida UUID, campos e transição; obtém e bloqueia a solicitação vinculada à proposta Aceita e ao prestador autenticado antes de gravar. Tentativa de outro prestador recebe 404. Não permite concluir antes do início, iniciar um pedido aberto ou reabrir um atendimento concluído.

Atualização e horários são gravados em transação. Repetir a mesma etapa é idempotente e preserva os horários. Data/hora vêm do PostgreSQL; na tela são apresentados no horário de Palmas. Falha provoca rollback, e o app não confirma sucesso antes da resposta real. Em falha de conexão, atualizar a lista para conferir o resultado antes de repetir. O aceite da proposta escolhida continua idempotente mesmo após o atendimento avançar, sem regredir seu estado.

GET /requests e os detalhes de propostas retornam can_manage calculado pelo servidor, além dos horários. A interface usa esse indicador para mostrar botões somente ao escolhido; o endpoint repete a autorização. Listagem, privacidade e regras de compatibilidade existentes foram preservadas.

## Verificação

Tipos conferidos na API e no aplicativo. 39 testes de unidade passaram (36 API e 3 aplicativo), incluindo prestador indevido, cliente, salto de etapa, repetição sem alteração de horários, rollback e acesso aos controles. Lint foi tentado, mas o projeto ainda não tem ESLint configurado; nenhuma dependência foi adicionada nesta etapa. A aplicação da migração no PostgreSQL e a validação visual no iPhone aguardam teste local da usuária.

Teste manual: cancelar uma confirmação e conferir que nada muda; confirmar início e verificar Em andamento nas duas contas; concluir e verificar Concluída e horários nas duas contas. Entrar como outro prestador e conferir ausência de botões. Avaliações, chat e notificações RF13 continuam pendentes; não apresentar como implementados.

Correção após teste da usuária: PostgreSQL retornava 42P08 ao deduzir tipos diferentes para o parâmetro de status usado no UPDATE e nos CASEs de horários. A consulta compartilhada progressUpdateSql define varchar(30) explicitamente para esse parâmetro em todas as ocorrências. Confirmado com EXPLAIN no PostgreSQL local, sem executar atualizações em atendimentos existentes. Regressão: npm run test:progress:db valida o planejamento das consultas de início e conclusão; testes de unidade de autorização e transição também passaram. Não requer outra migração, somente reiniciar a API.
