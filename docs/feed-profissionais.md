# Feed de profissionais — área do cliente

Escopo autorizado em 22/10/2026: feed de cadastros e filtros, sem implementar avaliações, notas ou reputação. RF03/UC03.1–UC03.3: refinamento da busca e consulta das informações profissionais já existentes. RF08 (#6) e a conclusão de RF12 (#8) continuam com Kaio; não declarar essas issues concluídas por este feed.

A rota buscar-prestadores carrega automaticamente a primeira página de GET /providers ao receber foco, com ordenação e permissões da API existente. Categorias e bairros vêm do catálogo; o filtro de bairro já considera cobertura regional pelo servidor. O botão Buscar aplica escolhas; Limpar filtros volta à lista geral; Atualizar mantém os filtros aplicados. Carregar mais usa a paginação do servidor e evita duplicar IDs. Não apresenta total calculado por uma página parcial.

Cartões mostram nome cadastrado/razão social, cidade, categorias, resumo das especialidades e cobertura. Expandir informações profissionais mostra todas as especialidades e disponibilidade declarada. Avatar é somente a inicial do nome, sem fotografia ou identidade verificada fictícia. Nenhuma nota, média, comentário ou texto sobre funcionalidades técnicas aparece no feed.

Navegação compartilhada no cliente: Início / Profissionais / Pedidos, com aba atual identificada; tocar novamente em Profissionais volta ao topo. Área do prestador mantém navegação própria. A API continua exigindo sessão de cliente para consultar cadastros. Respostas de telas sem foco são descartadas; erros, lista vazia e sessão expirada são tratados. Sem alteração de API, banco, dependências ou credenciais.

Tipos e três testes mobile passaram. Lint tentado, sem configuração de ESLint. Conferir a exportação web e validar no iPhone: abertura automática, categorias, bairro coberto por região, limpeza, vazio, falha de rede, expansão, navegação e segunda página quando houver dados. Usar contas fictícias; teste visual no aparelho ainda pendente.
