# Envio e consulta de propostas

Implementa RF05.2/UC05.2 e RF06.1/UC06.1 do documento acadêmico. Prestador abre um pedido compatível na lista e escolhe Ver / enviar proposta. Informa valor total, descrição, prazo estimado e validade. O cliente consulta em Minhas solicitações → Ver detalhes → Ver propostas. O prestador consulta somente a própria proposta nesse pedido.

Aplicar services/api/migrations/005_proposals.sql no SQL Shell como postgres conectado ao banco maridao. A migração cria tabela e índice se não existirem e concede somente SELECT e INSERT ao usuário da API. Pode ser reexecutada na ausência de alterações manuais na estrutura. Não altera as solicitações ou contas existentes. Reiniciar a API e recarregar o Expo após aplicar.

POST /requests/:id/proposals exige prestador autenticado. A conta vem exclusivamente da sessão. Categoria, cidade, UF, cobertura e estado Aberta são verificados no próprio INSERT SELECT, usando a mesma regra da listagem. A unicidade request_id/provider_id impede propostas duplicadas, inclusive em envios concorrentes. Formulário não aceita providerId, status, conta ou campos extras. Não há repetição automática do envio; em falha de conexão, atualizar propostas antes de tentar novamente.

Valor recebido como texto decimal, sem separadores de milhar, com até duas casas decimais; convertido por centavos inteiros antes de armazenar numeric(8,2), entre R$ 0,01 e R$ 999.999,99. Descrição obrigatória até 3000 caracteres, prazo declarativo obrigatório até 200 caracteres, validade obrigatória YYYY-MM-DD válida e não anterior ao dia atual de Palmas. A proposta vale até o fim do dia escolhido em America/Araguaina. A API indica validade encerrada na consulta sem inventar uma mudança de status persistido.

GET /requests/:id/proposals consulta até 20 propostas por página. Cliente só acessa solicitação e propostas próprias; prestador compatível ou com proposta previamente enviada só vê a própria proposta. Respostas incluem nome profissional, valor, descrição, prazo, validade e status, excluindo documentos, e-mail e telefone. UUIDs, páginas e filtros são validados. Proposta começa em Pendente pelo padrão do banco; sem seleção de status pelo aplicativo.

Esta etapa não implementa aceite, edição, retirada, chat ou notificações RF13.1. Não há pagamento no app. As propostas ficam disponíveis para consulta manual; não é apresentado aviso de notificação enviada. Ao implementar aceite, coordenar a alteração do estado da solicitação e o envio de propostas com bloqueio transacional da mesma solicitação, revisando as permissões mínimas necessárias.

Verificação de tipos passou na API e no aplicativo; 26 testes de unidade passaram (23 API e 3 aplicativo). Lint indisponível por ausência de ESLint no ambiente. A integração com PostgreSQL e a interface no iPhone aguardam aplicação da migração e teste da usuária; o ambiente do agente não tem acesso ao banco local.
