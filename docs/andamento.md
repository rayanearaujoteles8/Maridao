# Confirmação da conclusão e atendimento de problemas

Revisão vigente de 18/11/2026, relacionada a RF07, UC07.3 e UC07.4. Substitui a revisão de 17/11/2026, em que a conclusão dependia de um código de quatro dígitos informado pelo cliente ao prestador. Esse código foi removido.

## Ativação

Depois das migrações 001 a 008, aplicar 009 a 016 como postgres com npm run db:activate (ou migrations/activate_team.sql no psql). Os arquivos declaram UTF8 explicitamente. API e aplicativo devem ser atualizados juntos.

010 cria request_events e service_support e recria as regras de estado para permitir cancelamento com preservação do horário de início. 014 acrescenta o status Aguardando confirmação, completion_reported_at e completion_confirmed_by, e retira da API a permissão de escrever nas colunas do código antigo. As colunas do código permanecem na tabela; nenhuma tabela é excluída.

## Fluxo

| Etapa | Quem age | Rota | Resultado |
| --- | --- | --- | --- |
| Aceita | Prestador da proposta aceita inicia | POST /requests/:id/status com {"status":"Em andamento"} | Em andamento |
| Em andamento | Prestador registra a conclusão | POST /requests/:id/completion | Aguardando confirmação |
| Aguardando confirmação | Cliente confirma | POST /requests/:id/completion/confirm | Concluída; avaliação liberada |
| Aguardando confirmação | Cliente contesta com motivo | POST /requests/:id/completion/contest | Volta a Em andamento |
| Aguardando confirmação | Ninguém responde em 7 dias | passada automática | Concluída, confirmada pelo sistema |

O prestador não conclui sozinho: o pedido só chega a Concluída pela confirmação do cliente ou pelo prazo. Depois de uma contestação o prestador pode registrar a conclusão de novo e o prazo de 7 dias recomeça. O motivo da contestação é obrigatório, com até 500 caracteres, e só é devolvido ao cliente do pedido e ao prestador escolhido.

Cada mudança grava evento em request_events na mesma transação: completion_reported, completion_confirmed, completion_contested (com o motivo) e completion_auto_confirmed (autor system). Os avisos nascem do gatilho do banco, um por pessoa e por mudança.

POST /requests/:id/status passou a servir somente para iniciar o atendimento. Enviar Concluída responde 400. POST /requests/:id/completion-code foi removida.

### Confirmação automática

O prazo é a constante AUTO_CONFIRM_DAYS = 7 em src/request-completion.ts, contada a partir do último registro de conclusão. A passada roda quando a API inicia, a cada 10 minutos, antes das leituras e ações sobre pedidos e, manualmente, com npm run requests:auto-confirm. Não há agendador externo. A lista e o detalhe trazem completion_deadline_at para a tela mostrar até quando o cliente pode responder.

### Regras em Aguardando confirmação

- Cancelamento não é permitido nessa etapa (409 com code REQUEST_NOT_CANCELLABLE). Se o cliente contestar, o pedido volta a Em andamento e pode ser cancelado.
- O chat continua aberto para mensagens; fecha em Concluída e Cancelada.
- A avaliação só fica disponível em Concluída.
- Encerrar, inativar ou excluir conta é recusado, como em Aceita e Em andamento.

### No aplicativo

O bloco de andamento mostra a etapa atual e os botões conforme os campos can_start, can_report_completion, can_confirm_completion, can_contest_completion e can_review devolvidos pela API. Confirmar Conclusão e Contestar Conclusão abrem em folha. O campo de digitar código e a caixa que mostrava o código ao cliente foram retirados.

## Serviço não realizado

O protocolo de suporte ficou restrito a serviço não realizado, antes do início. O cliente descreve o ocorrido em POST /requests/:id/support com reason nao_realizado, com o pedido em Aceita. Um pedido só pode ter um protocolo Aberto. Enquanto houver protocolo aberto, o prestador não pode iniciar o atendimento. A discordância sobre um serviço já iniciado deixou de ser protocolo: é a contestação da conclusão. O motivo discordancia responde 400; protocolos antigos com esse motivo continuam aparecendo na consulta. Se o pedido for cancelado, o protocolo aberto é encerrado junto.

GET /requests/:id/support é exclusivo do próprio cliente e retorna os vinte protocolos mais recentes, incluindo resposta e data de resolução. Prestador só recebe a informação de que há análise aberta, sem relato privado do cliente. A interface informa protocolo registrado para análise; não afirma envio de e-mail/push. Não há promessa de SLA/atendimento 24 horas.

A triagem dos protocolos continua ocorrendo pelo banco, por operador autorizado. A área administrativa do aplicativo (docs/administracao.md) não trata protocolos de suporte. Para consultar a fila como postgres:

    SELECT id,request_id,reason,status,created_at FROM maridao.service_support WHERE status='Aberto' ORDER BY created_at,id;

Após verificar as informações com as partes, a administração resolve com justificativa, usando função sem permissão de execução para PUBLIC/maridao_api:

    SELECT maridao.resolve_service_support('UUID_DO_PROTOCOLO','resolver','Justificativa da resolução');

Ou cancela quando a análise conclui que o serviço não ocorreu:

    SELECT maridao.resolve_service_support('UUID_DO_PROTOCOLO','cancelar','Justificativa do cancelamento');

A função usa SECURITY INVOKER, exige privilégios do operador e grava o usuário de banco, decisão, justificativa e data/hora. Resolver preserva a etapa e permite prosseguir com o fluxo; não conclui automaticamente. Em andamento só é aceito para decidir protocolos abertos antes da migração 014. Cancelar preserva o vínculo à proposta, o início se existente e o histórico, muda proposta escolhida e pedido para Cancelada e registra evento. Não há exclusão nem reembolso automático. Não executar exemplos sem substituir por protocolo real e decisão verificada.

Avaliação pública e comentário de qualidade seguem RF08 após conclusão confirmada. Não forçar Concluída nem criar nota de serviço não realizado para viabilizar o relato. Avaliações e reputação seguem a divisão original de Kaio e dependem da migração 011.

## Rastreabilidade

request_events contém solicitação, autor autenticado ou administração, ação, horário do servidor, estado anterior/novo, motivo e pedido substituto quando aplicável. O cancelamento automático existente agora grava request_replaced na mesma transação do novo pedido; o registro não é somente mensagem de console. Registros antigos sem evento não recebem motivo ou horário inventado.

service_support contém relato privado, estado, decisão, justificativa e operador. Propostas retiradas preservam withdrawn_at e versão desde 009. Não há módulo de denúncia. A aprovação do cadastro do prestador e a inativação de contas pela administração estão em docs/administracao.md; a aprovação não valida documentos automaticamente. Proteção de campos cadastrais permanece.

## Verificação

Testes de unidade (tests/request-completion.test.ts) cobrem quem pode registrar, confirmar e contestar, as etapas permitidas, o motivo obrigatório e a confirmação automática. O teste de banco npm run test:completion:db, com MARIDAO_DB_TEST=1, percorre conclusão registrada, confirmada, contestada e confirmada automaticamente, com avisos e regras vizinhas, em transação desfeita ao final. Não altera dados existentes. A conferência em aparelho físico continua pendente.

## Funções da equipe

Ver docs/entrega-equipe-2026-11-17.md para edição de perfil, encerramento de acesso, recuperação e confirmação de e-mail local, avaliações, chat criptografado e notificações no aplicativo. Aquele arquivo é o registro da entrega de 17/11/2026 e ainda descreve o código de quatro dígitos; o fluxo vigente da conclusão é o deste documento.
