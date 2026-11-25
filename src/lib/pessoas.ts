/** Pessoas (dados de referência confidenciais): acesso ao Firestore. Regras: só Master e CAF leem e gravam. */
import { collection, deleteDoc, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Pessoa } from './pessoasBase';
export * from './pessoasBase';

/** Firestore não aceita undefined. */
const limpo = (p: Pessoa) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as Pessoa;

export async function listarPessoas(): Promise<Pessoa[]> {
  const s = await getDocs(collection(db, 'pessoas'));
  return s.docs.map((d) => ({ ...(d.data() as Pessoa), id: d.id })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
}
export const gravarPessoa = (p: Pessoa) => setDoc(doc(db, 'pessoas', p.id), limpo(p));
export const apagarPessoa = (id: string) => deleteDoc(doc(db, 'pessoas', id));
/** Grava várias, em blocos de 400. */
export async function gravarPessoas(ps: Pessoa[]) {
  for (let i = 0; i < ps.length; i += 400) {
    const b = writeBatch(db);
    ps.slice(i, i + 400).forEach((p) => b.set(doc(db, 'pessoas', p.id), limpo(p)));
    await b.commit();
  }
}
