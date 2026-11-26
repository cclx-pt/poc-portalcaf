import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { mensagemErro, useCarregar, useFocarErro } from '../components/ui';
import { useAvisoSaida } from '../components/SaidaSemGravar';
import { auditar, gravarLote, lerConfigAssistencia, lerLote } from '../lib/db';
import { dataPT, hoje, norm } from '../lib/format';
import { acrescentarRegisto, campoDoErroPresenca, contagensEmBrancoAZero, corrigirRegisto, entradaDeRegisto, eRegistoDoPortal, novoRegistoPresenca, removerRegisto, validarPresenca, type EntradaPresenca } from '../lib/presencas';
import { recalcularAno } from '../lib/recalcular';
import { apagarRascunho, armazemLocal, deveGuardarRascunho, guardarRascunho, idRascunho, lerRascunhos } from '../lib/rascunhos';
import { IDS_BASE, catalogoContagens, eventoPorNome, eventosEfetivos, eventosParaData, type Contagem } from '../lib/eventos';
import type { Comunidade, Lote } from '../lib/types';

const dataPt = dataPT;
export const entradaVazia = (comunidadeId = ''): EntradaPresenca => ({ data: hoje(), evento: '', descricao: '', comunidadeId, adultos: NaN, jump: NaN, criancas: NaN, connects: NaN, observacoes: '' });

export interface OpcoesRegisto {
  comunidades: Comunidade[]; lotes: Lote[]; aposGravar: () => Promise<void>;
  /** Avisa quando há (ou deixa de haver) um registo começado por gravar. */
  aoMudarRascunho?: (ativo: boolean) => void;
  /** Valores iniciais de um registo novo (ex.: um domingo em falta escolhido na consulta). */
  inicial?: Partial<EntradaPresenca>;
  /** Corrigir um registo existente (do portal ou do Jotform), no mesmo mês e comunidade. */
  edicao?: { lote: Lote; registoId: string }; aoFechar?: () => void;
}

/**
 * Estado e regras do registo de presenças (novo ou correção), partilhados pelo formulário do portal e pela app Presenças.
 * Validação, rascunhos no dispositivo, gravação, auditoria e recálculo vivem aqui; os ecrãs só desenham.
 */
