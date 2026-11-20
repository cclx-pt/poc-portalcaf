/**
 * Ponte entre o Firestore e a automação dos pedidos (bugs e melhorias), corrida no GitHub Actions.
 * A análise e a implementação são feitas por uma tarefa agendada do Claude, que não tem acesso ao Firestore:
 * esta ponte exporta o trabalho a fazer e grava os resultados, sempre cifrados (o repositório é público).
 *
 *   PEDIDOS_ACAO=exportar  → escreve pedidos-cifrados.txt com { modo, pedidos: [{ trabalho, ...pedido sem email }] }
 *   PEDIDOS_ACAO=atualizar → lê PEDIDOS_DADOS (cifrado): { resultados: [{ id, campos }], resumo }
 *
 * Variáveis: FIREBASE_SERVICE_ACCOUNT, PEDIDOS_CHAVE, PEDIDOS_MODO (noite | agora), PEDIDOS_ACAO, PEDIDOS_DADOS.
 */
import { writeFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { cifrar, decifrar } from './cifra';
import { analisarTodosPendente, trabalhoDaAutomacao, type ConfigPedidos, type Pedido } from '../src/lib/pedidosBase';

const env = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`Falta a variável ${k}`); return v; };
initializeApp({ credential: cert(JSON.parse(env('FIREBASE_SERVICE_ACCOUNT'))) });
const db = getFirestore();
const QUEM = 'automacao@portalcaf';

/** Campos que a automação pode escrever num pedido. */
export const CAMPOS_AUTOMACAO = ['plano', 'planoEm', 'planoEstado', 'prUrl', 'prNumero', 'automacaoNota', 'automacaoEm'] as const;

async function exportar() {
  const modo = (process.env.PEDIDOS_MODO === 'noite' ? 'noite' : 'agora') as 'noite' | 'agora';
  const cfgSnap = await db.doc('config/pedidos').get();
  const cfg = (cfgSnap.exists ? cfgSnap.data() : { ativo: true }) as ConfigPedidos;
  const todos = (await db.collection('pedidos').get()).docs.map((d) => ({ id: d.id, ...d.data() }) as Pedido);
  const analisarTodos = analisarTodosPendente(cfg);
  const pedidos = todos
    .map((p) => ({ p, trabalho: trabalhoDaAutomacao(p, { modo, analisarTodos }) }))
    .filter((x) => x.trabalho)
    // Sem o email de quem reportou: a análise não precisa dele.
    .map(({ p, trabalho }) => { const { criadoPor: _c, atualizadoPor: _a, planoDecididoPor: _d, ...resto } = p; void _c; void _a; void _d; return { trabalho, ...resto }; });
  const saida = { modo, geradoEm: new Date().toISOString(), analisarTodos, pedidos };
  writeFileSync('pedidos-cifrados.txt', cifrar(JSON.stringify(saida)));
  // Só contagens no log (público).
  console.log(`Exportados ${pedidos.length} pedidos: ${pedidos.filter((x) => x.trabalho === 'analisar').length} para analisar, ${pedidos.filter((x) => x.trabalho === 'implementar').length} para implementar.`);
}

async function atualizar() {
  const dados = JSON.parse(decifrar(env('PEDIDOS_DADOS'))) as { resultados: { id: string; campos: Record<string, unknown> }[]; resumo?: string };
  const agora = new Date().toISOString();
  const b = db.batch();
  for (const r of dados.resultados ?? []) {
    const campos = Object.fromEntries(Object.entries(r.campos ?? {}).filter(([k]) => (CAMPOS_AUTOMACAO as readonly string[]).includes(k)));
    if (campos.planoEstado && !['proposto', 'pr-aberto', 'erro'].includes(String(campos.planoEstado))) delete campos.planoEstado;
    b.update(db.doc(`pedidos/${r.id}`), { ...campos, automacaoEm: agora });
    b.create(db.collection('auditoria').doc(), { quem: QUEM, acao: 'Bugs e melhorias', detalhe: `#${r.id.slice(0, 6).toUpperCase()}: ${campos.planoEstado ?? 'atualizado'} (automação)`, em: agora });
  }
  b.set(db.doc('config/pedidos'), { automacaoEm: agora, automacaoResumo: (dados.resumo ?? '').slice(0, 300) || FieldValue.delete() }, { merge: true });
  await b.commit();
  console.log(`Atualizados ${dados.resultados?.length ?? 0} pedidos.`);
}

const acao = env('PEDIDOS_ACAO');
(acao === 'exportar' ? exportar() : acao === 'atualizar' ? atualizar() : Promise.reject(new Error(`Ação desconhecida: ${acao}`)))
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
