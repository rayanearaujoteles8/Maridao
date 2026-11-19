# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Créditos

- **Aviso em gota (toast)** — `src/components/toast-drop.tsx` (desenho) e `src/components/toast.tsx` (fila, tempos e acessibilidade).
  O efeito é inspirado no **Sileo**, "An opinionated, physics based toast notification library for react", de Aaryan
  (`hiaaryan` no GitHub): <https://github.com/hiaaryan/sileo>, licença **MIT** como declarada no `package.json` do pacote
  `sileo` (o repositório e o pacote publicado não trazem arquivo de licença nem linha de copyright; por isso ficam aqui o
  nome do projeto, o autor como aparece no GitHub e a licença declarada). O pacote **não está instalado** e nenhum arquivo
  do Sileo foi copiado: do Sileo vêm a ideia da pílula que nasce pequena e se abre e os tempos (≈600 ms, com 150 ms de
  atraso para abrir). O código, o desenho, as medidas, as cores (tokens do Maridão) e as regras de leitor de tela, toque e
  movimento reduzido são deste projeto.
  A gota é desenhada com Skia (`@shopify/react-native-skia`): formas borradas (Blur 7) e cortadas pelo alfa (ColorMatrix,
  alfa × 20 − 10), o que faz gota, corpo e gotinha se fundirem como líquido; mesmo recurso e mesmos números da gota do
  Segue-me (mesmo autor).
- **Ícone e tela de abertura (iOS)** — `assets/images/icon.png` (claro), `icon-dark.png` e `icon-tinted.png`; a tela de
  abertura nativa usa `assets/images/splash-symbol.png` sobre `#020300`, com o símbolo no mesmo lugar e tamanho do primeiro
  quadro de `src/components/intro-animation.tsx`. Mudou algo aqui: `npx expo prebuild -p ios` e novo build (atenção: neste
  SDK o prebuild recria a pasta `ios/` mesmo sem `--clean`).
- **Tema claro e escuro** — tokens em `src/theme/tokens.ts`, provedor e `useTheme()` em `src/theme/index.tsx`, transição da
  troca em `src/components/theme-transition.tsx`. A ideia do botão da lua e da troca com a tela coberta vem do projeto
  Segue-me (mesmo autor); sem código de terceiros.
