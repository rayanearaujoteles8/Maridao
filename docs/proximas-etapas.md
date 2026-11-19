# Estado atual e próximas etapas

Revisão de 18/11/2026. O registro da revisão anterior está em [Entrega da equipe](entrega-equipe-2026-11-17.md); o plano desta revisão e o que cada lote entregou estão em [Roteiro](roteiro-telas-faltantes.md).

## Implementado

Configurações, avaliações, chat, notificações internas e recuperação/validação de e-mail local foram implementados no código na revisão de 17/11/2026. Nesta revisão entraram a área administrativa, o cancelamento da solicitação pelo cliente e pelo prestador, a conclusão confirmada pelo cliente (sem código), as versões da proposta com o status Expirada e a exclusão da conta do cliente com eliminação dos dados pessoais. No aplicativo entraram tema claro e escuro, abas, telas de ação em folha, puxar para atualizar e animações.

Criar novo pedido substitui somente Abertos da mesma categoria e cliente, sem proposta aceita, preservando os demais estados e registrando evento em transação.

## Pendências conhecidas

| Pendência | Situação |
| --- | --- |
| Vibração tátil | Não implementada. Nenhuma ação do aplicativo vibra. |
| Cancelar em Aguardando confirmação | Não é permitido, para cliente nem prestador. O cliente precisa contestar a conclusão (o pedido volta a Em andamento) para então cancelar. |
| react-native-screens duplicado | O aplicativo instala duas versões da biblioteca (a do projeto e a exigida pelo expo-router). Rodar npx expo install --fix em apps/mobile-sdk57 e conferir. |
| Escolha de tema | Só fica guardada no iOS. No Android e na web vale enquanto o aplicativo está aberto; ao reabrir, volta a seguir o sistema. |
| Avisos antigos de notificação | Os avisos gravados antes da migração 016 mantêm o texto antigo. Só os novos usam os textos revisados. |
| Reativar conta e reverter decisão | Não há rota para reativar conta inativada nem para reverter aprovação ou rejeição de prestador. |
| Administradores | Não há rota para listar, editar ou inativar administradores. |
| Protocolos de suporte | A decisão continua pelo banco, por operador autorizado; a área administrativa do aplicativo não os trata. |
| Aparelho físico | A conferência das telas desta revisão em iPhone físico, com fontes ampliadas, não foi registrada. |
| Prints | Os prints das telas novas para o documento acadêmico ainda não foram refeitos. |

## Preparação da implantação

Envio real de e-mail, Google OAuth, hospedagem HTTPS, backups/restauração, criptografia do CPF do cliente, política de retenção e revisão de dependências ficam para a preparação da implantação; não estão implicitamente concluídos. A eliminação dos dados pessoais na exclusão da conta do cliente já existe (docs/exclusao-conta.md), mas não substitui uma política de retenção. O limite de tentativas continua em memória, por instância.

## Fora da entrega

Denúncia, validação documental automática e antecedentes criminais continuam fora da entrega acadêmica atual. A inativação de contas pela administração e a aprovação do cadastro do prestador passaram a existir (docs/administracao.md). A aprovação é uma decisão do administrador sobre os dados informados; não consulta bases externas nem cria selo de identidade verificada. Encerramento voluntário da própria conta é uma ação distinta.
