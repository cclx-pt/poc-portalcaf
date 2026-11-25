/** Pessoas (dados de referência confidenciais): acesso ao Firestore. Regras: só Master e CAF leem e gravam. */
import { collection, deleteDoc, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Pessoa } from './pessoasBase';
export * from './pessoasBase';

/** Firestore não aceita undefined. */
const limpo = (p: Pessoa) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as Pessoa;

export async function listarPessoas(): Promise<Pessoa[]> {
  const s = await getDocs(collection(db, 'pessoas'));
  return s.docs.map((d) => {
    // Linhas antigas (antes de 25/11/2026) tinham listas de telefones e e-mails: mostra o primeiro de cada.
    const x = d.data() as Pessoa & { telefones?: string[]; emails?: string[] };
    return { ...x, id: d.id, nome: x.nome ?? '', telefone: x.telefone ?? x.telefones?.[0] ?? '', email: x.email ?? x.emails?.[0], fontes: x.fontes ?? [] };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
}
/** Apaga todas as pessoas da base. */
export async function apagarTodasPessoas(): Promise<number> {
  const s = await getDocs(collection(db, 'pessoas'));
  const ids = s.docs.map((d) => d.id);
  await apagarPessoas(ids);
  return ids.length;
}
export const gravarPessoa = (p: Pessoa) => setDoc(doc(db, 'pessoas', p.id), limpo(p));
export const apagarPessoa = (id: string) => deleteDoc(doc(db, 'pessoas', id));
/** Apaga várias, em blocos de 400. */
export async function apagarPessoas(ids: string[]) {
  for (let i = 0; i < ids.length; i += 400) {
    const b = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => b.delete(doc(db, 'pessoas', id)));
    await b.commit();
  }
}
/** Grava várias, em blocos de 400. */
export async function gravarPessoas(ps: Pessoa[]) {
  for (let i = 0; i < ps.length; i += 400) {
    const b = writeBatch(db);
    ps.slice(i, i + 400).forEach((p) => b.set(doc(db, 'pessoas', p.id), limpo(p)));
    await b.commit();
  }
}
