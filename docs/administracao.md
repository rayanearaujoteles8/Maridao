# Administração

Revisão de 18/11/2026. Implementa RF14 (UC14.1, UC14.3, UC14.4), UC01.1 e UC02.1 fluxo 2, UC10.4 fluxo 2, UC01.3 fluxo 2 e RNF02.3 / RNF02.4. Exige a migração 012_admin_area.sql; a 016 acrescenta o autor ao registro das decisões. As duas entram em npm run db:activate.

## Papel de administrador

O papel é derivado do perfil (maridao.admin_profiles), como cliente e prestador. Não há cadastro público de administrador. O login é o mesmo dos demais (POST /auth/login); a resposta traz role admin e o aplicativo abre a área administrativa.

O administrador só usa as rotas /auth, /admin, POST /account/password, GET /catalog e GET /health. Pedidos, propostas, chat, notificações, busca e /account respondem 403 com code ADMIN_AREA_ONLY. O administrador não lê mensagens do chat. Cliente e prestador em /admin recebem 403 com code ADMIN_ONLY.

## Primeiro administrador

Na pasta services/api, com as migrações aplicadas:

    npm run admin:create

O comando pergunta nome, e-mail e senha provisória (sem eco, duas vezes). Sem terminal interativo, lê ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD do ambiente. Não aceita argumentos; a senha não é impressa nem gravada em arquivo. A conta nasce com troca de senha obrigatória. npm run db:workflows informa quantos administradores ativos existem. Os demais administradores são cadastrados no aplicativo, em Cadastro de Administrador.

## Senha provisória

Toda conta criada por administrador (cliente, prestador ou administrador) e a conta criada por admin:create recebem uma senha provisória. No primeiro acesso, o login devolve mustChangePassword verdadeiro e o aplicativo abre Criar nova senha, sem opção de fechar. POST /auth/provisional-password recebe newPassword (8 a 128 caracteres, diferente da provisória), mantém a sessão atual e encerra as outras.

Enquanto a troca estiver pendente, só respondem GET /auth/me, POST /auth/logout, POST /auth/provisional-password, GET /catalog e GET /health. As demais rotas respondem 403 com code PASSWORD_CHANGE_REQUIRED. Redefinir a senha pelo fluxo de recuperação também encerra a pendência.

## Aprovação do prestador

| Situação | Como chega a ela | Efeito |
| --- | --- | --- |
| Em análise | Autocadastro (POST /providers) | Entra no aplicativo e vê o aviso de cadastro em análise. Não aparece na busca e não envia nem reenvia propostas. |
| Aprovado | Decisão do administrador, cadastro feito por administrador ou cadastro anterior à migração 012 | Aparece na busca e pode propor. |
| Rejeitado | Decisão do administrador, com motivo | Vê o motivo no painel. Não aparece na busca e não propõe. |

A decisão avisa o prestador em Notificações: "Cadastro aprovado: seu perfil aparece nas buscas e você já pode enviar propostas" ou "Cadastro rejeitado: veja o motivo no seu perfil". Esse aviso não pertence a um pedido. Não há rota para reverter uma decisão. O cadastro de prestador aceita somente CPF, no autocadastro e no cadastro feito por administrador.

A aprovação é uma decisão do administrador sobre os dados informados. Não consulta bases externas e não cria selo de identidade verificada.

## Rotas

Todas exigem sessão de administrador sem senha provisória pendente. Não usam o limite de tentativas.

| Rota | O que faz |
| --- | --- |
| GET /admin/users | Lista clientes e prestadores em ordem alfabética, 20 por página. Filtros: q (trecho de nome ou e-mail, ou CPF completo), type (customer, provider), status (ativa, inativa, excluida, em_analise, aprovado, rejeitado). Administradores não aparecem. |
| GET /admin/users/:id | Detalhe da conta, com o registro das decisões (events) e os cancelamentos de pedidos ligados à conta (cancellations). |
| PATCH /admin/users/:id | Edita os mesmos campos que o próprio usuário edita, sem senha atual. E-mail, CPF e senha não são editáveis. Conta inativa ou excluída não é editada. |
| POST /admin/users/:id/deactivate | Inativa cliente ou prestador. Motivo obrigatório. |
| POST /admin/users/:id/delete | Exclui cliente. Motivo obrigatório. Prestador não pode ser excluído, só inativado. |
| POST /admin/customers | Cadastra cliente com senha provisória. |
| POST /admin/providers | Cadastra prestador com senha provisória; já entra Aprovado e não gera aviso. |
| GET /admin/providers/pending | Cadastros Em análise, do mais antigo para o mais recente. |
| GET /admin/providers/pending/:id | Detalhe do cadastro em análise, com o CPF completo. |
| POST /admin/providers/:id/approve | Aprova, com motivo obrigatório. |
| POST /admin/providers/:id/reject | Rejeita, com motivo obrigatório. |
| POST /admin/admins | Cadastra administrador com senha provisória. |

Inativar encerra as sessões, cancela os pedidos abertos do cliente e retira as propostas pendentes do prestador; o histórico é preservado. Inativar e excluir são recusados enquanto a conta tiver solicitação Aceita, Em andamento ou Aguardando confirmação. Não há rota de reativação. A exclusão está descrita em docs/exclusao-conta.md.

## Privacidade e registro

- O CPF aparece mascarado nas listas e no detalhe da conta. O CPF completo só é devolvido no detalhe do cadastro de prestador enquanto ele está Em análise.
- Conta excluída aparece com o nome Usuário removido e sem e-mail, telefone, CPF e bairro.
- Toda criação, edição, inativação, exclusão, aprovação e rejeição grava em maridao.admin_events a data, o autor, a conta alvo, a ação e o motivo. Motivo é obrigatório em inativação, exclusão, aprovação e rejeição. A API só lê e insere nessa tabela.
- Desde a migração 016 o registro diz quem agiu: a administração, o próprio cliente (exclusão da própria conta) ou o próprio prestador (inativação da própria conta).

## Telas

| Tela | Arquivo em apps/mobile-sdk57/src/app |
| --- | --- |
| Início da área administrativa | admin/index.tsx |
| Lista de Usuários | admin/usuarios.tsx |
| Gerenciar Usuário | admin/usuario.tsx |
| Cadastros em Análise e detalhe | admin/cadastros-em-analise.tsx, admin/cadastro-em-analise.tsx |
| Cadastrar cliente, prestador e administrador | admin/cadastrar-cliente.tsx, admin/cadastrar-prestador.tsx, admin/cadastrar-administrador.tsx |
| Criar nova senha (senha provisória) | trocar-senha-provisoria.tsx |

O aviso de cadastro em análise ou rejeitado aparece no painel do prestador (docs/area-prestador.md).

## Limites

Não há tela nem rota para listar, editar ou inativar administradores, reativar contas ou reverter decisões. Os protocolos de suporte continuam decididos pelo banco (docs/andamento.md). Denúncia de usuários continua fora da entrega.

## Verificação

tests/admin.test.ts (unidade) e npm run test:admin:db com MARIDAO_DB_TEST=1 (banco, em transação desfeita ao final): área administrativa, aprovação de prestadores, exclusão de cliente e senha provisória.
