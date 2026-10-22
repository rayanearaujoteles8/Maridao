# Refinamento das telas de solicitações e propostas — issue #1

Aplicado em 22/10/2026 ao app mobile-sdk57: cabeçalho verde com logotipo, títulos e textos por perfil; cartões claros com borda, status legível, data de criação no horário de Palmas, bairro e descrição. Detalhes recolhíveis preservam preferência de data/período e ações de andamento. Acesso às propostas fica disponível sem expandir o cartão, com rótulo adequado para pedidos encerrados.

Propostas têm valor destacado, prazo e validade, indicação visual da proposta aceita e aviso para pedido Cancelado. Formulário de envio segue disponível apenas nas condições existentes. Sem mudança de API, banco, identidade ou regras de aceite/privacidade. Sem filtros locais sobre uma página parcial ou contadores fictícios.

Rastreabilidade: RF04/UC04.1–UC04.3, RF05/UC05.1–UC05.2, RF06/UC06.1–UC06.3, RF07/UC07.1–UC07.3 e consulta de registros RF09. Esta entrega visual não implementa edição/retirada de propostas (#10) nem completa todos os históricos (#12).

Verificação de tipos e três testes mobile passaram. Lint foi tentado; ESLint continua sem configuração. Exportação web usada como verificação de geração. A conferência visual e de navegação no iPhone, incluindo fontes ampliadas, ainda está pendente. Manter issue aberta até essa validação.

Teste manual: cliente abre Meus pedidos, expande/recolhe detalhes, consulta propostas e confirma/cancela um aceite. Prestador abre pedidos compatíveis e proposta enviada; verificar valor, prazo, validade e ações de início/conclusão. Conferir pedido Cancelado sem envio/aceite, lista vazia, falha de rede, atualização e carregar mais. Usar contas fictícias.
