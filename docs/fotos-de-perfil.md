# Fotos de perfil

Clientes e prestadores podem abrir Configurações → Foto de perfil, escolher uma imagem, conferir a prévia e salvar. É possível trocar, cancelar a alteração e remover a foto.

As fotos aparecem no cabeçalho da conta, nas configurações e, para prestadores, na busca e no perfil profissional. A inicial do nome continua como alternativa quando não existe foto.

Ativação: na API, executar `npm run db:activate` como postgres e `npm run db:workflows`. A migração 018 cria o armazenamento das fotos. Reiniciar API e Expo; builds nativos precisam ser recompilados para incluir expo-image-picker.

São aceitos JPG, PNG e WebP até 5 MB. O servidor valida o conteúdo, limita a resolução de entrada, transforma a foto em JPEG quadrado de 512 pixels e remove metadados. Acesso autenticado; fotos de outros prestadores seguem a aprovação e a situação da conta. A exclusão dos dados pessoais do cliente também apaga a foto. O armazenamento é no PostgreSQL, sem serviço externo.

Verificado: validação de formatos/dados corrompidos, limite de envio, redimensionamento e remoção de metadados. Ativação no banco real e teste em aparelho ainda pendentes.
