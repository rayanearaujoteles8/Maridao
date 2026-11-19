# Modelo do banco

As três primeiras seções descrevem a primeira migração, de 20/10/2026. A situação atual, com as migrações 001 a 016, está na seção Migrações e estrutura atual, ao final.

## Aplicação da primeira migração

Abra o SQL Shell como postgres e execute:

    \i 'C:/Users/rayan/Documents/Codex/maridao/services/api/migrations/001_customer_accounts.sql'

O arquivo conecta ao banco maridao e cria a estrutura em uma transação. Execute uma vez. Caso haja erro, não recrie nem apague tabelas; confira a mensagem. As tabelas existentes não são substituídas.

## Estrutura

- maridao.accounts: identificador UUID, e-mail normalizado e único, hash de senha e data de criação.
- maridao.customer_profiles: conta vinculada, nome, telefone com DDD, CPF único, bairro, cidade fixa Palmas e UF fixa TO.
- Credenciais e perfil serão inseridos na mesma transação pela API para evitar contas incompletas.

## Segurança e limites

As tabelas pertencem a postgres. O usuário maridao_api tem somente USAGE no esquema e SELECT/INSERT nas duas tabelas. Não tem permissão para alterar a estrutura, excluir ou atualizar registros nesta etapa. Permissões adicionais serão concedidas quando as funcionalidades correspondentes forem implementadas.

O banco exige presença e formato básico. E-mail válido, dígitos verificadores de CPF, limites de entrada e critérios de senha também serão validados no servidor. O campo password_hash nunca deve receber senha em texto simples; a restrição de comprimento não comprova que um hash é seguro.

O CPF do cliente é dado privado e não será retornado em perfis públicos. A criptografia de identificação do prestador prevista em RNF02.2 foi implementada na migração 003 (docs/requisitos.md, Cadastro do prestador). O perfil de prestador e a possibilidade de acumular perfis não são definidos por esta primeira migração.

Não foram criados usuários de demonstração nem armazenadas senhas nesta etapa.

## Migrações e estrutura atual — 18/11/2026

Todas as migrações são aplicadas como postgres, na ordem numérica. O caminho do exemplo acima é o do computador em que a primeira migração foi aplicada; use o caminho local do repositório.

| Arquivo | Conteúdo | Reaplicar |
| --- | --- | --- |
| 001_customer_accounts.sql | Contas e perfil de cliente. | Não |
| 002_sessions.sql | Sessões. | Não |
| 003_provider_profiles.sql | Perfil de prestador, documento criptografado. | Não |
| 004_service_requests.sql | Solicitações. | Não |
| 005_proposals.sql | Propostas. | Ver docs/propostas.md |
| 006_accept_proposal.sql | Aceite e vínculo da proposta escolhida. | Não depois da 008 |
| 007_service_progress.sql | Início e andamento. | Não depois da 008 |
| 008_replace_open_requests.sql | Substituição de pedidos abertos; status Cancelada. | Não depois da 014 |
| 009_proposal_management.sql | version, updated_at e withdrawn_at em proposals. | Sim |
| 010_customer_confirmation.sql | request_events, service_support e regras de estado. | Sim |
| 011_team_workflows.sql | Chat, avaliações, notificações, edição de perfil, recuperação de senha. | Sim |
| 012_admin_area.sql | Administração. | Sim |
| 013_request_cancellation.sql | Cancelamento. | Sim |
| 014_customer_confirmed_completion.sql | Conclusão confirmada pelo cliente. | Sim |
| 015_proposal_versions.sql | Versões da proposta e status Expirada. | Sim |
| 016_customer_self_deletion.sql | Exclusão da conta pelo cliente e textos dos avisos. | Sim |

As migrações 009 a 016 são aplicadas juntas por migrations/activate_team.sql:

    cd services/api
    npm run db:activate

O comando abre o psql como postgres e pede a senha no terminal. Equivalente: psql -U postgres -d maridao -f migrations/activate_team.sql. npm run db:workflows confere, com o usuário da API, se as estruturas e permissões de 009 a 016 existem.

### O que as migrações 012 a 016 acrescentam

| Objeto | Mudança |
| --- | --- |
| maridao.accounts | must_change_password (senha provisória) e deleted_at (conta excluída). O e-mail passa a aceitar nulo, só para conta excluída. |
| maridao.customer_profiles | Telefone, CPF e bairro passam a aceitar nulo, para a eliminação dos dados pessoais na exclusão. |
| maridao.admin_profiles | Nova. Perfil de administrador; o papel é derivado do perfil, como cliente e prestador. |
| maridao.provider_profiles | approval_status (Em análise, Aprovado, Rejeitado), approval_reason, approval_decided_at e approval_decided_by. Prestadores anteriores à 012 ficam Aprovado; novos autocadastros nascem Em análise. |
| maridao.admin_events | Nova. Registro das decisões: data, autor, conta alvo, ação e motivo. Desde a 016, actor_kind diz se quem agiu foi a administração, o próprio cliente ou o próprio prestador. |
| maridao.notifications | request_id passa a aceitar nulo, para o aviso de aprovação ou rejeição do cadastro. |
| maridao.service_requests | Status Aguardando confirmação; completion_reported_at e completion_confirmed_by. As colunas do código de quatro dígitos permanecem, zeradas no que era segredo, e a API perde a permissão de escrever nelas. |
| maridao.service_support | A API passa a poder encerrar o protocolo aberto quando o pedido é cancelado. |
| maridao.proposals | Status Expirada. |
| maridao.proposal_versions | Nova. Versões anteriores de cada proposta, sempre Substituída, com o status que tinham ao ser substituídas. |
| Gatilhos de aviso | notify_workflow revisado em 013, 014, 015 e 016; notify_provider_approval (012, texto revisado na 016); notify_cancellation (016), que avisa a outra parte a cada cancelamento registrado em request_events. |

### Permissões

O usuário maridao_api continua limitado. Em admin_events e proposal_versions tem somente SELECT e INSERT: a API não altera nem apaga o registro das decisões nem o histórico de versões. Em admin_profiles tem SELECT e INSERT. Nas demais tabelas recebe UPDATE apenas nas colunas que cada fluxo usa. A decisão dos protocolos de suporte continua restrita a operador do banco (docs/andamento.md).

O CPF do prestador segue criptografado (migração 003). O CPF do cliente segue sem criptografia no banco; é eliminado na exclusão da conta e aparece mascarado na área administrativa.
