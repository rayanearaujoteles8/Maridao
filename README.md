# Maridão

Aplicativo mobile acadêmico para conectar clientes e prestadores de serviços, inicialmente em Palmas–TO.

## Tecnologias

- Aplicativo: React Native, Expo SDK 58, Expo Router e TypeScript.
- API: Node.js 24, Express 5 e TypeScript.
- Banco: PostgreSQL.

## Pastas

- apps/mobile-sdk57: aplicativo ativo. O nome da pasta foi preservado; as bibliotecas estão no SDK 58 (docs/expo-sdk58.md).
- services/api: servidor, testes e migrações SQL.
- docs: requisitos, decisões regionais, instruções do banco e descrição de cada fluxo.

A pasta local apps/mobile é uma tentativa anterior com SDK 58; não faz parte da versão ativa nem do envio ao Git.

## Executar em outro computador

Instale Node.js 24 e PostgreSQL. Na pasta de cada aplicação, execute npm ci.

1. Crie o banco maridao e o usuário limitado maridao_api. Defina a senha interativamente pelo SQL Shell.
2. Aplique, como postgres e na ordem numérica, os arquivos services/api/migrations/001_customer_accounts.sql a 008_replace_open_requests.sql. São scripts de primeira instalação: não repetir em um banco já preparado.
3. Copie services/api/.env.example para .env e preencha as credenciais e as chaves localmente (DOCUMENT_ENCRYPTION_KEY, DOCUMENT_INDEX_KEY e CHAT_ENCRYPTION_KEY, cada uma com 64 caracteres hexadecimais; MAIL_MODE=local). Nunca envie esse arquivo ao GitHub.
4. Na pasta services/api, aplique as migrações 009 a 017 com npm run db:activate. O comando abre o psql como postgres, pede a senha no terminal e executa migrations/activate_team.sql, que inclui os arquivos 009 a 017 na ordem. Esses arquivos podem ser reaplicados. Sem o comando: psql -U postgres -d maridao -f migrations/activate_team.sql.
5. Confira com npm run db:check e npm run db:workflows. O segundo aponta migração ausente, chave do chat e se já existe administrador.
6. Crie o primeiro administrador com npm run admin:create (ver abaixo).
7. Inicie a API com npm run dev.
8. Copie apps/mobile-sdk57/.env.example para .env e configure EXPO_PUBLIC_API_URL com o endereço da API. Para acesso no mesmo Wi-Fi, defina HOST no .env do servidor com o IPv4 do computador.
9. No aplicativo: npx expo start --clear e abra pelo Expo Go, usando o mesmo Wi-Fi; ou npx expo run:ios para compilar e abrir no simulador do iPhone (caminho previsto no roteiro desta revisão).

API e aplicativo devem ser atualizados juntos: o aplicativo desta revisão usa rotas que só existem depois da migração 016.

## Primeiro administrador

Não existe cadastro público de administrador. Na pasta services/api, com as migrações aplicadas:

    npm run admin:create

O comando pergunta nome, e-mail e senha provisória (digitada duas vezes, sem aparecer na tela). Sem terminal interativo, lê ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD do ambiente. Não aceita argumentos e não grava a senha em arquivo. A conta nasce com troca de senha obrigatória: no primeiro acesso o aplicativo abre a tela Criar nova senha antes de liberar a área administrativa. Os demais administradores são cadastrados dentro do aplicativo, por um administrador.

## Comandos da API

| Comando | Para que serve |
| --- | --- |
| npm run dev / npm start | Inicia a API (com e sem recarga automática). |
| npm run db:check | Confere a conexão com o PostgreSQL. |
| npm run db:activate | Aplica as migrações 009 a 017 como postgres. |
| npm run db:workflows | Confere se as migrações 009 a 017 estão aplicadas, a chave do chat, o modo de e-mail e se há administrador. |
| npm run admin:create | Cadastra o primeiro administrador, com senha provisória. |
| npm run requests:auto-confirm | Passada manual da confirmação automática de conclusões sem resposta há 7 dias. |
| npm run proposals:expire | Passada manual que marca como Expirada a proposta pendente com validade vencida. |
| npm run typecheck | Verificação de tipos. |
| npm run test:unit | Testes de unidade, sem banco. |
| npm test | Todos os arquivos de teste; os de banco são pulados sem a configuração do banco. |

A confirmação automática e a expiração não dependem dos comandos manuais: a API faz as duas passadas ao iniciar, a cada 10 minutos e antes das leituras e ações sobre pedidos e propostas.

## Validação

Na API: npm run typecheck e npm run test:unit (96 testes de unidade em 18/11/2026). npm test também executa o teste HTTP local.

