import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';

let env: RulesTestEnvironment;

const MASTER = 'tesouraria@cclx.pt';
const CAF = 'caf@exemplo.pt';
const TES_CDR = 'tes.caldas@exemplo.pt';
const LEITOR = 'leitor@exemplo.pt';
const REG_CDR = 'registos.caldas@exemplo.pt';

function as(email: string, verified = true) {
  return env.authenticatedContext(email, { email, email_verified: verified }).firestore();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-caf',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', CAF), { papel: 'caf', nivel: 'confidencial', comunidades: ['*'], ativo: true });
    await setDoc(doc(db, 'users', TES_CDR), { papel: 'tesoureiro', nivel: 'privado', comunidades: ['caldas-da-rainha'], ativo: true });
    await setDoc(doc(db, 'users', LEITOR), { papel: 'leitura', nivel: 'publico', comunidades: ['*'], ativo: true });
    await setDoc(doc(db, 'users', REG_CDR), { papel: 'registos', nivel: 'publico', comunidades: ['caldas-da-rainha'], ativo: true });
    await setDoc(doc(db, 'lotes', 'assistencia_2026_03_caldas-da-rainha'), { origem: 'assistencia', comunidadeId: 'caldas-da-rainha', periodo: '2026-03', registos: [] });
    await setDoc(doc(db, 'lotes', 'assistencia_2026_03_almada'), { origem: 'assistencia', comunidadeId: 'almada', periodo: '2026-03', registos: [] });
    await setDoc(doc(db, 'lotes_conf', 'contribuir_2026_03_caldas-da-rainha'), { comunidadeId: 'caldas-da-rainha', periodo: '2026-03', registos: [] });
    await setDoc(doc(db, 'lotes', 'contribuir_2026_03_caldas-da-rainha'), { comunidadeId: 'caldas-da-rainha', periodo: '2026-03', registos: [] });
    await setDoc(doc(db, 'lotes', 'contribuir_2026_03_almada'), { comunidadeId: 'almada', periodo: '2026-03', registos: [] });
    await setDoc(doc(db, 'custos_fixos', 'cdr-vencimentos'), { comunidadeId: 'caldas-da-rainha', nivel: 'confidencial', rubrica: 'Vencimentos' });
    await setDoc(doc(db, 'custos_fixos', 'cdr-renda'), { comunidadeId: 'caldas-da-rainha', nivel: 'privado', rubrica: 'Renda' });
    await setDoc(doc(db, 'publico', '2026'), { site: { nome: 'CCLX', meses: [] } });
    await setDoc(doc(db, 'publico_sites', '2026'), { comunidades: [] });
    await setDoc(doc(db, 'fechos', '2026-01'), { estado: 'fechado' });
  });
});

describe('configuração da assistência', () => {
  it('utilizadores ativos leem; só o Master escolhe o tipo de celebração', async () => {
    await assertSucceeds(getDoc(doc(as(LEITOR), 'config', 'assistencia')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'config', 'assistencia')));
    await assertFails(setDoc(doc(as(CAF), 'config', 'assistencia'), { eventoCelebracao: 'X' }));
    await assertSucceeds(setDoc(doc(as(MASTER), 'config', 'assistencia'), { eventoCelebracao: 'Celebração de Domingo' }));
  });
});

describe('exceções de assistência', () => {
  it('qualquer utilizador ativo lê; só Master e CAF escrevem', async () => {
    await assertSucceeds(getDoc(doc(as(LEITOR), 'assistencia_excecoes', '2026-12-27_cclx')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'assistencia_excecoes', '2026-12-27_cclx')));
    await assertFails(setDoc(doc(as(TES_CDR), 'assistencia_excecoes', '2026-12-27_cclx'), { data: '2026-12-27', ambito: 'cclx' }));
    await assertSucceeds(setDoc(doc(as(CAF), 'assistencia_excecoes', '2026-12-27_cclx'), { data: '2026-12-27', ambito: 'cclx' }));
    await assertSucceeds(setDoc(doc(as(MASTER), 'assistencia_excecoes', '2026-12-20_almada'), { data: '2026-12-20', ambito: 'almada' }));
  });
});

