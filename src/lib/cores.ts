/**
 * Cores dos gráficos (só nos gráficos; o resto do portal mantém a identidade CAF a preto e branco).
 * Paleta validada para daltonismo (protan/deutan) e para visão normal, em cada par que aparece lado a lado:
 *   entradas:  azul #2a78d6 (contribuições) · verde-água #1baf7a (coletas, transferências e bolsa geral)
 *   saídas:    laranja #eb6834 (custos fixos) · violeta #6250d6 (despesas) · amarelo #eda100 (parte dos gerais)
 *   resultado: azul (positivo) ↔ vermelho #d03b3b (negativo), neutro cinzento
 *   pessoas:   azul, laranja, verde-água, amarelo (jovens e adultos, Jump, crianças, Connect's)
 * O amarelo e o verde-água têm contraste < 3:1 sobre branco: por isso todos os gráficos têm dica ao passar o rato
 * e uma tabela com os mesmos valores (regra de "relief").
 */
export const CORES = {
  entradas: '#2a78d6',
  entradas2: '#1baf7a',
  saidas: '#eb6834',
  saidas2: '#6250d6',
  saidas3: '#eda100',
  positivo: '#2a78d6',
  negativo: '#d03b3b',
  neutro: '#f0efec',
  grelha: '#e6e6e6',
  eixo: '#777777',
  texto: '#333333',
} as const;

/** Ordem fixa das cores categóricas quando a série não tem papel atribuído (nunca reciclar). */
export const CATEGORICAS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'] as const;

/** Cor divergente para um valor entre -max e +max: azul para positivo, vermelho para negativo, neutro perto de zero. */
export function corDivergente(v: number, max: number): { fundo: string; tinta: string } {
  if (!v || !max) return { fundo: 'transparent', tinta: CORES.texto };
  const a = Math.min(1, Math.abs(v) / max);
  const base = v < 0 ? [208, 59, 59] : [42, 120, 214];
  const alpha = 0.12 + a * 0.78;
  return { fundo: `rgba(${base[0]},${base[1]},${base[2]},${alpha.toFixed(2)})`, tinta: alpha > 0.5 ? '#fff' : CORES.texto };
}
