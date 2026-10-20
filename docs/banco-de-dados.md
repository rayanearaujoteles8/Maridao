# Modelo inicial do banco

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

O CPF do cliente é dado privado e não será retornado em perfis públicos. A criptografia de identificação do prestador prevista em RNF02.2 será tratada antes da implementação desse cadastro. O perfil de prestador e a possibilidade de acumular perfis não são definidos por esta migração.

Não foram criados usuários de demonstração nem armazenadas senhas nesta etapa.