describe('página pública', () => {
  it('qualquer pessoa lê o resumo público do site (CCLX)', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'publico', '2026')));
  });
  it('as contas por comunidade só se leem com login', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'publico_sites', '2026')));
    await assertSucceeds(getDoc(doc(as(LEITOR), 'publico_sites', '2026')));
    await assertFails(setDoc(doc(as(LEITOR), 'publico_sites', '2026'), { comunidades: [] }));
    await assertSucceeds(setDoc(doc(as(CAF), 'publico_sites', '2026'), { comunidades: [] }));
  });
  it('sem login não lê dados privados', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'lotes', 'contribuir_2026_03_almada')));
  });
});

describe('master', () => {
  it('master fixo lê dados confidenciais sem perfil criado', async () => {
    await assertSucceeds(getDoc(doc(as(MASTER), 'lotes_conf', 'contribuir_2026_03_caldas-da-rainha')));
  });
  it('email não verificado não é master', async () => {
    await assertFails(getDoc(doc(as(MASTER, false), 'lotes_conf', 'contribuir_2026_03_caldas-da-rainha')));
  });
  it('só o master gere utilizadores', async () => {
    await assertSucceeds(setDoc(doc(as(MASTER), 'users', 'novo@exemplo.pt'), { papel: 'leitura' }));
    await assertFails(setDoc(doc(as(CAF), 'users', 'novo@exemplo.pt'), { papel: 'master' }));
  });
  it('master altera mês fechado', async () => {
    await assertSucceeds(setDoc(doc(as(MASTER), 'lotes', 'x'), { comunidadeId: 'almada', periodo: '2026-01', registos: [] }));
  });
});

describe('CAF', () => {
  it('lê confidencial de todas as comunidades', async () => {
    await assertSucceeds(getDoc(doc(as(CAF), 'lotes_conf', 'contribuir_2026_03_caldas-da-rainha')));
    await assertSucceeds(getDoc(doc(as(CAF), 'custos_fixos', 'cdr-vencimentos')));
  });
  it('não altera mês fechado', async () => {
    await assertFails(setDoc(doc(as(CAF), 'lotes', 'y'), { comunidadeId: 'almada', periodo: '2026-01', registos: [] }));
  });
  it('cria, altera e apaga entidades', async () => {
    await assertSucceeds(setDoc(doc(as(CAF), 'comunidades', 'nova'), { nome: 'Nova', ordem: 9, ativo: true }));
    await assertSucceeds(setDoc(doc(as(CAF), 'contas', 'cgd-principal'), { nome: 'CGD', iban: 'PT50000201231234567890154' }));
    await assertSucceeds(setDoc(doc(as(CAF), 'categorias', 'saida-x'), { nome: 'X', tipo: 'saida', nivel: 'privado' }));
    await assertSucceeds(setDoc(doc(as(CAF), 'custos_fixos', 'cdr-renda'), { comunidadeId: 'caldas-da-rainha', nivel: 'privado', rubrica: 'Renda' }));
  });
  it('fecha meses e publica', async () => {
    await assertSucceeds(setDoc(doc(as(CAF), 'fechos', '2026-02'), { estado: 'fechado' }));
    await assertSucceeds(setDoc(doc(as(CAF), 'publico', '2026'), { comunidades: [] }));
  });
});

