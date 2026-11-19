# Área inicial do cliente

Refinamento visual de Minha conta autorizado pela usuária, seguindo a página inicial aprovada e a identidade Maridão. Cabeçalho com logotipo, identificação de cliente e inicial do nome; saudação e bairro da própria conta; cartão verde Pedir um serviço; atalhos Encontrar profissionais e Meus pedidos; lista dos dois pedidos mais recentes; navegação inferior Início/Buscar/Pedidos e saída da conta.

Todos os controles levam aos fluxos existentes. Pedir um serviço abre nova-solicitacao; Encontrar profissionais/Buscar abre buscar-prestadores; Meus pedidos/Pedidos/Ver todos abre solicitacoes; um pedido recente abre os detalhes e propostas daquele pedido. Início volta ao topo do painel. Não há botões fictícios de perfil, mapas, avaliações, pagamentos ou notificações.

Perfil carregado por GET /auth/me. Somente para clientes, a tela consulta a primeira página de GET /requests e exibe os dois registros mais recentes na ordem fornecida pela API. Sem contadores parciais apresentados como totais. Tratamento de carregamento, lista vazia e falha com nova tentativa; sessão expirada encerra acesso. Ao retornar ao painel, perfil e pedidos são consultados novamente. Nenhuma mudança no banco ou nas permissões da API. Logout mantém a revogação real no servidor antes de limpar a sessão.

Mantidos #A1FF1D, #020300, #FFFFFF e #DCFFA4, com tons neutros auxiliares. Cartões empilhados em telas menores que 350 pontos ou escala de fonte acima de 1,2. Navegação fica fora da rolagem, respeitando a área segura; textos de endereço podem quebrar linha. Rótulos de acessibilidade identificam ações e status.

Casos de uso relacionados: RF03/UC03 (busca), RF04/UC04 (solicitação), RF06.1/UC06.1 (consulta de propostas), RF07.1/UC07.1 (status), RF09.1/UC09.1 (pedidos do cliente) e RF10.2/UC10.2 (logout). Na documentação acadêmica, os novos prints devem continuar identificados pelo RF/UC correspondente.

Verificação de tipos passou. Lint foi tentado; configuração de ESLint segue ausente, sem instalar dependências adicionais. A aparência e a navegação completas no iPhone ainda precisam ser conferidas com a conta real de teste da usuária.

## Atualização de 18/11/2026

- A navegação inferior passou a ser um grupo de abas real: Início, Profissionais e Pedidos. As abas visitadas ficam montadas e guardam a rolagem. Configurações, propostas, chat e demais detalhes abrem por cima das abas.
- O painel e as listas aceitam puxar para atualizar.
- O botão de tema alterna entre claro e escuro. Sem escolha, o aplicativo segue o sistema. As cores da identidade foram mantidas nos dois temas.
- Nova solicitação, Cancelar Solicitação, Avaliar, Confirmar Conclusão e Contestar Conclusão abrem em folha.
- Em Configurações, a ação de encerramento do cliente chama-se Excluir conta e elimina os dados pessoais (docs/exclusao-conta.md).
- Casos de uso acrescentados: UC04.4 (cancelar), UC07.4 (confirmar ou contestar a conclusão), UC09.3 (versões da proposta) e UC01.3 (excluir conta).

A frase acima "Nenhuma mudança no banco ou nas permissões da API" refere-se ao refinamento visual de outubro; os fluxos desta revisão dependem das migrações 012 a 016.
