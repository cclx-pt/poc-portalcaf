/**
 * Pedidos de bugs e melhorias: tipos e regras puras (usados no portal e na automação, sem Firebase).
 * Os pedidos são registados a partir do rodapé de qualquer ecrã (com o código do ecrã)
 * e geridos em Administração › Bugs e melhorias. O registo pode ser ligado e desligado (config/pedidos).
 */

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
  // ---------- automação (análise e implementação pelo Claude) ----------
  /** Plano de implementação proposto pela análise automática (texto em Markdown). */
  plano?: string;
  planoEm?: string;
  planoEstado?: EstadoPlano;
  /** Decisão do Master sobre o plano. */
  planoDecididoPor?: string;
  planoDecididoEm?: string;
  /** Pedido de nova análise feito pelo Master ("Analisar agora"). */
  analisarAgoraEm?: string;
  /** PR aberto pela implementação automática. */
  prUrl?: string;
  prNumero?: number;
  /** Mensagem da automação (ex.: porque não conseguiu implementar). */
  automacaoNota?: string;
  automacaoEm?: string;
}

/** proposto → (Master) aprovado | rejeitado → (automação) pr-aberto | erro */
export type EstadoPlano = 'proposto' | 'aprovado' | 'rejeitado' | 'pr-aberto' | 'erro';
export const ESTADO_PLANO: Record<EstadoPlano, string> = {
  proposto: 'Plano por aprovar', aprovado: 'Aprovado: PR a caminho', rejeitado: 'Plano rejeitado', 'pr-aberto': 'PR aberto', erro: 'Erro na automação',
};

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


export interface ConfigPedidos {
  ativo: boolean; alteradoPor?: string; alteradoEm?: string;
  /** "Analisar agora" (Master): a automação analisa todos os pedidos abertos sem plano na próxima verificação. */
  analisarAgoraEm?: string; analisarAgoraPor?: string;
  /** Última execução da automação (escrito pela própria automação). */
  automacaoEm?: string; automacaoResumo?: string;
}

/**
 * O que a automação tem para fazer com um pedido.
 * - Plano aprovado sem PR → implementar (em qualquer verificação).
 * - Nova análise pedida pelo Master neste pedido, depois do último plano → analisar.
 * - Pedido aberto sem plano → analisar à noite, ou já se o Master carregou em "Analisar agora".
 */
export function trabalhoDaAutomacao(p: Pedido, o: { modo: 'noite' | 'agora'; analisarTodos: boolean }): 'implementar' | 'analisar' | null {
  if (p.planoEstado === 'aprovado' && !p.prUrl) return 'implementar';
  if (!ESTADOS_ABERTOS.includes(p.estado) || p.planoEstado === 'aprovado' || p.planoEstado === 'pr-aberto') return null;
  if (p.analisarAgoraEm && (!p.planoEm || p.analisarAgoraEm > p.planoEm)) return 'analisar';
  if (!p.plano && (o.modo === 'noite' || o.analisarTodos)) return 'analisar';
  return null;
}

/** "Analisar agora" (para todos) ainda por atender: pedido depois da última execução da automação. */
export const analisarTodosPendente = (c: ConfigPedidos) => !!c.analisarAgoraEm && (!c.automacaoEm || c.analisarAgoraEm > c.automacaoEm);