describe('tesoureiro de Caldas da Rainha', () => {
  it('lê dados privados só da sua comunidade', async () => {
    await assertSucceeds(getDoc(doc(as(TES_CDR), 'lotes', 'contribuir_2026_03_caldas-da-rainha')));
    await assertFails(getDoc(doc(as(TES_CDR), 'lotes', 'contribuir_2026_03_almada')));
  });
  it('consulta filtrada pela sua comunidade funciona', async () => {
    const q = query(collection(as(TES_CDR), 'lotes'), where('comunidadeId', 'in', ['caldas-da-rainha']));
    await assertSucceeds(getDocs(q));
  });
  it('não lê dados confidenciais nem vencimentos', async () => {
    await assertFails(getDoc(doc(as(TES_CDR), 'lotes_conf', 'contribuir_2026_03_caldas-da-rainha')));
    await assertFails(getDoc(doc(as(TES_CDR), 'custos_fixos', 'cdr-vencimentos')));
    await assertSucceeds(getDoc(doc(as(TES_CDR), 'custos_fixos', 'cdr-renda')));
  });
  it('consulta custos fixos só até ao seu nível', async () => {
    const db = as(TES_CDR);
    await assertSucceeds(getDocs(query(collection(db, 'custos_fixos'), where('nivel', 'in', ['publico', 'privado']), where('comunidadeId', 'in', ['caldas-da-rainha']))));
    await assertFails(getDocs(query(collection(db, 'custos_fixos'), where('nivel', 'in', ['publico', 'privado', 'confidencial']), where('comunidadeId', 'in', ['caldas-da-rainha']))));
  });
  it('só consulta: não importa nem altera dados', async () => {
    await assertFails(setDoc(doc(as(TES_CDR), 'lotes', 'z'), { comunidadeId: 'caldas-da-rainha', periodo: '2026-04', registos: [] }));
    await assertFails(setDoc(doc(as(TES_CDR), 'lotes_conf', 'z'), { comunidadeId: 'caldas-da-rainha', periodo: '2026-04', registos: [] }));
  });
  it('lê o estado da sincronização; só o Master o escreve (sincronização forçada)', async () => {
    await assertSucceeds(getDoc(doc(as(TES_CDR), 'estado', 'sync')));
    await assertSucceeds(setDoc(doc(as(MASTER), 'estado', 'sync'), { ok: true }));
    await assertFails(setDoc(doc(as(CAF), 'estado', 'sync'), { ok: true }));
    await assertFails(setDoc(doc(as(TES_CDR), 'estado', 'sync'), { ok: true }));
  });
  it('não altera entidades nem custos fixos', async () => {
    await assertFails(setDoc(doc(as(TES_CDR), 'comunidades', 'nova'), { nome: 'Nova' }));
    await assertFails(setDoc(doc(as(TES_CDR), 'categorias', 'saida-x'), { nome: 'X' }));
    await assertFails(setDoc(doc(as(TES_CDR), 'custos_fixos', 'cdr-renda'), { comunidadeId: 'caldas-da-rainha', nivel: 'privado', rubrica: 'Renda' }));
    await assertFails(getDoc(doc(as(TES_CDR), 'contas', 'cgd-principal')));
  });
  it('não vê bancos nem publica', async () => {
    await assertFails(getDoc(doc(as(TES_CDR), 'banco_lotes', 'qualquer')));
    await assertFails(setDoc(doc(as(TES_CDR), 'publico', '2026'), { comunidades: [] }));
  });
});

describe('leitura (nível público)', () => {
  it('não lê dados privados', async () => {
    await assertFails(getDoc(doc(as(LEITOR), 'lotes', 'contribuir_2026_03_almada')));
  });
  it('não escreve', async () => {
    await assertFails(setDoc(doc(as(LEITOR), 'lotes', 'k'), { comunidadeId: 'almada', periodo: '2026-04', registos: [] }));
  });
});

describe('desconhecido', () => {
  it('utilizador sem perfil não lê nada privado', async () => {
    await assertFails(getDoc(doc(as('estranho@exemplo.pt'), 'lotes', 'contribuir_2026_03_almada')));
    await assertFails(getDoc(doc(as('estranho@exemplo.pt'), 'comunidades', 'almada')));
  });
  it('auditoria só aceita o próprio email', async () => {
    await assertFails(setDoc(doc(as(CAF), 'auditoria', 'a1'), { quem: 'outro@exemplo.pt', acao: 'x' }));
    await assertSucceeds(setDoc(doc(as(CAF), 'auditoria', 'a2'), { quem: CAF, acao: 'x' }));
  });
});

