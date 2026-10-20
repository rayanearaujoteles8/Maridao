# Primeira etapa e rastreabilidade

Fonte: documento de modelagem Maridão versão 1.0, PDF fornecido pela usuária, 73 páginas. A entrega é um aplicativo mobile.

## Escopo confirmado no documento

| Requisito | Caso de uso | Comportamento |
| --- | --- | --- |
| RF01.1 | UC01.1 | Cadastro de cliente com nome, e-mail, telefone, CPF e endereço; impedir CPF duplicado e campos obrigatórios vazios. |
| RF02.1 | UC02.1 | Cadastro de prestador com dados pessoais e profissionais, categorias, especialidades, cidade, bairros e disponibilidade. |
| RF10.4 | UC10.4 | Vincular e-mail e senha ao cadastro; validar e-mail, duplicidade e critérios de senha. |
| RF10.1 | UC10.1 | Login com e-mail e senha, tratamento de campos vazios e credenciais inválidas. |
| RF10.2 | UC10.2 | Encerrar sessão e voltar à tela de login. |
| RF10.3 | UC10.3 | Recuperação por link/código enviado por e-mail e definição de nova senha. |
| RNF02 | Autenticação | Proteger funcionalidades privadas; cadastro, login e recuperação precisam ser acessíveis sem sessão. |
| RNF02.2 | Privacidade | Criptografar documentos de identificação do prestador e mensagens armazenadas; restringir acesso às partes autorizadas. |

## Decisões ainda necessárias

1. UC02.1 alterna entre CNPJ e CPF/CNPJ. Confirmar documentos aceitos antes de finalizar o formulário e o banco.
2. Confirmar campos exatos do endereço do cliente; o documento cita endereço e localização, incluindo cidade e bairro.
3. Definir critérios mínimos de senha, duração de sessão e validade de tokens; o documento não fornece valores.
4. Confirmar se a mesma pessoa pode ter perfis de cliente e prestador.
5. Definir permissões e criação controlada de administradores; não oferecer perfil administrador no cadastro público.
6. O RNF de agenda menciona conflitos de horário, mas o escopo exclui reserva e descreve disponibilidade declarativa. Não implementar agendamento antes de esclarecer.
7. Recuperação de senha menciona informar e-mail inexistente; propor resposta neutra para evitar exposição de contas, registrando a alteração para aprovação.
8. Esclarecer validação de identidade e moderação citadas nos RNFs sem fluxo completo correspondente.

## Ordem de implementação

1. Gerar o projeto mobile e executar a tela inicial no celular.
2. Resolver dúvidas de cadastro e definir contrato da API e modelo PostgreSQL.
3. Implementar cadastro e criação de credenciais juntos, em transação.
4. Implementar login, autorização e logout.
5. Implementar recuperação de senha com envio real ou serviço local de teste identificado.
6. Validar duplicidades, entradas inválidas, sessão expirada e tentativas de acesso a dados de outra conta.

Nenhum item desta lista está marcado como implementado.

## Delimitação regional aprovada

Em 20/10/2026, a usuária definiu a primeira versão para Palmas–TO. No cadastro do cliente, cidade e UF serão fixas e o bairro será informado manualmente. O endereço desta versão corresponde a cidade e bairro; rua, número, complemento e CEP ficam fora desta etapa. Sem GPS, mapas ou consulta de CEP. Esta decisão detalha RF01.1/UC01.1 e deve ser incorporada ao documento acadêmico.

O formulário atual faz apenas conferência local de obrigatoriedade, formato de e-mail e telefone com DDD, e dígitos verificadores de CPF. Não comprova identidade nem consulta duplicidade. Não salva dados nem cria credenciais. A política de senha e todas as validações autoritativas serão implementadas no servidor na etapa de autenticação.

## Implementação do cadastro de cliente

POST /customers implementa RF01.1 e RF10.4. Recebe name, email, phone, cpf, neighborhood e password; cidade e UF são definidas pelo servidor. O servidor valida os dados, normaliza e-mail, telefone e CPF, usa consultas parametrizadas e grava conta e perfil na mesma transação. Duplicidades são impedidas também pelos índices do banco. Não envia CPF nem hash na resposta. Não cria sessão ou login automático.

Critério de senha atualizado por solicitação da usuária em 20/10/2026: 8 a 128 caracteres, sem obrigatoriedade de símbolos ou maiúsculas, aceitando frases longas. Hash scrypt nativo do Node.js com N=131072, r=8, p=1 e salt aleatório de 16 bytes por senha. Registrar esse detalhamento no UC10.4.

