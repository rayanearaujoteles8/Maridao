# API do Maridão

Servidor Express com TypeScript no Node.js 24 e PostgreSQL.

## Executar e conferir

    npm run dev
    npm run typecheck
    npm run test:unit
    npm test
    npm run db:check
    npm run db:workflows

GET /health verifica apenas o servidor. POST /customers recebe name, email, phone, cpf, neighborhood e password e cria a conta e o perfil do cliente juntos. A cidade é Palmas e o estado TO, definidos no servidor. Campos extras são rejeitados.

Respostas do cadastro: 201 criado, 400 dados inválidos, 409 duplicidade, 415 formato incorreto, 429 limite de tentativas, 503 capacidade temporariamente esgotada e 500 erro genérico. CPF e hash de senha não são retornados. A senha deve ter de 8 a 128 caracteres; o hash usa scrypt com salt aleatório. Não há login automático. O cadastro feito por administrador usa as mesmas validações e grava uma senha provisória.

O .env contém as credenciais locais e fica fora do Git. A API escuta apenas em 127.0.0.1 por padrão. Para testar pelo iPhone será necessário configurar HOST com o endereço IPv4 local do computador e EXPO_PUBLIC_API_URL no aplicativo. O celular e o computador devem estar na mesma rede. A porta do banco não precisa ser exposta. HTTPS é necessário para disponibilizar a aplicação; o teste local deve usar dados fictícios e uma senha exclusiva de teste.

## Banco e migrações

Os arquivos de migrations/ são aplicados como postgres, na ordem numérica. 001 a 008 são de primeira instalação e não devem ser repetidos em um banco já preparado. 009 a 016 são aplicados juntos e podem ser reaplicados:

    npm run db:activate

O comando abre o psql como postgres, pede a senha no terminal e executa migrations/activate_team.sql, que inclui 009 a 016. Equivalente manual: psql -U postgres -d maridao -f migrations/activate_team.sql. Depois, npm run db:workflows confere a estrutura e avisa se falta migração, chave do chat ou administrador. Reinicie a API depois de aplicar.

| Migração | Conteúdo |
| --- | --- |
| 012_admin_area.sql | Perfil de administrador, situação de aprovação do prestador, senha provisória, marca de conta excluída, registro das decisões (admin_events), aviso de aprovação ou rejeição. |
| 013_request_cancellation.sql | Permissão para encerrar o protocolo de suporte junto com o cancelamento; aviso único por cancelamento. |
| 014_customer_confirmed_completion.sql | Status Aguardando confirmação, data do registro da conclusão e quem confirmou; a API perde a escrita nas colunas do código de 4 dígitos; avisos da conclusão. |
| 015_proposal_versions.sql | Status Expirada e tabela proposal_versions (versões Substituídas, só leitura e inclusão); avisos de reenvio e expiração. |
| 016_customer_self_deletion.sql | Autor da ação em admin_events (administração, cliente ou prestador); textos novos dos avisos de aceite, cancelamento e aprovação. |

Detalhes em docs/banco-de-dados.md.

## Scripts novos

| Comando | Para que serve |
| --- | --- |
| npm run admin:create | Cadastra o primeiro administrador. Pergunta nome, e-mail e senha provisória (sem eco, duas vezes); sem terminal interativo lê ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD. Não aceita argumentos. A conta nasce com troca de senha obrigatória. |
| npm run requests:auto-confirm | Confirma as conclusões que aguardam resposta do cliente há 7 dias ou mais. |
| npm run proposals:expire | Marca como Expirada a proposta pendente cuja validade passou. |

As duas passadas também rodam sozinhas: quando a API inicia, a cada 10 minutos e antes das leituras e ações sobre pedidos e propostas. Não há agendador externo.

## Convenções das rotas