describe('registos (presenças da sua comunidade)', () => {
  const ass = (c: string, p = '2026-04') => ({ origem: 'assistencia', comunidadeId: c, periodo: p, registos: [] });
  it('lê presenças da sua comunidade, não de outras', async () => {
    await assertSucceeds(getDoc(doc(as(REG_CDR), 'lotes', 'assistencia_2026_03_caldas-da-rainha')));
    await assertFails(getDoc(doc(as(REG_CDR), 'lotes', 'assistencia_2026_03_almada')));
    await assertSucceeds(getDocs(query(collection(as(REG_CDR), 'lotes'), where('origem', '==', 'assistencia'), where('comunidadeId', 'in', ['caldas-da-rainha']))));
  });
  it('lê um lote ainda inexistente (para criar o primeiro registo do mês)', async () => {
    await assertSucceeds(getDoc(doc(as(REG_CDR), 'lotes', 'assistencia_2026_04_caldas-da-rainha')));
  });
  it('não lê dados financeiros nem resumos', async () => {
    await assertFails(getDoc(doc(as(REG_CDR), 'lotes', 'contribuir_2026_03_caldas-da-rainha')));
    await assertFails(getDoc(doc(as(REG_CDR), 'lotes_conf', 'contribuir_2026_03_caldas-da-rainha')));
    await assertFails(getDoc(doc(as(REG_CDR), 'custos_fixos', 'cdr-renda')));
    await assertFails(getDoc(doc(as(REG_CDR), 'banco_lotes', 'qualquer')));
  });
  it('regista presenças só na sua comunidade e em meses abertos', async () => {
    await assertSucceeds(setDoc(doc(as(REG_CDR), 'lotes', 'assistencia_2026_04_caldas-da-rainha'), ass('caldas-da-rainha')));
    await assertFails(setDoc(doc(as(REG_CDR), 'lotes', 'assistencia_2026_04_almada'), ass('almada')));
    await assertFails(setDoc(doc(as(REG_CDR), 'lotes', 'assistencia_2026_01_caldas-da-rainha'), ass('caldas-da-rainha', '2026-01')));
  });
  it('não escreve outras origens nem transforma lotes financeiros', async () => {
    await assertFails(setDoc(doc(as(REG_CDR), 'lotes', 'contribuir_2026_04_caldas-da-rainha'), { origem: 'contribuir', comunidadeId: 'caldas-da-rainha', periodo: '2026-04', registos: [] }));
    await assertFails(setDoc(doc(as(REG_CDR), 'lotes', 'contribuir_2026_03_caldas-da-rainha'), ass('caldas-da-rainha', '2026-03')));
    await assertFails(setDoc(doc(as(REG_CDR), 'resumos', '2026_caldas-da-rainha'), { meses: [] }));
  });
});

describe('bugs e melhorias', () => {
  const pedido = (email: string, extra: Record<string, unknown> = {}) => ({
    tipo: 'bug', titulo: 'Botão não grava', descricao: 'Ao clicar em gravar nada acontece.', ecra: 'TES-02', ecraNome: 'Reconciliação',
    caminho: '/reconciliacao', estado: 'novo', criadoPor: email, criadoEm: '2026-11-20T14:00:00Z', ...extra,
  });

  it('qualquer utilizador ativo regista em seu nome, como novo', async () => {
    await assertSucceeds(setDoc(doc(as(REG_CDR), 'pedidos', 'p1'), pedido(REG_CDR)));
    await assertSucceeds(setDoc(doc(as(LEITOR), 'pedidos', 'p2'), pedido(LEITOR, { tipo: 'melhoria' })));
    await assertFails(setDoc(doc(as(LEITOR), 'pedidos', 'p3'), pedido(CAF)));
    await assertFails(setDoc(doc(as(LEITOR), 'pedidos', 'p4'), pedido(LEITOR, { estado: 'resolvido' })));
    await assertFails(setDoc(doc(as(LEITOR), 'pedidos', 'p5'), pedido(LEITOR, { tipo: 'outro' })));
    // Ninguém cria um pedido já com plano aprovado (a automação implementaria um plano não revisto).
    await assertFails(setDoc(doc(as(LEITOR), 'pedidos', 'p9'), pedido(LEITOR, { plano: 'x', planoEstado: 'aprovado' })));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'pedidos', 'p6'), pedido('x@y.pt')));
  });

  it('com o registo desligado ninguém regista; só Master e CAF ligam e desligam', async () => {
    await assertFails(setDoc(doc(as(TES_CDR), 'config', 'pedidos'), { ativo: false }));
    await assertSucceeds(setDoc(doc(as(CAF), 'config', 'pedidos'), { ativo: false }));
    await assertFails(setDoc(doc(as(LEITOR), 'pedidos', 'p7'), pedido(LEITOR)));
    await assertSucceeds(setDoc(doc(as(MASTER), 'config', 'pedidos'), { ativo: true }));
    await assertSucceeds(setDoc(doc(as(LEITOR), 'pedidos', 'p7'), pedido(LEITOR)));
  });

  it('cada um lê os seus; Master e CAF leem todos e gerem estado, prioridade e nota', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'pedidos', 'p8'), pedido(LEITOR));
    });
    await assertSucceeds(getDoc(doc(as(LEITOR), 'pedidos', 'p8')));
    await assertFails(getDoc(doc(as(TES_CDR), 'pedidos', 'p8')));
    await assertSucceeds(getDoc(doc(as(CAF), 'pedidos', 'p8')));
    await assertFails(setDoc(doc(as(LEITOR), 'pedidos', 'p8'), pedido(LEITOR, { estado: 'resolvido' })));
    const { updateDoc, deleteDoc } = await import('firebase/firestore');
    await assertSucceeds(updateDoc(doc(as(CAF), 'pedidos', 'p8'), { estado: 'em-curso', prioridade: 'alta', atualizadoPor: CAF }));
    await assertFails(updateDoc(doc(as(CAF), 'pedidos', 'p8'), { titulo: 'Outro' }));
    await assertFails(deleteDoc(doc(as(LEITOR), 'pedidos', 'p8')));
    await assertSucceeds(deleteDoc(doc(as(MASTER), 'pedidos', 'p8')));
  });
});

