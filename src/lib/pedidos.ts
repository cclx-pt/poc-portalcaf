/**
 * Pedidos de bugs e melhorias, registados a partir do rodapé de qualquer ecrã (com o código do ecrã)
 * e geridos em Administração › Bugs e melhorias. O registo pode ser ligado e desligado (config/pedidos).
 */
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type TipoPedido = 'bug' | 'melhoria';
export type EstadoPedido = 'novo' | 'em-analise' | 'em-curso' | 'resolvido' | 'rejeitado';
export type PrioridadePedido = 'baixa' | 'media' | 'alta';

export interface Pedido {
  id: string;
  tipo: TipoPedido;
  titulo: string;
  descricao: string;
  /** Código e nome do ecrã onde foi registado (ex.: "TES-02", "Reconciliação bancária"). */
  ecra: string;
  ecraNome: string;
  /** Endereço do ecrã (sem o "#"), para abrir o mesmo sítio. */
  caminho: string;
  estado: EstadoPedido;
  prioridade?: PrioridadePedido;
  /** Nota da administração (resposta, decisão, PR que resolveu). */
  nota?: string;
  criadoPor: string;
  criadoEm: string;
  atualizadoPor?: string;
  atualizadoEm?: string;
}

export const TIPO_PEDIDO: Record<TipoPedido, string> = { bug: 'Bug', melhoria: 'Melhoria' };
export const ESTADO_PEDIDO: Record<EstadoPedido, string> = {
  novo: 'Novo', 'em-analise': 'Em análise', 'em-curso': 'Em curso', resolvido: 'Resolvido', rejeitado: 'Rejeitado',
};
export const PRIORIDADE_PEDIDO: Record<PrioridadePedido, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
/** Estados ainda por tratar (contam como abertos). */
export const ESTADOS_ABERTOS: EstadoPedido[] = ['novo', 'em-analise', 'em-curso'];

export interface NovoPedido { tipo: TipoPedido | ''; titulo: string; descricao: string }

/** Erros do formulário, por campo (vazio = válido). */
export function validarPedido(p: NovoPedido): Partial<Record<keyof NovoPedido, string>> {
  const e: Partial<Record<keyof NovoPedido, string>> = {};
  if (!p.tipo) e.tipo = 'Escolha se é um bug ou uma melhoria.';
  if (p.titulo.trim().length < 5) e.titulo = 'Escreva um título com pelo menos 5 caracteres.';
  if (p.titulo.trim().length > 120) e.titulo = 'O título tem no máximo 120 caracteres.';
  if (p.descricao.trim().length < 10) e.descricao = 'Descreva o que aconteceu ou o que quer mudar (pelo menos 10 caracteres).';
  if (p.descricao.length > 4000) e.descricao = 'A descrição tem no máximo 4000 caracteres.';
  return e;
}

/** Referência curta para falar do pedido (ex.: "#7F3A2C"). */
export const refPedido = (id: string) => `#${id.slice(0, 6).toUpperCase()}`;

/** Ordena: abertos primeiro, depois por prioridade (alta → baixa) e do mais recente para o mais antigo. */
export function ordenarPedidos(ps: Pedido[]): Pedido[] {
  const peso = (p: Pedido) => (ESTADOS_ABERTOS.includes(p.estado) ? 0 : 1);
  const pri = (p: Pedido) => ({ alta: 0, media: 1, baixa: 2 }[p.prioridade ?? 'media']);
  return [...ps].sort((a, b) => peso(a) - peso(b) || pri(a) - pri(b) || b.criadoEm.localeCompare(a.criadoEm));
}

// ---------- Firestore ----------
export interface ConfigPedidos { ativo: boolean; alteradoPor?: string; alteradoEm?: string }

/** Sem configuração, o registo está ligado. */
export async function lerConfigPedidos(): Promise<ConfigPedidos> {
  const s = await getDoc(doc(db, 'config', 'pedidos'));
  return s.exists() ? { ativo: s.data().ativo !== false, ...s.data() } as ConfigPedidos : { ativo: true };
}
export const gravarConfigPedidos = (c: ConfigPedidos) => setDoc(doc(db, 'config', 'pedidos'), c);

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
export const apagarPedido = (id: string) => deleteDoc(doc(db, 'pedidos', id));