- Autenticação: cabeçalho Authorization: Bearer com o token devolvido por POST /auth/login (12 horas).
- Toda rota que não é GET exige Content-Type: application/json, mesmo sem campos (enviar {}). Campos não previstos são rejeitados.
- Erro: sempre {"error": "mensagem"}; algumas respostas trazem code (texto estável para o aplicativo decidir a tela), fields (mensagem por campo) e status (etapa atual).
- Paginação: page a partir de 1, 20 itens, com hasMore.
- Limite de tentativas: 10 por 15 minutos por IP, contador único para login, cadastros públicos, senha, propostas, cancelamento e conclusão. As rotas /admin não usam esse limite.
- Conta com senha provisória pendente só acessa GET /auth/me, POST /auth/logout, POST /auth/provisional-password, GET /catalog e GET /health. As demais respondem 403 com code PASSWORD_CHANGE_REQUIRED.
- Administrador só acessa /auth, /admin, POST /account/password, GET /catalog e GET /health. O restante responde 403 com code ADMIN_AREA_ONLY. Cliente e prestador em /admin recebem 403 com code ADMIN_ONLY.

## Rotas novas

| Rota | Quem | O que faz |
| --- | --- | --- |
| POST /auth/provisional-password | conta com senha provisória | Define a senha definitiva. Corpo: newPassword. Mantém a sessão atual e encerra as outras. |
| GET /admin/users | administrador | Lista clientes e prestadores. Filtros: q (nome, e-mail ou CPF completo), type, status, page. CPF mascarado. |
| GET /admin/users/:id | administrador | Detalhe da conta, com events (registro das decisões, com by e adminName) e cancellations. |
| PATCH /admin/users/:id | administrador | Edita cliente ou prestador. E-mail, CPF e senha não são editáveis. |
| POST /admin/users/:id/deactivate | administrador | Inativa a conta. Corpo: reason. |
| POST /admin/users/:id/delete | administrador | Exclui a conta de cliente e elimina os dados pessoais. Corpo: reason. Prestador não pode ser excluído. |
| POST /admin/customers | administrador | Cadastra cliente com senha provisória. |
| POST /admin/providers | administrador | Cadastra prestador com senha provisória; já entra Aprovado. |
| GET /admin/providers/pending | administrador | Cadastros de prestador Em análise, do mais antigo ao mais recente. |
| GET /admin/providers/pending/:id | administrador | Detalhe do cadastro em análise. Único ponto que devolve o CPF completo. |
| POST /admin/providers/:id/approve | administrador | Aprova. Corpo: {}. |
| POST /admin/providers/:id/reject | administrador | Rejeita. Corpo: reason. |
| POST /admin/admins | administrador | Cadastra outro administrador com senha provisória. |
| POST /requests/:id/cancel | cliente do pedido ou prestador da proposta aceita | Cancela a solicitação. Corpo: reason (opcional só para o cliente em Aberta). |
| POST /requests/:id/completion | prestador da proposta aceita | Registra a conclusão; o pedido passa a Aguardando confirmação. Corpo: {}. |
| POST /requests/:id/completion/confirm | cliente do pedido | Confirma; o pedido passa a Concluída. Corpo: {}. |
| POST /requests/:id/completion/contest | cliente do pedido | Contesta com reason; o pedido volta a Em andamento. |
| GET /requests/:id/proposals/:proposalId/versions | prestador autor ou cliente do pedido | Versão vigente e versões anteriores (Substituída). |

## Rotas alteradas

