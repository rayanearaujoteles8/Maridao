// Tokens de cor do Maridão: um nome por papel, com o valor de cada tema. Nenhuma tela escreve cor fora daqui.
// Os pares de texto e fundo foram calculados (WCAG 2.1): texto normal ≥ 4,5:1 nos dois temas.

export type ThemeName = 'light' | 'dark';

const light = {
  // Fundos
  bg: '#FFFFFF',              // fundo das telas
  surface: '#F3F6EF',         // bloco discreto sobre o fundo (etiquetas, cartões de apoio)
  surfaceRaised: '#FFFFFF',   // cartão com borda, campo e diálogo
  surfacePressed: '#EDF3E6',  // superfície sob o dedo
  // Texto sobre bg, surface e surfaceRaised
  text: '#020300',
  textSoft: '#46503C',
  textMuted: '#526047',
  placeholder: '#64705C',
  disabledText: '#A4AC9D',    // dia que não pode ser escolhido (fora da regra de contraste, é inativo)
  link: '#43552E',            // verde legível como texto, ponto ou contorno sobre o fundo
  // Linhas
  border: '#DDE6D4',
  borderStrong: '#A4AF98',    // contorno de campo
  borderBold: '#64705C',      // contorno de campo mais marcado (entrar, cadastro)
  // Destaque da marca
  accent: '#A1FF1D',
  onAccent: '#020300',
  onAccentMuted: '#263715',
  accentSoft: '#DCFFA4',
  onAccentSoft: '#020300',
  onAccentSoftMuted: '#39482B',
  accentWash: '#F0FFDF',      // verde quase branco: hoje no calendário, minha mensagem
  // Bloco de tinta: os cartões pretos da marca. No escuro vira superfície elevada com borda.
  ink: '#020300',
  inkBorder: '#020300',
  onInk: '#FFFFFF',
  onInkAccent: '#A1FF1D',
  onInkSoft: '#DCFFA4',
  inkLine: '#4A5A38',
  // Ação principal: preta no claro, verde no escuro
  primary: '#020300',
  onPrimary: '#FFFFFF',
  onPrimaryAccent: '#A1FF1D',
  // Neutro (etiqueta apagada)
  neutral: '#EFF1EC',
  onNeutral: '#535D4A',
  // Erro
  danger: '#A32121',
  dangerSoft: '#FBECEC',
  // Véu atrás de diálogo
  scrim: 'rgba(2,3,0,0.5)',
};

export type ThemeColors = { readonly [K in keyof typeof light]: string };

const dark: ThemeColors = {
  bg: '#020300',
  surface: '#0F130A',
  surfaceRaised: '#171C10',
  surfacePressed: '#20281A',
  text: '#F3F7EC',
  textSoft: '#C7D1BA',
  textMuted: '#A2AF92',
  placeholder: '#909D80',
  disabledText: '#5A6550',
  link: '#BDEB70',
  border: '#2B3421',
  borderStrong: '#5C6B4D',
  borderBold: '#7C8A6C',
  accent: '#A1FF1D',
  onAccent: '#020300',
  onAccentMuted: '#263715',
  accentSoft: '#223409',
  onAccentSoft: '#E6FFC0',
  onAccentSoftMuted: '#BFDC93',
  accentWash: '#141D0A',
  ink: '#171C10',
  inkBorder: '#36422A',
  onInk: '#F3F7EC',
  onInkAccent: '#A1FF1D',
  onInkSoft: '#DCFFA4',
  inkLine: '#4A5A38',
  primary: '#A1FF1D',
  onPrimary: '#020300',
  onPrimaryAccent: '#020300',
  neutral: '#232A1B',
  onNeutral: '#B4C0A4',
  danger: '#FF8F85',
  dangerSoft: '#2F1412',
  scrim: 'rgba(0,0,0,0.68)',
};

export const themes: Record<ThemeName, ThemeColors> = { light, dark };

// Cor da cobertura da troca de tema e do palco da abertura: o preto da marca, igual nos dois temas.
export const BRAND_BLACK = '#020300';
export const BRAND_GREEN = '#A1FF1D';
