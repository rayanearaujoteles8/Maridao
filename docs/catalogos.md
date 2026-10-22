# Catálogos de serviços e localidades

## Localidades de Palmas

Fonte: https://iptu.palmas.to.gov.br/pesquisar-cci/ — campo Bairro (Quadra), Endereço antigo. Consulta em 20/10/2026: 383 opções com valor, das quais 3 explicitamente canceladas foram excluídas. As 380 restantes foram preservadas sem gerar quadras por sequência numérica ou acrescentar nomes por suposição. A relação inclui bairros, quadras, distritos, loteamentos e outras localidades/áreas cadastrais; não equivale a afirmar que Palmas possui 380 bairros ou que áreas não cadastradas estejam cobertas.

Arquivo: services/api/data/neighborhoods.json. Valores originais mantidos para evitar correspondências ambíguas. Somente aliases verificados foram acrescentados. Fonte complementar: https://palmas.to.gov.br/core/noticias/zeladoria-urbana-de-palmas-divulga-programacao-de-servicos-da-semana/ . Não há integração externa permanente; os dados acompanham a API e devem ser revisados com atualizações municipais.

## Serviços

26 categorias e 156 especialidades para reparos, manutenção, instalações e apoio residencial/comercial, mantendo o escopo do documento. Lista editorial do Maridão organizada após pesquisa de referências de mercado e do guia do Sebrae. Não é classificação oficial nem cobertura de toda profissão existente. Inclui elétrica, hidráulica, montagem, pintura, climatização, limpeza, jardinagem, vidros e plotagem. Referências: https://www.getninjas.com.br/mapa-do-site e https://sebrae.com.br/Sebrae/Portal%20Sebrae/Territ%C3%B3rios%20Empreendedores/arquivos/Contrata%2BBrasil_Guia_do_Empreendedor.pdf .

Arquivo: services/api/data/services.json. Especialidades dependem das categorias. Outros reparos e instalações permite detalhar necessidades dentro do escopo sem acrescentar automaticamente áreas diferentes.

## Seletores e validação

GET /catalog oferece uma fonte compartilhada para cadastro de cliente, prestador, busca e solicitação. Os seletores permitem pesquisar sem diferenciar acentos e maiúsculas. O prestador pode selecionar até 20 categorias, 20 especialidades e 50 localidades, respeitando os limites atuais. Ao retirar uma categoria, especialidades incompatíveis saem da seleção. A API rejeita valores fora do catálogo e combinações incompatíveis.

Registros antigos não foram apagados ou convertidos por suposição. A busca sem filtros continua mostrando todos os prestadores. Nomes antigos fora do catálogo, como uma localidade genérica Centro, precisam de futura revisão/edição para corresponder às opções atuais.

Não é necessária migração SQL. Reinicie a API para carregar os arquivos e o aplicativo para renovar o cache em memória do catálogo.

## Áreas de atendimento do prestador

O cadastro oferece regiões ou localidades específicas. Toda Palmas abrange qualquer localidade reconhecida do catálogo, incluindo distritos. É uma escolha exclusiva. Clientes e solicitações continuam exigindo uma localidade específica.

As regiões são agrupamentos operacionais do Maridão, não limites administrativos oficiais. A composição é exibida no cadastro antes da escolha: Centro / Plano Diretor reúne identificações cadastrais NE, NO, SE e SO; Taquaralto reúne suas etapas identificadas por TAQ., Santa Fé e Vale do Sol identificados assim no cadastro, e Industrial de Taquaralto; Jardins Aureny I a IV têm opção separada. Demais bairros podem ser selecionados individualmente. Não se afirma que essa relação cubra toda a região sul ou leste. Referência municipal que distingue Taquaralto e Aurenys: https://palmas.to.gov.br/core/noticias/sede-da-subprefeitura-da-regiao-sul-de-palmas-e-inaugurada-no-jardim-aureny-iii/ .

A API guarda identificadores REGIAO: e CIDADE: no campo de áreas de atendimento existente, sem aumentar permissões ou alterar cadastros anteriores. A busca por uma localidade combina áreas específicas, suas regiões correspondentes e Toda Palmas usando parâmetros SQL. Não faz correspondência regional para filtros desconhecidos. Os resultados exibem nomes legíveis. Novas inclusões no catálogo passam a integrar Toda Palmas; alterações na composição de regiões exigem revisão da regra em src/coverage.ts.

Correção em 22/10/2026: incluídos Loteamento Morada do Sol e Morada do Sol setores 01, 02 e 03 na cobertura REGIAO:TAQUARALTO. Estavam omitidos pelo agrupamento inicial, que reconhecia apenas nomes com TAQ. e Industrial de Taquaralto. Referências municipais: https://www.palmas.to.gov.br/core/noticias/familias-da-regiao-sul-ja-podem-se-cadastrar-no-programa-regulariza-palmas/ e https://www.palmas.to.gov.br/core/noticias/criancas-do-setor-morada-do-sol-terao-comemoracao-neste-domingo-13/ .

Os rótulos passam a Morada do Sol 01, 02 e 03, pesquisáveis também por I, II, III e pelos nomes cadastrais antigos. Os valores persistidos MORADA DO SOL - SETOR 01/02/03 permanecem iguais; não é necessário recadastrar ou executar SQL. Busca de prestadores e compatibilidade de pedidos/propostas usam a mesma composição corrigida. Listas de pedidos e detalhes de propostas recebem neighborhood_label, com fallback para o valor anterior. Reiniciar a API e recarregar o aplicativo para renovar o catálogo.

Compatibilidade com registros anteriores ao catálogo: a comparação de categorias ignora diferenças de caixa/espaços externos e reconhece Montagem de móveis como nome antigo de Montagem e desmontagem de móveis. A área legada Taquaralto corresponde a REGIAO:TAQUARALTO. A regra é compartilhada pela listagem de pedidos e envio de propostas e aplicada também à busca de prestadores. O mapa admite pedidos antigos com bairro genérico Taquaralto, sem convertê-los para um bairro específico. Não há alteração dos dados persistidos. Outras categorias e áreas desconhecidas não são convertidas por suposição.

Verificação de 22/10/2026: consulta somente leitura confirmou cadastro antigo com serviço de montagem e área Taquaralto. Pedido de hidráulica não é compatível com montagem, mesmo na mesma região. Teste PostgreSQL de regressão em tests/catalog-compatibility.database.test.ts executa apenas SELECT com dados sintéticos; executar npm run test:compatibility:db para validar casos de nomes antigos, bairros da região, serviço incompatível e pedido fechado.