| Rota | Mudança |
| --- | --- |
| POST /auth/login e GET /auth/me | user traz role (customer, provider ou admin) e mustChangePassword; para prestador, approvalStatus e, se rejeitado, approvalReason. |
| POST /providers | Aceita somente CPF. O cadastro nasce Em análise. |
| GET /providers e GET /providers/:id/profile | Só prestadores Aprovados. O próprio prestador sempre vê o seu perfil. As avaliações trazem author_removed e author_name. |
| POST /requests/:id/proposals | Exige prestador Aprovado (403 com code PROVIDER_NOT_APPROVED). |
| PATCH /requests/:id/proposals/:proposalId | Passa a ser o reenvio: guarda a versão anterior como Substituída e soma 1 em version. Aceita proposta Pendente ou Expirada. Exige prestador Aprovado. |
| POST /requests/:id/proposals/:proposalId/withdraw | Só proposta Pendente com validade em dia. Não soma mais em version. |
| POST /requests/:id/proposals/:proposalId/accept | Recusa proposta Expirada. Só as demais Pendentes válidas viram Não selecionada. |
| GET /requests/:id/proposals | Cada proposta traz can_resend, can_withdraw, can_accept, versions_count, has_previous_versions e sent_at. A proposta Retirada não aparece mais para o cliente. |
| GET /requests e detalhe do pedido | Status Aguardando confirmação; can_cancel, cancellation, can_start, can_report_completion, can_confirm_completion, can_contest_completion, can_review, can_open_support; dados da conclusão (completion_reported_at, completion_deadline_at, completion_confirmed_by, completion_contest). Para o prestador, customer_removed e customer_name. |
| GET /requests/history | cancellation, dados da conclusão e proposal_version, proposal_versions_count, proposal_has_previous_versions. |
| POST /requests/:id/status | Só inicia o atendimento: corpo {"status":"Em andamento"}. Não conclui mais. |
| POST /requests/:id/support | Só reason nao_realizado, com o pedido em Aceita (antes do início). |
| GET /requests/:id/messages | Traz counterpart (a outra parte; nome Usuário removido quando a conta do cliente foi excluída). O envio continua aberto em Aguardando confirmação. |
| GET /account | Traz closure: se a conta pode ser encerrada agora, quantos atendimentos bloqueiam e quantas solicitações abertas seriam canceladas. |
| POST /account/close | Cliente: exclui a conta e elimina os dados pessoais. Prestador: só inativa. A resposta traz action (deleted ou deactivated). Corpo: currentPassword e reason opcional. |
| GET /notifications | request_id pode ser nulo (aviso de aprovação ou rejeição do cadastro). Textos novos para aceite, cancelamento e aprovação. |

## Rotas e campos removidos

| Item | Situação |
| --- | --- |
| POST /requests/:id/completion-code | Removida (404). O código de 4 dígitos não existe mais. |
| POST /requests/:id/status com status Concluída e code | Responde 400. A conclusão usa as rotas /completion. |
| Campo can_confirm | Removido das listas e do detalhe. Usar can_confirm_completion e can_contest_completion. |
| Motivo discordancia em POST /requests/:id/support | Responde 400. A discordância é a contestação da conclusão. |
| CNPJ em POST /providers | Responde 400. |
| Aviso Proposta editada | Não é mais emitido; o reenvio gera Proposta reenviada: confira os novos dados. |

## Testes

    npm run typecheck
    npm run test:unit

test:unit não usa banco (96 testes em 18/11/2026). Os testes de banco só rodam com MARIDAO_DB_TEST=1, o .env preenchido e as migrações aplicadas. Os desta revisão usam dados fictícios dentro de uma transação desfeita ao final:

    MARIDAO_DB_TEST=1 npm run test:admin:db
    MARIDAO_DB_TEST=1 npm run test:cancel:db
    MARIDAO_DB_TEST=1 npm run test:completion:db
    MARIDAO_DB_TEST=1 npm run test:versions:db
    MARIDAO_DB_TEST=1 npm run test:deletion:db

No PowerShell, definir $env:MARIDAO_DB_TEST='1' antes do comando. Os anteriores continuam: test:team:db e test:proposals:db (este aceita também MARIDAO_DB_TEMP=1, ver docs/propostas-historico-rayane.md), com a mesma variável; test:progress:db e test:compatibility:db só fazem consultas e dispensam a variável.

## Estado

Login, sessões, recuperação de senha, cadastro de prestador, propostas, andamento, chat, avaliações, notificações, administração, cancelamento, conclusão confirmada, versões de proposta e exclusão de conta estão implementados. O envio real de e-mail não está: MAIL_MODE=local grava as mensagens em .local-mail/. Pendências em docs/proximas-etapas.md.
