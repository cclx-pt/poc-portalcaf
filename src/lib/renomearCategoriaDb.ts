/** Mudar o nome de uma categoria nos dados guardados (Firestore). Funções puras em renomearCategoria.ts. */
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { RegraBanco } from './classificacaoBanco';
import { renomearEmCustos, renomearEmLotesBanco, renomearEmOrcamento, renomearEmRegras } from './renomearCategoria';
import type { BancoLote, CustoFixo, Fecho, Orcamento } from './types';

const todos = async <T,>(col: string) => (await getDocs(collection(db, col))).docs.map((d) => ({ ...d.data(), id: d.id }) as T & { id: string });
/** Firestore não aceita undefined. */
const limpo = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

async function gravarTodos(col: string, docs: { id: string }[], semId = false) {
  for (let i = 0; i < docs.length; i += 400) {
    const b = writeBatch(db);
    for (const x of docs.slice(i, i + 400)) { const { id, ...resto } = x; b.set(doc(db, col, id), limpo(semId ? resto : x)); }
    await b.commit();
  }
}

export interface ResultadoRenomear { lotesBanco: number; lotesFechados: number; custos: number; regras: number; orcamentos: number }

/**
 * Troca o nome antigo pelo novo nos movimentos dos meses abertos, custos fixos, regras dos extratos e orçamentos.
 * Os meses fechados não mudam (contam no nome novo pelos `nomesAnteriores` da categoria).
 */
export async function renomearCategoriaNosDados(antigo: string, novo: string): Promise<ResultadoRenomear> {
  const [banco, fechos, custos, regras, orcamentos] = await Promise.all([
    todos<BancoLote>('banco_lotes'), todos<Fecho>('fechos'), todos<CustoFixo>('custos_fixos'), todos<RegraBanco>('regras_banco'), todos<Orcamento>('orcamentos'),
  ]);
  const fechados = new Set(fechos.filter((f) => f.estado === 'fechado').map((f) => f.periodo ?? f.id));
  const lotes = renomearEmLotesBanco(banco, antigo, novo);
  const abertos = lotes.filter((l) => !fechados.has(l.periodo));
  const cs = renomearEmCustos(custos, antigo, novo);
  const rs = renomearEmRegras(regras, antigo, novo);
  const os = renomearEmOrcamento(orcamentos, antigo, novo);
  await gravarTodos('banco_lotes', abertos);
  await gravarTodos('custos_fixos', cs);
  await gravarTodos('regras_banco', rs);
  await gravarTodos('orcamentos', os as unknown as { id: string }[], true); // os orçamentos não guardam o id no documento
  return { lotesBanco: abertos.length, lotesFechados: lotes.length - abertos.length, custos: cs.length, regras: rs.length, orcamentos: os.length };
}
