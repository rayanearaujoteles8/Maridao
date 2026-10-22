# Próximas etapas e segurança — 22/10/2026

## Regra confirmada pela usuária

Pendente de implementação: criar uma nova solicitação cancela automaticamente as anteriores do mesmo cliente e da mesma categoria apenas quando estiverem Abertas, sem proposta aceita. Preservar Aceita, Em andamento e Concluída. Fazer cancelamento e criação na mesma transação, sem cancelar nada se o novo cadastro falhar; tratar envios concorrentes, propostas pendentes e aceite concorrente. Informar a consequência antes da confirmação e apresentar o resultado real. Testar isolamento entre clientes e categorias, rollback e concorrência.

## Configurações

Pendente: definir e implementar a tela de configurações, incluindo edição de perfil, troca/recuperação de senha e preferências aplicáveis. Não exibir controles sem efeito.

## Verificação de conta

Pendente: confirmação de posse do e-mail por código/link com expiração e limite de tentativas. A usuária solicitou conexão com verificação Google; distinguir Entrar com Google de apenas verificar o endereço informado. Google requer credenciais OAuth do projeto e validação do token no servidor; não comprova CPF, CNPJ ou identidade civil. Não marcar contas existentes como verificadas automaticamente.

CPF/CNPJ: atualmente apenas formato/dígitos e duplicidade local. Consultar situação cadastral externa exige integração própria; existência do documento não comprova que a pessoa é seu titular. Avaliar necessidade e custo antes de contratar serviços.

## Segurança: evidências atuais e pendências

Já presentes: hash scrypt das senhas, tokens aleatórios com hash no banco e expiração de 12 horas, revogação no logout, consultas parametrizadas, validação e autorização no servidor, limites locais no cadastro/login, documentos do prestador com AES-256-GCM e índice HMAC, conta de banco sem superusuário, limite de corpo JSON e respostas sem detalhes internos de erro.

Pendentes: CPF do cliente criptografado (atualmente coluna cpf recebe valor legível); confirmação de e-mail; recuperação/troca segura de senha; HTTPS na implantação (teste local usa HTTP); revisão dos limites nos demais endpoints; configuração segura de hospedagem e segredos; backups e teste de restauração; revisão de dependências; testes de autorização e concorrência completos; definição de privacidade, retenção e exclusão de dados. Não afirmar que o app está pronto para produção nem que foi auditado integralmente.
