/**
 * Códigos dos ecrãs: aparecem no rodapé (e nas janelas) para se poder dizer exatamente onde se está
 * ao pedir uma alteração ou reportar um problema. Os códigos são fixos: um ecrã novo recebe o seguinte
 * número livre da sua área, e um código nunca é reutilizado.
 *
 * Áreas: PAI Painel · DAD Dados Externos · REG Registos · ANA Análise · TES Tesouraria · ADM Administração ·
 * EXT ecrãs fora do menu (login, página pública, link direto de registo).
 * Ecrãs com separadores acrescentam o número do separador: ADM-01.2.
 */
import { useSyncExternalStore } from 'react';

export interface Ecra { codigo: string; nome: string }

export const ECRAS: Record<string, Ecra> = {
  '/': { codigo: 'PAI-01', nome: 'Painel' },
  '/entradas-conjunto': { codigo: 'DAD-01', nome: 'Entradas: contribuições e depósitos' },
  '/entradas': { codigo: 'DAD-02', nome: 'Contribuir' },
  '/depositos': { codigo: 'DAD-03', nome: 'Depósitos de coletas' },
  '/reembolsos': { codigo: 'DAD-04', nome: 'Reembolsos e despesas' },
  '/registos/presencas': { codigo: 'REG-01', nome: 'Presenças por evento' },
  '/registos/presencas/novo': { codigo: 'REG-02', nome: 'Registar presenças' },
  '/registos/presencas/em-falta': { codigo: 'REG-03', nome: 'Registos em falta' },
  '/registos/batismos': { codigo: 'REG-04', nome: 'Batismos' },
  '/registos/conversoes': { codigo: 'REG-05', nome: 'Conversões' },
  '/analise/resultados': { codigo: 'ANA-01', nome: 'Demonstração de resultados' },
  '/analise/comparacao': { codigo: 'ANA-02', nome: 'Comparação entre comunidades' },
  '/analise/relatorio': { codigo: 'ANA-03', nome: 'Relatório custos x entradas' },
  '/bancos': { codigo: 'TES-01', nome: 'Bancos (extratos e saldos)' },
  '/reconciliacao': { codigo: 'TES-02', nome: 'Reconciliação bancária' },
  '/custos-fixos': { codigo: 'TES-03', nome: 'Custos fixos' },
  '/orcamento': { codigo: 'TES-04', nome: 'Orçamento' },
  '/fecho': { codigo: 'TES-05', nome: 'Fecho mensal e publicação' },
  '/exportacao': { codigo: 'TES-06', nome: 'Exportação contabilista' },
  '/configuracao': { codigo: 'ADM-01', nome: 'Configuração' },
  '/utilizadores': { codigo: 'ADM-02', nome: 'Utilizadores' },
  '/auditoria': { codigo: 'ADM-03', nome: 'Auditoria' },
  '/pedidos': { codigo: 'ADM-04', nome: 'Bugs e melhorias' },
  '/pesos': { codigo: 'ADM-05', nome: 'Peso das comunidades' },
  '/pessoas': { codigo: 'ADM-06', nome: 'Pessoas (dados de referência)' },
  '/publico': { codigo: 'EXT-02', nome: 'Página pública' },
  '/registar': { codigo: 'EXT-03', nome: 'Registo de presenças (link direto)' },
};

/** O ecrã de login aparece em qualquer endereço; tem código próprio. */
export const ECRA_LOGIN: Ecra = { codigo: 'EXT-01', nome: 'Entrar' };

/** Ecrã de um endereço (sem o "#"); endereços desconhecidos não têm código. */
export function ecraDe(caminho: string): Ecra | null {
  const limpo = caminho.replace(/\/+$/, '') || '/';
  return ECRAS[limpo] ?? null;
}

/** Código completo, com o separador quando existe: "ADM-01.2". */
export const codigoCompleto = (e: Ecra, aba?: number | null) => (aba ? `${e.codigo}.${aba}` : e.codigo);

// ---------- separador ativo (para o sufixo do código) ----------
let abaAtual: number | null = null;
const ouvintes = new Set<() => void>();
export function definirAba(n: number | null) {
  if (abaAtual === n) return;
  abaAtual = n;
  ouvintes.forEach((f) => f());
}
export function useAbaEcra(): number | null {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => abaAtual, () => abaAtual);
}
