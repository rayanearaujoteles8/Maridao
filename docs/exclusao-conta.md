# Exclusão e inativação de conta

Revisão de 18/11/2026. Implementa RF01.3 / UC01.3 (fluxo 1, pelo próprio cliente; fluxo 2, pelo administrador), RN10 e RNF02.4. Exige as migrações 012_admin_area.sql e 016_customer_self_deletion.sql, aplicadas por npm run db:activate. Substitui, para o cliente, o encerramento voluntário descrito na entrega de 17/11/2026, que preservava os dados.

## Quem pode o quê

| Conta | Pelo próprio usuário | Pelo administrador |
| --- | --- | --- |
| Cliente | Excluir conta (POST /account/close) | Inativar ou excluir (POST /admin/users/:id/deactivate e /delete) |
| Prestador | Inativar conta (POST /account/close) | Inativar. Prestador nunca é excluído. |

POST /account/close é a mesma rota para os dois papéis. Recebe currentPassword, como confirmação, e reason opcional de até 500 caracteres. A resposta traz action: deleted para cliente e deactivated para prestador. Depois do sucesso o token deixa de valer.

## O que a exclusão do cliente faz

Tudo na mesma transação:

1. A conta é desativada e marcada como excluída; a senha é inutilizada.
2. Os dados pessoais são eliminados: o nome vira Usuário removido; e-mail, telefone, CPF e bairro ficam nulos. O e-mail e o CPF ficam livres para um novo cadastro.
3. Todas as sessões e os códigos de e-mail pendentes são apagados.
4. Cada solicitação Aberta do cliente passa a Cancelada, com evento account_closed. As propostas pendentes dela passam a Não selecionada e cada prestador recebe o aviso "Solicitação cancelada: sua proposta foi encerrada".
5. Solicitações Concluídas e Canceladas, propostas, mensagens e avaliações ficam como estão.
6. A ação é registrada em maridao.admin_events com data, autor e motivo. Na exclusão pelo próprio cliente o autor é o cliente; na feita pela administração, o administrador, e o motivo é obrigatório.

A inativação do prestador mantém os dados, encerra as sessões, retira as propostas pendentes e também fica registrada.

## Quando é recusada

A exclusão e a inativação são recusadas (409, code ACCOUNT_HAS_ACTIVE_REQUESTS) enquanto houver atendimento em curso: solicitação Aceita, Em andamento ou Aguardando confirmação. Para o prestador, vale quando ele é o prestador da proposta aceita. Aberta não bloqueia (é cancelada junto); Concluída e Cancelada não bloqueiam. Senha errada responde 403 com code WRONG_PASSWORD; a senha é conferida antes do bloqueio.

GET /account traz o campo closure, para a tela avisar antes de pedir a senha: action (delete ou deactivate), allowed, activeRequests, openRequests e, quando não pode, o texto pronto em reason. A regra é conferida de novo em POST /account/close.

## Histórico depois da exclusão

A API nunca entregou o nome do cliente ao prestador, e isso não mudou. O que existe agora é a marca de conta excluída, devolvida só ao prestador:

| Onde | Campos |
| --- | --- |
| Pedidos (GET /requests, GET /requests/history e detalhe) | customer_removed, customer_name |
| Chat (GET /requests/:id/messages) | counterpart, com role, removed e name |
| Avaliações (perfil do prestador e avaliação do pedido) | author_removed, author_name |

Quando a marca vem verdadeira, o aplicativo mostra Usuário removido. As mensagens antigas continuam legíveis. Na área administrativa, a conta aparece com status Excluída, nome Usuário removido e sem e-mail, telefone, CPF e bairro; o registro de eventos mostra se a exclusão foi feita pelo próprio usuário ou pela administração.

## No aplicativo

Em Configurações, o cliente vê Excluir conta e o prestador vê Inativar conta. A tela lê closure: se não for permitido, mostra o motivo e não pede a senha; se for, explica a consequência, informa quantas solicitações abertas serão canceladas, pede a senha e, opcionalmente, o motivo. Depois do sucesso apaga a sessão local e volta para a entrada.

## Limites

A eliminação alcança os dados cadastrais da conta. Textos escritos pelo cliente em pedidos, mensagens e avaliações são preservados como histórico. Não há reativação nem recuperação de conta excluída. Não há política de retenção com prazos; ver docs/proximas-etapas.md.

## Verificação

tests/account-deletion.test.ts (unidade) e npm run test:deletion:db com MARIDAO_DB_TEST=1 (banco, em transação desfeita ao final): exclusão pelo cliente, bloqueio com atendimento em curso, prestador só inativado, histórico e avisos.
