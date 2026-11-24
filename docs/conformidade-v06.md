# Conformidade com a documentação v0.6

Revisão de 24 de novembro de 2026, após a integração local da PR #23.

## Correções implementadas

- RNF02.3: aprovação e rejeição exigem motivo de até 500 caracteres na tela e na API. O motivo fica junto ao responsável e à data da decisão; decisões antigas não recebem motivos inventados.
- UC13.1: eventos geram uma entrada durável em `notification_outbox`. A entrega é executada a cada cinco segundos, separada da transação de atendimento. Falhas registram o código SQL e o número de tentativas, com espera crescente até cinco minutos. A chave de entrega impede duplicação em uma repetição. Falha de entrega não desfaz pedidos, propostas ou mensagens. A gravação inicial do evento na fila continua atômica com a operação: perda do próprio banco não é tratada como entrega bem-sucedida.
- RNF01.1: enquanto o aplicativo estiver ativo, ele consulta novos avisos a cada dez segundos e os apresenta na interface. Ao voltar ao primeiro plano, consulta imediatamente. As permissões da sessão continuam valendo. Não há push com o aplicativo fechado. Cinco segundos de processamento mais dez de consulta é a meta nominal; rede indisponível, sobrecarga e filas com falha impedem garantir entrega em 30 segundos. Medição no ambiente de demonstração permanece necessária.
- UC12.1: o prestador tem um botão no início para consultar o próprio perfil e suas avaliações, inclusive enquanto o cadastro estiver em análise. A API já restringe a consulta de perfil não aprovado ao próprio titular.
- Ações que eram texto sublinhado receberam aparência de botão, preservando ações e permissões existentes.

## Ativação local

Na pasta `services/api`, executar `npm run db:activate` como de costume, informando a senha de postgres somente no terminal. O ativador agora inclui a migração 017 e pede a senha uma vez. Depois executar `npm run db:workflows`. Reiniciar a API e o Expo.

O trabalhador da fila requer a migração 017. A migração preserva avisos existentes; só os eventos novos passam pela fila. Não recria avisos de eventos antigos. Não alterar as migrações anteriores para contornar a atualização.

A 017 também remove a restrição antiga que proibia motivo em aprovações e exige motivo em novas decisões por um gatilho. O ativador reconhece a base já atualizada e não reaplica 009 a 016 sobre ela. A usuária aplicou a atualização e a verificação do banco confirmou a fila e a regra de aprovação em 24/11/2026.

## Recuperação de senha

A usuária informou que ainda não possui serviço de envio. O modo local continua identificado como teste e não envia mensagens reais. A integração de e-mail permanece pendente de escolha do serviço e configuração de credenciais fora do chat. A resposta neutra para e-mail desconhecido foi preservada, conforme a decisão da conversa; o UC10.3 precisa refletir essa decisão.

## Alinhamentos documentais ainda necessários

- O escopo permite cancelar enquanto a solicitação não estiver concluída; RN05 e 7.5 limitam a Aberta, Aceita e Em andamento. O código segue RN05, sem cancelamento direto em Aguardando confirmação.
- RN10 e RF01.3 omitem Aguardando confirmação, mas o aplicativo a trata como atendimento ativo e impede excluir a conta nessa etapa. A usuária confirmou em 24/11/2026 a manutenção dessa proteção. O texto normativo fica: cliente ou prestador com solicitação Aceita, Em andamento ou Aguardando confirmação não pode excluir ou inativar a conta.
- Itens 11 e 13: atualizar capturas, abas, nomes dos botões e telas já implementadas. A existência de uma tela não comprova validação no aparelho.
- Item 9: explicitar o mapeamento do modelo conceitual para contas/perfis, catálogo e histórico de versões em tabelas. Não é necessário transformar cada entidade conceitual em uma classe TypeScript para preservar o comportamento.
- P4 deixa a escala da nota em aberto; o código usa números inteiros de 1 a 5. Registrar a escala aprovada pelo grupo.

O documento Word original não foi modificado nesta revisão. Desempenho, disponibilidade, teste com cinco usuários e navegação completa no aparelho continuam sujeitos a verificação; não declarar conformidade total somente por testes de código.

## Verificação

Executar TypeScript da API e do app, lint do app e testes unitários. Para a fila: definir `MARIDAO_DB_TEST=1` no terminal e executar `npm run test:notifications:db`. O teste usa apenas tabelas e funções temporárias e verifica falha de entrega, nova tentativa, ausência de duplicação e reversão da origem do evento. Não exige aplicar a migração no banco real para validar sua lógica.

Verificações concluídas nesta revisão: 97 testes unitários da API; suíte padrão com 98 testes aprovados e dez integrações condicionais não executadas por esse comando; teste explícito da fila em PostgreSQL e integração administrativa no banco real (com reversão integral da transação), ambos aprovados; TypeScript da API e do aplicativo, lint e três testes do aplicativo aprovados. A API respondeu ao health check após a atualização. Isso não substitui os percursos visuais no celular nem valida os requisitos de desempenho e disponibilidade.