export function useRegistoPresenca({ comunidades, lotes, aposGravar, edicao, aoFechar, inicial, aoMudarRascunho }: OpcoesRegisto) {
  const { acesso } = useAuth();
  const config = useCarregar(lerConfigAssistencia, []);
  const unica = comunidades.length === 1 ? comunidades[0].id : '';
  const original = edicao?.lote.registos.find((r) => r.id === edicao.registoId);
  const catalogo = catalogoContagens(config.dados);
  const idsExtra = catalogo.filter((c) => !IDS_BASE.includes(c.id)).map((c) => c.id);
  const [eForm, setE] = useState<EntradaPresenca>(original ? entradaDeRegisto(original, edicao!.lote.comunidadeId, idsExtra) : { ...entradaVazia(unica), ...inicial });
  const e = eForm;
  const [sucesso, setSucesso] = useState<{ entrada: EntradaPresenca; comunidade: string; nota: string; contagens: Contagem[] } | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const [contador, setContador] = useState(false);
  const [guardadoEm, setGuardadoEm] = useState<string | undefined>();
  const [rascunhos, setRascunhos] = useState(() => (edicao ? [] : lerRascunhos(armazemLocal(), acesso?.email ?? '')));
  // Rascunho no dispositivo: guarda a cada alteração, quando já há data, evento, comunidade e alguma contagem.
  const comRascunho = !edicao && deveGuardarRascunho(e);
  useEffect(() => { aoMudarRascunho?.(comRascunho); }, [comRascunho, aoMudarRascunho]);
  useEffect(() => {
    if (!comRascunho || !acesso) return;
    const agora = new Date().toISOString();
    guardarRascunho(armazemLocal(), acesso.email, e, agora);
    setGuardadoEm(agora);
  }, [e, comRascunho, acesso]);
  const eventos = eventosEfetivos(config.dados);
  const opcoes = eventosParaData(eventos, e.data);
  const evSel = eventoPorNome(eventos, e.evento);
  // Correção de um registo com um evento que já não está na configuração (ex.: vindo do Jotform): mantém-se.
  const opcoesNomes = [...opcoes.map((x) => x.nome), ...(e.evento && !opcoes.some((x) => norm(x.nome) === norm(e.evento)) ? [e.evento] : [])];
  const recolhe = (evSel?.contagens ?? IDS_BASE).map((id) => catalogo.find((c) => c.id === id) ?? { id, nome: id });
  const nomesContagens = Object.fromEntries(catalogo.map((c) => [c.id, c.nome]));
  const nomes = new Map(comunidades.map((c) => [c.id, c.nome]));
  const eOutra = evSel ? !!evSel.pedeDescricao : norm(e.evento) === 'outra';
  const podeRecalcular = acesso?.papel === 'master' || acesso?.papel === 'caf';
  // Erro de validação: campo destacado a amarelo e cursor nesse campo.
  const raiz = useRef<HTMLDivElement>(null);
  const campoErro = msg?.tipo === 'erro' ? campoDoErroPresenca(msg.texto, nomesContagens) : null;
  useFocarErro(msg?.tipo === 'erro' ? msg : null, raiz);
  // Registo começado e por gravar: ao sair do ecrã pergunta se quer gravar (o rascunho fica no dispositivo).
  useAvisoSaida(!edicao && comRascunho, () => guardar());
  const erroEm = (c: string) => (campoErro === c ? 'com-erro' : undefined);
  const n = (k: keyof EntradaPresenca) => (v: string) => setE((p) => ({ ...p, [k]: v === '' ? NaN : Number(v) }));

  async function guardarCorrecao(e: EntradaPresenca): Promise<boolean> {
    setMsg(null);
    setAGuardar(true);
    try {
      // Relê o lote para não perder alterações feitas entretanto por outra pessoa.
      const atual = (await lerLote(edicao!.lote.id)) ?? edicao!.lote;
      const { lote, alteracoes } = corrigirRegisto(atual, edicao!.registoId, e, acesso!.email, hoje(), undefined, evSel ? { ...evSel, dias: [] } : undefined, nomesContagens);
      await gravarLote(lote);
      const nome = nomes.get(lote.comunidadeId) ?? lote.comunidadeId;
      await auditar(acesso!.email, 'corrigir registo de presenças', `${dataPt(original!.data)} · ${original!.evento ?? ''} · ${nome} · ${alteracoes}`);
      if (podeRecalcular) await recalcularAno(acesso!, lote.ano);
      await aposGravar();
      aoFechar?.();
      return true;
    } catch (err) { setMsg({ tipo: 'erro', texto: mensagemErro(err) }); return false; }
    finally { setAGuardar(false); }
  }

  async function guardar(): Promise<boolean> {
    // Contagens pedidas em branco contam 0 (zero).
    const e = contagensEmBrancoAZero(eForm, recolhe.map((c) => c.id));
    setE(e);
    if (edicao) return guardarCorrecao(e);
    setMsg(null);
    if (e.comunidadeId && !nomes.has(e.comunidadeId)) { setMsg({ tipo: 'erro', texto: 'Não tem acesso a esta comunidade.' }); return false; }
    const erro = validarPresenca(e, hoje(), lotes, undefined, evSel, nomesContagens);
    if (erro) { setMsg({ tipo: 'erro', texto: erro }); return false; }
    setAGuardar(true);
    try {
      const r = novoRegistoPresenca(e, acesso!.email);
      const id = `assistencia_${e.data.slice(0, 4)}_${e.data.slice(5, 7)}_${e.comunidadeId}`;
      const lote = acrescentarRegisto((await lerLote(id)) ?? undefined, r, acesso!.email, e.comunidadeId);
      await gravarLote(lote);
      await auditar(acesso!.email, 'registar presenças', `${dataPt(e.data)} · ${e.evento}${e.descricao ? ` (${e.descricao})` : ''} · ${nomes.get(e.comunidadeId) ?? e.comunidadeId} · ${e.adultos} jovens e adultos`);
      if (podeRecalcular) await recalcularAno(acesso!, Number(e.data.slice(0, 4)));
      setSucesso({ contagens: recolhe, entrada: e, comunidade: nomes.get(e.comunidadeId) ?? e.comunidadeId, nota: podeRecalcular ? 'Resumos recalculados.' : 'Já aparece no mapa de presenças e nos registos em falta; as médias atualizam no próximo cálculo.' });
      apagarRascunho(armazemLocal(), acesso!.email, idRascunho(e));
      setRascunhos(lerRascunhos(armazemLocal(), acesso!.email));
      setE({ ...entradaVazia(e.comunidadeId), data: e.data });
      await aposGravar();
      return true;
    } catch (err) { setMsg({ tipo: 'erro', texto: mensagemErro(err) }); return false; }
    finally { setAGuardar(false); }
  }

  const valorDe = (id: string) => (IDS_BASE.includes(id) ? (e[id as 'adultos'] as number) : e.outras?.[id] ?? NaN);
  const mudar = (id: string, v: string) => {
    const x = v === '' ? NaN : Number(v);
    if (IDS_BASE.includes(id)) n(id as keyof EntradaPresenca)(v);
    else setE((p) => ({ ...p, outras: { ...(p.outras ?? {}), [id]: x } }));
  };
  const somar = (id: string, d: number) => setE((p) => {
    const atual = (v: number | undefined) => (v == null || Number.isNaN(v) ? 0 : v);
    if (IDS_BASE.includes(id)) return { ...p, [id]: Math.max(0, atual(p[id as 'adultos']) + d) };
    return { ...p, outras: { ...(p.outras ?? {}), [id]: Math.max(0, atual(p.outras?.[id]) + d) } };
  });
  const valoresContador = Object.fromEntries(recolhe.map((c) => [c.id, valorDe(c.id)]));
  const descartar = (id: string) => { apagarRascunho(armazemLocal(), acesso!.email, id); setRascunhos(lerRascunhos(armazemLocal(), acesso!.email)); };
  const outrosRascunhos = rascunhos.filter((r) => r.id !== (comRascunho ? idRascunho(e) : '') && nomes.has(r.entrada.comunidadeId));

  const total = recolhe.reduce((s, c) => { const v = valorDe(c.id); return s + (Number.isNaN(v) ? 0 : v); }, 0);
  /** Limpa o formulário e descarta o rascunho deste registo (pede confirmação se houver contagens). */
  const limpar = () => {
    if (comRascunho && !confirm('Limpar o formulário e descartar o rascunho?')) return;
    if (comRascunho) descartar(idRascunho(e));
    setE(entradaVazia(e.comunidadeId)); setMsg(null);
  };
  return {
    acesso, config, e, setE, original, unica, catalogo, recolhe, nomesContagens, nomes, eventos, opcoes, opcoesNomes, evSel, eOutra,
    raiz, campoErro, erroEm, msg, setMsg, aGuardar, guardar, sucesso, setSucesso, contador, setContador, guardadoEm, comRascunho,
    valorDe, mudar, somar, valoresContador, descartar, outrosRascunhos, limpar, total,
  };
}