Testes de banco, na pasta services/api, com o .env preenchido e as migrações aplicadas. Os sete primeiros só rodam com a variável MARIDAO_DB_TEST=1; usam dados fictícios em transação desfeita ao final ou em tabelas temporárias e não alteram os registros existentes. Os dois últimos só fazem consultas e rodam sempre que o .env está preenchido.

| Comando | Cobre |
| --- | --- |
| npm run test:admin:db | Área administrativa, aprovação de prestador, exclusão de cliente, senha provisória. |
| npm run test:cancel:db | Cancelamento por cliente e prestador, eventos e avisos. |
| npm run test:completion:db | Conclusão registrada, confirmada, contestada e confirmada automaticamente. |
| npm run test:versions:db | Reenvio com versões, expiração gravada. |
| npm run test:deletion:db | Exclusão da conta pelo cliente, inativação do prestador, histórico. |
| npm run test:team:db | Chat, avaliação, notificações, perfil, recuperação e encerramento (tabelas temporárias). |
| npm run test:proposals:db | Propostas e histórico (ver docs/propostas-historico-rayane.md). |
| npm run test:progress:db | Tipos dos parâmetros do início e da confirmação automática; não modifica atendimentos. |
| npm run test:compatibility:db | Compatibilidade de catálogo; só consulta. |

Exemplo no macOS/Linux: MARIDAO_DB_TEST=1 npm run test:admin:db. No PowerShell: $env:MARIDAO_DB_TEST='1' antes do comando.

No aplicativo: npx tsc --noEmit e npm run lint.

## Estado do projeto

Revisão de 18/11/2026. Implementado no código, na API e no aplicativo:

- Cadastro, login e saída de cliente e prestador; recuperação de senha e confirmação de e-mail em modo local; edição de perfil.
- Catálogo pesquisável de 26 categorias, 156 especialidades e 380 bairros, quadras e localidades (docs/catalogos.md).
- Busca e perfil de prestadores, com avaliações.
- Solicitações, propostas, aceite, chat, avaliações, histórico e notificações internas.
- Administração: papel de administrador, lista e gestão de usuários, cadastro de cliente, prestador e administrador com senha provisória, aprovação ou rejeição de prestador. O prestador que se cadastra sozinho fica Em análise e só aparece na busca e envia propostas depois de aprovado. O cadastro de prestador aceita somente CPF. Ver docs/administracao.md.
- Cancelamento da solicitação pelo cliente e pelo prestador da proposta aceita, com motivo, evento e aviso à outra parte. Ver docs/cancelamento-pedidos.md.
- Conclusão confirmada: o prestador registra a conclusão, o pedido fica Aguardando confirmação e o cliente confirma ou contesta; sem resposta em 7 dias a confirmação é automática. O código de 4 dígitos foi removido. Ver docs/andamento.md.
- Versões da proposta: o reenvio guarda a versão anterior como Substituída; a proposta com validade vencida fica Expirada; há tela de versões. Ver docs/propostas.md.
- Exclusão da conta pelo cliente, com eliminação dos dados pessoais; o histórico passa a mostrar Usuário removido. O prestador só é inativado. Ver docs/exclusao-conta.md.
- Aplicativo: tema claro e escuro, abas Início / Profissionais / Pedidos, telas de ação em folha, puxar para atualizar e animações que respeitam Reduzir movimento.

Pendências conhecidas e itens fora da entrega estão em docs/proximas-etapas.md. O plano desta revisão e o que cada lote entregou estão em docs/roteiro-telas-faltantes.md.

## Segurança

Apenas a API acessa o banco. Senhas usam scrypt com salt aleatório. Sessões de 12 horas usam token aleatório e apenas seu hash fica no PostgreSQL. No aplicativo a sessão fica em memória e não persiste após encerramento completo. Consultas parametrizadas, restrições de unicidade e transação protegem a criação de conta e perfil. O administrador não acessa pedidos, propostas, chat nem notificações; o CPF aparece mascarado na área administrativa, exceto no detalhe do cadastro de prestador em análise. Criações, edições, inativações, exclusões, aprovações e rejeições ficam registradas com data, autor e motivo. O limite de tentativas atual é local, em memória, e precisa de armazenamento compartilhado se houver múltiplos servidores.

Os arquivos .env, dependências instaladas, chaves e caches ficam fora do Git. Dados já cadastrados no banco não são enviados ao GitHub. HTTPS e revisão de segurança são necessários antes de disponibilizar a versão pública; os testes em HTTP local devem usar dados fictícios e senha exclusiva de teste.
