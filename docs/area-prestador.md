# Área inicial do prestador

A área do prestador usa o mesmo painel visual do cliente, com conteúdo específico para esse papel: identificação PRESTADOR, nome completo ou razão social sem abreviar, cidade, cartão verde Consultar pedidos e prévia das duas solicitações mais recentes retornadas pela API. Navegação inferior Início/Pedidos e propostas; saída revoga a sessão no servidor.

A prévia usa GET /requests?page=1, que já restringe o prestador aos pedidos compatíveis com seus serviços e cobertura ou às solicitações em que enviou proposta. Não representa totais nem separa propostas de oportunidades. Ver todos abre a lista completa; tocar em uma solicitação abre seus detalhes e propostas. Estados de carregamento, vazio, falha e nova tentativa foram mantidos.

Sem mudanças na API ou no banco. Identidade #A1FF1D, #020300, #FFFFFF e #DCFFA4. Tipos e exportação web passaram. Lint tentado, mas ESLint ainda não está configurado. Conferência visual no iPhone pendente.
