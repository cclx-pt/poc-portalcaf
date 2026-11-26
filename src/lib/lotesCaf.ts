/** Leitura dos lotes do Jotform já com as categorias CAF (só para mostrar, analisar e exportar; nunca para regravar). */
import { lerTraducaoJotform, listarCategorias, listarLotes, type Acesso } from './db';
import { tradutorJotform, traduzirLotes, type OrigemJotform } from './traducaoJotform';
import type { Lote } from './types';

export async function listarLotesCaf(a: Acesso, origem: Lote['origem'], ano: number, confidencial?: boolean): Promise<Lote[]> {
  const [lotes, categorias, traducao] = await Promise.all([listarLotes(a, origem, ano, confidencial), listarCategorias(), lerTraducaoJotform().catch(() => ({ linhas: [] }))]);
  if (origem !== 'contribuir' && origem !== 'depositos' && origem !== 'despesas') return lotes;
  return traduzirLotes(lotes, origem as OrigemJotform, tradutorJotform(traducao, categorias));
}
