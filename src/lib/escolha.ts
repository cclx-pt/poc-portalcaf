/**
 * Listas com procura (categorias, centros de custo, projetos, fornecedores, contas analíticas) e criação de um valor
 * novo a partir da lista (centros de custo, projetos ou eventos e fornecedores).
 */
import { norm, slug } from './format';
import type { Dimensao } from './types';

export interface OpcaoEscolha { valor: string; rotulo: string; detalhe?: string }

const chave = (s: string) => norm(s).replace(/\s+/g, ' ').trim();

/** Opções que têm todas as palavras escritas (sem maiúsculas nem acentos), no rótulo ou no detalhe. */
export function filtrarOpcoes(opcoes: OpcaoEscolha[], texto: string): OpcaoEscolha[] {
  const palavras = chave(texto).split(' ').filter(Boolean);
  if (!palavras.length) return opcoes;
  return opcoes.filter((o) => { const t = chave(`${o.rotulo} ${o.detalhe ?? ''} ${o.valor}`); return palavras.every((p) => t.includes(p)); });
}

/** Há texto escrito e ainda não é uma das opções (pelo rótulo ou pelo valor). */
export function podeCriarOpcao(opcoes: OpcaoEscolha[], texto: string): boolean {
  const k = chave(texto);
  return !!k && !opcoes.some((o) => chave(o.rotulo) === k || chave(o.valor) === k);
}

/** Nova dimensão a partir do texto escrito. Centro de custo: o código seguinte (CC16) ou o escrito ("CC20 Jovens"). */
export function novaDimensao(tipo: Dimensao['tipo'], texto: string, existentes: Dimensao[]): Dimensao {
  const t = texto.trim().replace(/\s+/g, ' ');
  if (tipo === 'centro') {
    const m = /^(CC\d+)\s+(.+)$/i.exec(t);
    const codigo = m ? m[1].toUpperCase() : `CC${String(1 + Math.max(0, ...existentes.filter((d) => d.tipo === 'centro').map((d) => Number(/^CC(\d+)$/i.exec(d.codigo ?? '')?.[1] ?? 0)))).padStart(2, '0')}`;
    return { id: `centro-${slug(codigo)}`, tipo, codigo, nome: m ? m[2] : t, ativo: true };
  }
  return { id: `${tipo}-${slug(t)}`, tipo, nome: t, ativo: true };
}

/** Valor que fica escolhido nos formulários: o código no centro de custo, o nome nos outros. */
export const valorDaDimensao = (d: Dimensao) => (d.tipo === 'centro' ? d.codigo ?? d.nome : d.nome);

/** Opções de uma lista de dimensões (centro de custo: "CC05 Eventos"). */
export const opcoesDimensoes = (ds: Dimensao[]): OpcaoEscolha[] =>
  ds.map((d) => ({ valor: valorDaDimensao(d), rotulo: d.tipo === 'centro' && d.codigo ? `${d.codigo} ${d.nome}` : d.nome, ...(d.ambito ? { detalhe: d.ambito } : {}) }));

/** Opções de uma lista de categorias (o valor é o nome, ex.: "02.01 Rendas e condomínios"). */
export const opcoesCategorias = (cs: { nome: string }[]): OpcaoEscolha[] => cs.map((c) => ({ valor: c.nome, rotulo: c.nome }));
