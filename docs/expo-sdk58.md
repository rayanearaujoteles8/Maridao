# Atualização para Expo Go SDK 58 — 27/10/2026

Aplicativo ativo permanece em apps/mobile-sdk57; nome da pasta preservado. Expo e bibliotecas alinhados ao mapa de compatibilidade do SDK 58. Ajustados tipos das referências de ScrollView, componentes vazios de FlatList e tema quando o sistema não informa preferência. Sem alteração da API ou do banco.

O mapa desta versão do Expo indica React Native 0.88.0-rc.3, que conflita com a faixa peer declarada pelo Reanimated 4.7.0 por ser pré-lançamento. Instalação concluída com npm install --legacy-peer-deps, sem configuração global. Conferência expo install --check passou em modo offline usando o mapa local.

Tipos e três testes passaram. Lint configurado com eslint-config-expo; encontrou três erros preexistentes de set-state-in-effect (service-progress, use-catalog e use-color-scheme.web), além de dois avisos. Não foram alterados esses fluxos nesta atualização. Auditoria npm informa três vulnerabilidades altas; não aplicado audit fix --force.

Reiniciar o terminal do Expo com npx expo start --go --clear e escanear novamente. Validar abertura e fluxos no iPhone antes de considerar a migração totalmente validada.
