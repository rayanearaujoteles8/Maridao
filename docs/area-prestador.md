# Área inicial do prestador

A área do prestador usa o mesmo painel visual do cliente, com conteúdo específico para esse papel: identificação PRESTADOR, nome completo ou razão social sem abreviar, cidade, cartão verde Consultar pedidos e prévia das duas solicitações mais recentes retornadas pela API. Navegação inferior Início/Pedidos e propostas; saída revoga a sessão no servidor.

A prévia usa GET /requests?page=1, que já restringe o prestador aos pedidos compatíveis com seus serviços e cobertura ou às solicitações em que enviou proposta. Não representa totais nem separa propostas de oportunidades. Ver todos abre a lista completa; tocar em uma solicitação abre seus detalhes e propostas. Estados de carregamento, vazio, falha e nova tentativa foram mantidos.

Sem mudanças na API ou no banco. Identidade #A1FF1D, #020300, #FFFFFF e #DCFFA4. Tipos e exportação web passaram. Lint tentado, mas ESLint ainda não está configurado. Conferência visual no iPhone pendente.

## Atualização de 18/11/2026

- O prestador que se cadastra sozinho fica Em análise até um administrador aprovar. O painel mostra o aviso de cadastro em análise ou, se rejeitado, o motivo informado pela administração. Enquanto não for Aprovado, o prestador entra no aplicativo e vê os pedidos, mas não aparece na busca e não envia nem reenvia propostas.
- A decisão gera um aviso em Notificações. Prestador cadastrado por administrador já entra Aprovado.
- O cadastro aceita somente CPF; o botão CNPJ foi retirado.
- As abas do prestador são Início e Pedidos.
- No atendimento, o prestador inicia, registra a conclusão e aguarda a confirmação do cliente; pode cancelar o atendimento aceito ou em andamento, com motivo (docs/andamento.md e docs/cancelamento-pedidos.md).
- Em Configurações, a ação de encerramento do prestador chama-se Inativar conta: os dados são mantidos e a conta não é excluída.
- Tema claro e escuro e puxar para atualizar, como na área do cliente.

A frase acima "Sem mudanças na API ou no banco" refere-se ao refinamento visual de outubro.
