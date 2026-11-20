/** Pedidos de bugs e melhorias: acesso ao Firestore. Tipos e regras em pedidosBase.ts. */
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { ConfigPedidos, Pedido } from './pedidosBase';
export * from './pedidosBase';

// ---------- Firestore ----------

/** Sem configuração, o registo está ligado. */
export async function lerConfigPedidos(): Promise<ConfigPedidos> {
  const s = await getDoc(doc(db, 'config', 'pedidos'));
  return s.exists() ? { ativo: s.data().ativo !== false, ...s.data() } as ConfigPedidos : { ativo: true };
}
export const gravarConfigPedidos = (c: Partial<ConfigPedidos>) => setDoc(doc(db, 'config', 'pedidos'), c, { merge: true });

export async function criarPedido(p: Omit<Pedido, 'id' | 'estado'>): Promise<string> {
  const r = await addDoc(collection(db, 'pedidos'), { ...p, estado: 'novo' });
  return r.id;
}
export async function listarPedidos(): Promise<Pedido[]> {
  const snap = await getDocs(collection(db, 'pedidos'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Pedido);
}
export const atualizarPedido = (id: string, campos: Partial<Pick<Pedido, 'estado' | 'prioridade' | 'nota' | 'atualizadoPor' | 'atualizadoEm'>>) =>
  updateDoc(doc(db, 'pedidos', id), campos);
/** Só Master: aprovar ou rejeitar o plano, ou pedir nova análise de um pedido. */
export const decidirPlano = (id: string, campos: Partial<Pick<Pedido, 'planoEstado' | 'planoDecididoPor' | 'planoDecididoEm' | 'analisarAgoraEm'>>) =>
  updateDoc(doc(db, 'pedidos', id), campos);
/** Só Master: pede à automação que analise já os pedidos abertos sem plano. */
export const pedirAnaliseAgora = (email: string) =>
  setDoc(doc(db, 'config', 'pedidos'), { analisarAgoraEm: new Date().toISOString(), analisarAgoraPor: email }, { merge: true });

export const apagarPedido = (id: string) => deleteDoc(doc(db, 'pedidos', id));
