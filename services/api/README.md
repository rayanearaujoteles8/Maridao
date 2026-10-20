# API do Maridão

Servidor Express com TypeScript no Node.js 24 e PostgreSQL.

## Executar e conferir

    npm run dev
    npm run typecheck
    npm run test:unit
    npm test
    npm run db:check

GET /health verifica apenas o servidor. POST /customers recebe name, email, phone, cpf, neighborhood e password e cria a conta e o perfil do cliente juntos. A cidade é Palmas e o estado TO, definidos no servidor. Campos extras são rejeitados.

Respostas do cadastro: 201 criado, 400 dados inválidos, 409 duplicidade, 415 formato incorreto, 429 limite de tentativas, 503 capacidade temporariamente esgotada e 500 erro genérico. CPF e hash de senha não são retornados. A senha deve ter de 8 a 128 caracteres; o hash usa scrypt com salt aleatório. Não há login automático.

O .env contém as credenciais locais e fica fora do Git. A API escuta apenas em 127.0.0.1 por padrão. Para testar pelo iPhone será necessário configurar HOST com o endereço IPv4 local do computador e EXPO_PUBLIC_API_URL no aplicativo. O celular e o computador devem estar na mesma rede. A porta do banco não precisa ser exposta. HTTPS é necessário para disponibilizar a aplicação; o teste local deve usar dados fictícios e uma senha exclusiva de teste.

## Validação atual

TypeScript e quatro testes unitários passaram, incluindo validação, salt e transação com rollback usando conexão simulada. A gravação real pelo endpoint e o teste pelo iPhone ainda precisam ser realizados no computador da usuária. O ambiente do agente bloqueia conexões locais para testes HTTP. A análise de estilo do mobile permanece pendente por falta das ferramentas.

Login, sessões, recuperação de senha e cadastro de prestador ainda não estão implementados.
