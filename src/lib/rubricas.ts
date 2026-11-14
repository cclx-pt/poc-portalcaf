/** Rubricas da demonstração de resultados e classificação das categorias (âmbito local ou geral). */
import { norm } from './format';
import type { Categoria } from './types';

export const RUBRICAS_ENTRADA = ['Dízimos', 'Ofertas', 'Outras contribuições', 'Pagamentos (eventos, inscrições)', 'Outros rendimentos'] as const;
export const RUBRICAS_SAIDA = ['Vencimentos e encargos', 'Instalações', 'Consumíveis e funcionamento', 'Donativos e ofertas', 'Atividades e eventos', 'Outros gastos'] as const;
/** Rubrica onde entram, agregadas, as categorias de nível confidencial. */
export const OUTROS_FUNCIONAMENTO = 'Outros custos de funcionamento';

type Tipo = Categoria['tipo'];

const INICIAL: Record<Tipo, Record<string, string>> = {
  entrada: {
    dizimos: 'Dízimos', ofertas: 'Ofertas', 'coletas em dinheiro': 'Ofertas',
    missoes: 'Outras contribuicoes', 'acao social': 'Outras contribuicoes', obras: 'Outras contribuicoes',
    eventos: 'Pagamentos', 'outras entradas': 'Outros rendimentos',
  },
  saida: {
    vencimentos: 'Vencimentos e encargos', 'seguranca social': 'Vencimentos e encargos',
    renda: 'Instalações', luz: 'Instalações', agua: 'Instalações', internet: 'Instalações',
    'comissoes bancarias': 'Consumíveis e funcionamento',
    missoes: 'Donativos e ofertas', 'acao social': 'Donativos e ofertas',
    cultos: 'Atividades e eventos', jovens: 'Atividades e eventos', criancas: 'Atividades e eventos', eventos: 'Atividades e eventos',
    'outras despesas': 'Outros gastos',
  },
};
const POR_CHAVE: Record<string, string> = { 'Outras contribuicoes': 'Outras contribuições', Pagamentos: 'Pagamentos (eventos, inscrições)' };

/** Chave de comparação: sem acentos/maiúsculas e no plural simples ("Dízimo" ↔ "Dízimos"). */
function chave(nome: string) {
  const n = norm(nome);
  return n.endsWith('s') ? n : `${n}s`;
}

/** Rubrica proposta para uma categoria pelo nome (sem correspondência: "Outros rendimentos"/"Outros gastos"). */
export function rubricaInicial(nome: string, tipo: Tipo): string {
  const n = norm(nome);
  const t = INICIAL[tipo];
  const r = t[n] ?? t[chave(nome)] ?? Object.entries(t).find(([k]) => chave(k) === chave(nome))?.[1];
  if (!r) return tipo === 'entrada' ? 'Outros rendimentos' : 'Outros gastos';
  return POR_CHAVE[r] ?? r;
}

export interface Classificacao { rubrica: string; ambito: 'local' | 'geral'; confidencial: boolean }

/** Devolve uma função que classifica um nome de categoria (do Jotform, banco ou custo fixo) pela lista configurada. */
export function classificador(categorias: Categoria[]): (nome: string, tipo: Tipo) => Classificacao {
  const mapa = new Map<string, Categoria>();
  for (const c of categorias) mapa.set(`${c.tipo}|${chave(c.nome)}`, c);
  return (nome, tipo) => {
    const c = mapa.get(`${tipo}|${chave(nome)}`);
    return {
      rubrica: c?.rubrica || rubricaInicial(c?.nome ?? nome, tipo),
      ambito: c?.ambito === 'geral' ? 'geral' : 'local',
      confidencial: c?.nivel === 'confidencial',
    };
  };
}
