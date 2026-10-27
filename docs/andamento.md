# Confirmação da conclusão e atendimento de problemas

Revisão vigente de 27/10/2026, relacionada a RF07 e UC07.3. Substitui o fluxo anterior que permitia ao prestador concluir sozinho.

## Ativação

Depois das migrações anteriores, aplicar 009_proposal_management.sql e 010_customer_confirmation.sql como postgres no SQL Shell. Os arquivos declaram UTF8 explicitamente. API e aplicativo devem ser atualizados juntos.

010 cria campos de confirmação, request_events e service_support. Também recria as regras de estado para permitir cancelamento administrativo com preservação do horário de início e corrige a codificação antiga de Concluída. Nenhuma tabela é excluída. As migrações ainda não foram aplicadas ao banco principal pelo agente: a conexão disponível usa maridao_api, sem permissão administrativa.

## Fluxo

Prestador escolhido inicia Aceita → Em andamento. Cliente do pedido confere o serviço e gera código aleatório de seis dígitos, válido por dez minutos, com até cinco tentativas. Novo código invalida o anterior. O servidor guarda resumo com salt, prazo e contador; não guarda o código legível. Somente a resposta de geração ao cliente contém o código. Ele não é enviado nos detalhes ao prestador ou nos logs.

Prestador informa o código recebido do cliente. POST /requests/:id/status só aceita Concluída com code de seis dígitos. Confere sessão, vínculo ao escolhido, etapa, prazo, tentativas e ausência de protocolo aberto. Código válido grava status e horário, invalida código e registra evento na mesma transação. Código inválido incrementa o contador e confirma essa tentativa sem alterar status; o rollback de uma tentativa de conclusão não apaga o contador. Repetição de uma conclusão já persistida preserva horários e não registra outro evento.

POST /requests/:id/completion-code exige cliente proprietário e corpo vazio. Geração limitada pelo controle existente de requisições. Ausência, vencimento, cinco erros e código de outra solicitação não permitem concluir. Não são usados dígitos do telefone.

## Discordância e não realização

Cliente seleciona Relatar problema, escolhe discordancia ou nao_realizado e descreve o ocorrido. POST /requests/:id/support persiste protocolo privado vinculado ao pedido, invalida código anterior e registra evento, tudo em transação. Um pedido só pode ter um protocolo Aberto. Enquanto houver protocolo aberto, não gera nem valida código de conclusão.

GET /requests/:id/support é exclusivo do próprio cliente e retorna os vinte protocolos mais recentes, incluindo resposta e data de resolução. Prestador só recebe a informação de que há análise aberta, sem relato privado do cliente. A interface informa protocolo registrado para análise; não afirma envio de e-mail/push. Não há promessa de SLA/atendimento 24 horas.

Na entrega de teste, a triagem administrativa ocorre pelo banco, por operador autorizado. Não existe portal administrativo no aplicativo nem cadastro público desse papel. Para consultar a fila como postgres:

    SELECT id,request_id,reason,status,created_at FROM maridao.service_support WHERE status='Aberto' ORDER BY created_at,id;

Após verificar as informações com as partes, a administração resolve com justificativa, usando função sem permissão de execução para PUBLIC/maridao_api:

    SELECT maridao.resolve_service_support('UUID_DO_PROTOCOLO','resolver','Justificativa da resolução');

Ou cancela quando a análise conclui que o serviço não ocorreu:

    SELECT maridao.resolve_service_support('UUID_DO_PROTOCOLO','cancelar','Justificativa do cancelamento');

A função usa SECURITY INVOKER, exige privilégios do operador e grava o usuário de banco, decisão, justificativa e data/hora. Resolver mantém Em andamento e permite que o cliente gere novo código; não conclui automaticamente. Cancelar preserva o vínculo à proposta, o início se existente e o histórico, muda proposta escolhida e pedido para Cancelada e registra evento. Não há exclusão nem reembolso automático. Não executar exemplos sem substituir por protocolo real e decisão verificada.

Avaliação pública e comentário de qualidade seguem RF08 após conclusão real. Não forçar Concluída nem criar nota de serviço não realizado para viabilizar o relato. A implementação de avaliações segue com Kaio.

## Rastreabilidade

request_events contém solicitação, autor autenticado ou administração, ação, horário do servidor, estado anterior/novo, motivo e pedido substituto quando aplicável. O cancelamento automático existente agora grava request_replaced na mesma transação do novo pedido; o registro não é somente mensagem de console. Registros antigos sem evento não recebem motivo ou horário inventado.

service_support contém relato privado, estado, decisão, justificativa e operador. Propostas retiradas preservam withdrawn_at e versão desde 009. Não há módulo de denúncia/bloqueio ou validação documental. Proteção de campos cadastrais permanece.

## Verificação

Testes unitários cobrem ausência de código, cliente indevido, validade, tentativas persistentes, bloqueio por protocolo e rollback quando o evento falha. Teste PostgreSQL com tabelas temporárias cobre emissão real, tentativa incorreta, conclusão correta, invalidação, protocolo, bloqueio e cancelamento administrativo preservando histórico. Não altera dados existentes. Privilégios e migração no banco principal, teste simultâneo em duas conexões e interface no iPhone ainda dependem da ativação e validação final.