describe('automação dos bugs e melhorias', () => {
  const base = { tipo: 'bug', titulo: 'Botão não grava', descricao: 'Ao clicar nada acontece.', ecra: 'TES-02', ecraNome: 'R', caminho: '/r', estado: 'novo', criadoPor: LEITOR, criadoEm: '2026-11-20T14:00:00Z' };
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'pedidos', 'q1'), { ...base, plano: 'Mudar X', planoEm: '2026-11-21T02:00:00Z', planoEstado: 'proposto' });
    });
  });

  it('só o Master aprova ou rejeita um plano proposto', async () => {
    const { updateDoc } = await import('firebase/firestore');
    await assertFails(updateDoc(doc(as(CAF), 'pedidos', 'q1'), { planoEstado: 'aprovado' }));
    await assertFails(updateDoc(doc(as(MASTER), 'pedidos', 'q1'), { planoEstado: 'pr-aberto' }));
    await assertFails(updateDoc(doc(as(MASTER), 'pedidos', 'q1'), { plano: 'Outro plano' }));
    await assertSucceeds(updateDoc(doc(as(MASTER), 'pedidos', 'q1'), { planoEstado: 'aprovado', planoDecididoPor: MASTER, planoDecididoEm: '2026-11-21T09:00:00Z' }));
    await assertFails(updateDoc(doc(as(MASTER), 'pedidos', 'q1'), { planoEstado: 'rejeitado' }));
  });

  it('só o Master pede nova análise; o CAF só liga e desliga o registo', async () => {
    const { updateDoc } = await import('firebase/firestore');
    await assertFails(updateDoc(doc(as(CAF), 'pedidos', 'q1'), { analisarAgoraEm: '2026-11-21T10:00:00Z' }));
    await assertSucceeds(updateDoc(doc(as(MASTER), 'pedidos', 'q1'), { analisarAgoraEm: '2026-11-21T10:00:00Z' }));
    await assertSucceeds(setDoc(doc(as(CAF), 'config', 'pedidos'), { ativo: true, alteradoPor: CAF }, { merge: true }));
    await assertFails(setDoc(doc(as(CAF), 'config', 'pedidos'), { analisarAgoraEm: '2026-11-21T10:00:00Z' }, { merge: true }));
    await assertSucceeds(setDoc(doc(as(MASTER), 'config', 'pedidos'), { analisarAgoraEm: '2026-11-21T10:00:00Z' }, { merge: true }));
  });
});