export type RegistoPresenca = ReturnType<typeof useRegistoPresenca>;
export type { Contagem };

type Acesso = NonNullable<ReturnType<typeof useAuth>['acesso']>;
type RegistoLote = Lote['registos'][number];

/** Quem pode apagar: Master e CAF sempre; nos registos do portal, quem os fez; nos do Jotform, quem pode registar. */
export function podeApagarPresenca(acesso: Acesso | null | undefined, podeRegistar: boolean, r: RegistoLote): boolean {
  const gestor = acesso?.papel === 'master' || acesso?.papel === 'caf';
  return gestor || (eRegistoDoPortal(r) ? r.extra?.registadoPor === acesso?.email : podeRegistar);
}

/** Texto da confirmação antes de apagar (os do Jotform não voltam a ser importados). */
export const confirmacaoApagar = (r: RegistoLote, comunidade: string) =>
  `Apagar o registo de ${r.evento} em ${dataPt(r.data)} (${comunidade})?${eRegistoDoPortal(r) ? '' : ' Veio do Jotform: não volta a ser importado (o Jotform não é alterado).'}`;

/** Apaga um registo de presenças, com auditoria e recálculo (Master e CAF). */
export async function apagarPresenca(acesso: Acesso, l: Lote, rid: string): Promise<void> {
  const r = l.registos.find((x) => x.id === rid)!;
  await gravarLote(removerRegisto(l, rid));
  await auditar(acesso.email, 'apagar registo de presenças', `${dataPt(r.data)} · ${r.evento} · ${l.comunidadeId}`);
  if (acesso.papel === 'master' || acesso.papel === 'caf') await recalcularAno(acesso, l.ano);
}
