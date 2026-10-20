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
