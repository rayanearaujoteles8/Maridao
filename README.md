# Maridão

Aplicativo mobile acadêmico para conectar clientes e prestadores de serviços, inicialmente em Palmas–TO.

## Tecnologias

- Aplicativo: React Native, Expo SDK 57, Expo Router e TypeScript.
- API: Node.js 24, Express 5 e TypeScript.
- Banco: PostgreSQL.

## Pastas

- apps/mobile-sdk57: aplicativo ativo, compatível com o Expo Go usado no iPhone.
- services/api: servidor, testes e migrações SQL.
- docs: requisitos, decisões regionais e instruções do banco.

A pasta local apps/mobile é uma tentativa anterior com SDK 58; não faz parte da versão ativa nem do envio ao Git.

## Executar em outro computador

Instale Node.js 24 e PostgreSQL. Na pasta de cada aplicação, execute npm ci.

1. Crie o banco maridao e o usuário limitado maridao_api. Defina a senha interativamente pelo SQL Shell.
2. Aplique services/api/migrations/001_customer_accounts.sql e 002_sessions.sql, nessa ordem, como postgres. Scripts de primeira instalação: não repetir em um banco já preparado.
3. Copie services/api/.env.example para .env e preencha as credenciais localmente. Nunca envie esse arquivo ao GitHub.
4. Na API: npm run db:check e npm run dev.
5. Copie apps/mobile-sdk57/.env.example para .env e configure EXPO_PUBLIC_API_URL com o endereço da API. Para acesso no mesmo Wi-Fi, defina HOST no .env do servidor com o IPv4 do computador.
6. No aplicativo: npx expo start --clear. Abra pelo Expo Go, usando o mesmo Wi-Fi.

## Validação

Na API: npm run typecheck e npm run test:unit. npm test também executa o teste HTTP local.
No aplicativo: npx tsc --noEmit. O lint ainda precisa ser configurado e executado.

## Estado do projeto

Cadastro do cliente, campos obrigatórios e bloqueio de duplicidade testados pela usuária no iPhone. Login, logout e tela privada implementados, com migração de sessões aplicada; validação real no iPhone ainda pendente. Hash de senhas e lógica de login testados em unidade; acesso HTTP do ambiente do agente é restrito.

Pendentes: cadastro de prestador, recuperação de senha, busca, solicitações, propostas, chat, avaliações, notificações e demais fluxos do documento. Alertas de dependências do Expo permanecem em análise; não aplicar npm audit fix --force sem revisar compatibilidade.

## Segurança

Apenas a API acessa o banco. Senhas usam scrypt com salt aleatório. Sessões de 12 horas usam token aleatório e apenas seu hash fica no PostgreSQL. No aplicativo a sessão fica em memória e não persiste após encerramento completo. Consultas parametrizadas, restrições de unicidade e transação protegem a criação de conta e perfil. O limite de tentativas atual é local, em memória, e precisa de armazenamento compartilhado se houver múltiplos servidores.

Os arquivos .env, dependências instaladas, chaves e caches ficam fora do Git. Dados já cadastrados no banco não são enviados ao GitHub. HTTPS e revisão de segurança são necessários antes de disponibilizar a versão pública; os testes em HTTP local devem usar dados fictícios e senha exclusiva de teste.
