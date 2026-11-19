# Roteiro — telas e fluxos que faltam (18/11/2026)

Branch local `andrey/telas-faltantes`, a partir de `d8cbd4e`. Nada é enviado ao GitHub sem autorização do Andrey.

Base: comparação entre o documento de requisitos revisado (RF01–RF14) e o código em `d8cbd4e`.

## Decisões do Andrey

- Conclusão do serviço: trocar o código de 4 dígitos pelo fluxo do documento (prestador conclui → "Aguardando confirmação" → cliente confirma ou contesta; confirma sozinho em 7 dias).
- Proposta: manter a edição atual e guardar cada versão anterior num histórico ("Substituída"), com tela para consultar.
- Prestador: só CPF; autocadastro fica "Em análise" até um administrador aprovar.
- Conta criada por administrador: senha provisória, troca obrigatória no primeiro acesso.
- Chat: administrador não lê conversas.

## Como o trabalho é organizado

- Cada lote tem um roteiro escrito antes de começar; ao final, o resultado é conferido e as verificações são rodadas.
- Um lote por vez (os lotes mexem nos mesmos arquivos: `auth.ts`, `app.ts`, migrações). Dentro do lote: primeiro banco + API, depois telas.
- Uma revisão por lote. Verificação do lote: `npm run typecheck` e `npm run test:unit` na API; `npx tsc --noEmit` e `npm run lint` no app; percurso clicado no simulador.
- Telas novas seguem o padrão `PrivateScreen` + `usePrivateResource` + `Feedback` + `Button`; rotas novas seguem o wrapper `route(fn)` de `team-routes.ts`.
- Identidade visual: verde `#A1FF1D`, preto `#020300`, branco, verde claro `#DCFFA4` (pasta do Drive do Felipe); estilos de `access-screen.tsx`.
- Migrações novas a partir de `012`, com `GRANT` explícito para `maridao_api`; incluir em `activate_team.sql` e em `check-workflows.ts`.

## Lotes

### Lote 0 — Ambiente local
Aplicar 005–011 no banco de teste, completar o `.env` (`CHAT_ENCRYPTION_KEY`, `MAIL_MODE=local`), gerar o projeto iOS no SDK 58 e subir API + app no simulador.

### Lote 1 — Administração (RF14, UC10.1, UC10.4 fluxo 2, RNF02.3)
- Banco (012): papel de administrador em `accounts`; `approval_status` ('Em análise', 'Aprovado', 'Rejeitado') em `provider_profiles`; tabela de decisões (data, administrador, motivo); marca de senha provisória; prestadores já cadastrados entram como 'Aprovado'.
- API: login de administrador; listar e filtrar usuários; cadastrar, editar e inativar contas; aprovar ou rejeitar prestador; criar administrador; troca obrigatória da senha provisória; busca e propostas só para prestador aprovado; cadastro de prestador só com CPF; script para criar o primeiro administrador.
- Telas: área administrativa (início), Lista de Usuários, Gerenciar Usuário, Cadastros em Análise, Cadastro de Administrador, Trocar Senha Provisória; aviso "cadastro em análise" para o prestador; tirar o botão CNPJ.

### Lote 2 — Cancelar solicitação (UC04.4, RNF02.4)
- API: rota de cancelamento para cliente (Aberta, Aceita, Em andamento) e prestador aceito (Aceita, Em andamento), motivo obrigatório depois do aceite, evento em `request_events`, propostas pendentes → "Não selecionada", notificação à outra parte.
- Telas: Cancelar Solicitação (motivo + confirmação), motivo visível no histórico.

### Lote 3 — Conclusão confirmada pelo cliente (UC07.3, UC07.4)
- Banco (013): status "Aguardando confirmação"; data da conclusão registrada.
- API: prestador registra conclusão; cliente confirma ou contesta com motivo (volta a "Em andamento"); confirmação automática após 7 dias; retirar o código de 4 dígitos. O protocolo de suporte existente é mantido só para "serviço não realizado" antes do início.
- Telas: Confirmar Conclusão e Contestar Conclusão; ajuste do bloco de andamento.

### Lote 4 — Histórico de versões da proposta (UC05.3, UC09.3, UC06.1)
- Banco (014): tabela de versões da proposta; status "Expirada" gravado.
- API: cada edição guarda a versão anterior como "Substituída"; rota para listar versões; aceite não altera propostas expiradas; retirada some da lista do cliente.
- Telas: Versões da Proposta (no detalhe e no histórico); rótulo "Reenviar proposta".

### Lote 5 — Acertos e documentação
Exclusão de conta do cliente com dados pessoais eliminados ("Usuário removido"); textos das notificações de aceite, cancelamento e aprovação; README e `docs/` atualizados; novos prints das telas.

## Situação

Em 18/11/2026. Os lotes 1 a 4 estão nos commits da branch; o lote 5 está no diretório de trabalho, ainda sem commit. Os números das migrações ficaram diferentes do plano: o cancelamento ganhou a 013, e os lotes seguintes avançaram um número.

| Lote | Entregue | Migração |
| --- | --- | --- |
| 1 — Administração | Papel de administrador e login; lista e gestão de usuários; cadastro de cliente, prestador e administrador com senha provisória e troca obrigatória; aprovação e rejeição de prestador; autocadastro Em análise; prestador só com CPF; registro das decisões; npm run admin:create; telas da área administrativa. | 012 |
| 2 — Cancelar solicitação | POST /requests/:id/cancel para cliente e prestador da proposta aceita, com motivo, evento e aviso; tela Cancelar Solicitação; autor e motivo na lista e no histórico. | 013 |
| 3 — Conclusão confirmada | Status Aguardando confirmação; registrar, confirmar e contestar; confirmação automática em 7 dias (npm run requests:auto-confirm); código de 4 dígitos removido; protocolo de suporte só para serviço não realizado antes do início; telas Confirmar e Contestar Conclusão. | 014 |
| 4 — Versões da proposta | Reenvio com a versão anterior Substituída; status Expirada gravado (npm run proposals:expire); rota e tela de versões; proposta Retirada some da lista do cliente. | 015 |
| 5 — Acertos e documentação | Exclusão da conta pelo cliente com dados pessoais eliminados e Usuário removido no histórico; prestador só inativado; autor no registro das decisões; textos novos dos avisos de aceite, cancelamento e aprovação; README e docs atualizados. | 016 |

Além dos lotes, o aplicativo ganhou tema claro e escuro, abas, telas de ação em folha, puxar para atualizar e animações.

Não entregue: novos prints das telas. Pendências conhecidas em docs/proximas-etapas.md. Documentos por assunto: administracao.md, cancelamento-pedidos.md, andamento.md, propostas.md e exclusao-conta.md.