Limite local: 10 tentativas de cadastro por IP em 15 minutos e até dois processamentos simultâneos. Em implantação com múltiplas instâncias, substituir o controle em memória por armazenamento compartilhado. A versão pública requer HTTPS e revisão de segurança; o teste local deve usar dados fictícios e senha exclusiva para teste. A verificação de CPF comprova somente formato e dígitos, não identidade.

A integração real com PostgreSQL e o envio no iPhone ainda dependem do teste no computador da usuária. Login, recuperação de senha e perfil do prestador seguem pendentes.

## Login e logout do cliente

RF10.1/UC10.1: login normaliza o e-mail e compara a senha com scrypt e comparação em tempo constante. E-mail desconhecido e senha incorreta têm a mesma mensagem e custo de derivação. Compartilha com cadastro o limite local de 10 tentativas por IP/15 minutos. A derivação de senha tem limite próprio de duas operações simultâneas.

Sessões: token aleatório de 256 bits, somente SHA-256 do token no PostgreSQL, expiração absoluta de 12 horas verificada no servidor. A resposta de login não contém CPF ou hash de senha. GET /auth/me exige sessão válida e só retorna o perfil da própria conta. POST /auth/logout elimina a sessão, inclusive se já expirada. Sessões expiradas são limpas em novos logins.

RF10.2/UC10.2: botão Sair revoga a sessão no servidor e limpa a memória do app. Se o servidor não confirmar a revogação, o aplicativo pede nova tentativa e não informa sucesso. Token mantido somente em memória, sem persistência; fechar completamente o app exige novo login. Recuperação de senha e persistência segura opcional de sessão são etapas futuras. Não há login de prestador enquanto seu cadastro não estiver implementado.

Aplicar migrations/002_sessions.sql como postgres antes de testar. Testes reais de login, logout e expiração aguardam execução no computador da usuária; os testes de unidade usam repositório simulado.

## Cadastro do prestador

A usuária definiu em 20/10/2026 que o cadastro aceita CPF ou CNPJ. RF02.1/UC02.1 e RF10.4: nome pessoal/profissional, e-mail, telefone, senha de 8 a 128 caracteres, documento escolhido, categorias, especialidades, bairros de Palmas e disponibilidade declarativa. Listas informadas manualmente, sem GPS ou agenda automática. CNPJ aceita formato numérico e alfanumérico, validando seus dígitos conforme Receita Federal; isso não comprova identidade ou situação cadastral.

RNF02.2: documento do prestador armazenado com AES-256-GCM, IV aleatório, autenticação e versão do formato. HMAC-SHA256 com chave independente permite verificar duplicidade sem guardar o documento legível. Chaves somente no .env do servidor, fora do Git. Manter cópia segura das chaves junto à política de backup: perdê-las impede recuperar documentos; a rotação requer migração coordenada de dados e índices.

POST /providers cria conta e perfil em transação. E-mail único em contas; documento único entre prestadores. O vínculo de dois perfis na mesma conta continua pendente e não é criado automaticamente. O login existente passa a aceitar clientes e prestadores com perfil identificado pelo servidor. Não retornar documento, índice ou texto criptografado ao aplicativo.

Aplicar migrations/003_provider_profiles.sql como postgres antes de testar. A integração real depende da execução na máquina da usuária.

O campo de identificação do prestador mostra Nome completo para CPF e Razão social para CNPJ, conforme ajuste solicitado pela usuária, incluindo o rótulo de acessibilidade.

## Busca de prestadores

RF03.1/UC03.1 e RF03.2/UC03.2: cliente autenticado pode filtrar por parte do nome da categoria e do bairro, ignorando maiúsculas e minúsculas. A pesquisa fica restrita a Palmas–TO, com até 20 resultados por página. Campos opcionais permitem listar todos os prestadores cadastrados. RF03.3/UC03.3: o cliente expande o perfil profissional para consultar categorias, bairros, especialidades e disponibilidade declarativa. Avaliações continuam pendentes de RF08; não exibir notas fictícias.

GET /providers verifica sessão e perfil de cliente no servidor. Retorna somente campos profissionais; exclui telefone, e-mail, documento, índice de duplicidade, criptograma e senha. Prestadores recebem 403, sessão ausente/expirada recebe 401. Filtros parametrizados com limite de 100 caracteres. Cadastro/login do prestador e ajuste da rolagem foram confirmados pela usuária no iPhone. Busca e perfil aguardam teste real.
