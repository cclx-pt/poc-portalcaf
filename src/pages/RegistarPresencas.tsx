import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { CampoData, Estado, Modal, mensagemErro, useCarregar } from '../components/ui';
import { auditar, gravarLote, lerConfigAssistencia, lerLote, listarComunidades, listarExcecoes, listarLotes } from '../lib/db';
import { domingosEmFalta } from '../lib/domingos';
import { dataPT, hoje, norm, num } from '../lib/format';
import { acrescentarRegisto, comunidadesDoUtilizador, corrigirRegisto, entradaDeRegisto, eRegistoDoPortal, novoRegistoPresenca, removerRegisto, validarPresenca, type EntradaPresenca } from '../lib/presencas';
import { recalcularAno } from '../lib/recalcular';
import { apagarRascunho, armazemLocal, deveGuardarRascunho, guardarRascunho, idRascunho, lerRascunhos } from '../lib/rascunhos';
import { Contador } from './Contador';
import { IDS_BASE, catalogoContagens, descreverQuando, eventoPorNome, eventosEfetivos, eventosParaData, type Contagem } from '../lib/eventos';
import type { Comunidade, Lote } from '../lib/types';

const dataPt = dataPT;
/** dd/mm/aaaa hh:mm (hora de Lisboa). */
const dataHora = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' })} ${d.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' })}`; };
const vazio = (comunidadeId = ''): EntradaPresenca => ({ data: hoje(), evento: '', descricao: '', comunidadeId, adultos: NaN, jump: NaN, criancas: NaN, connects: NaN, observacoes: '' });

/** Comunidades a que o utilizador tem acesso (as únicas que o registo oferece). */
export function useComunidadesDoUtilizador() {
  const { acesso } = useAuth();
  const coms = useCarregar(listarComunidades, []);
  return { ...coms, dados: coms.dados ? comunidadesDoUtilizador(coms.dados, acesso?.comunidades ?? []) : undefined };
}

/** Lotes de presenças do ano nas comunidades do utilizador. */
export function useLotesPresencas(ano: number) {
  const { acesso } = useAuth();
  return useCarregar(() => listarLotes(acesso!, 'assistencia', ano, false), [ano, acesso?.email]);
}

/** Formulário de registo, equivalente ao Jotform "CCLX : Registo de Presenças". Só grava no portal. */
export function FormularioPresencas({ comunidades, lotes, aposGravar, edicao, aoFechar, inicial }: {
  comunidades: Comunidade[]; lotes: Lote[]; aposGravar: () => Promise<void>;
  /** Valores iniciais de um registo novo (ex.: um domingo em falta escolhido na consulta). */
  inicial?: Partial<EntradaPresenca>;
  /** Corrigir um registo existente (do portal ou do Jotform), no mesmo mês e comunidade. */
  edicao?: { lote: Lote; registoId: string }; aoFechar?: () => void;
}) {
  const { acesso } = useAuth();
  const config = useCarregar(lerConfigAssistencia, []);
  const unica = comunidades.length === 1 ? comunidades[0].id : '';
  const original = edicao?.lote.registos.find((r) => r.id === edicao.registoId);
  const catalogo = catalogoContagens(config.dados);
  const idsExtra = catalogo.filter((c) => !IDS_BASE.includes(c.id)).map((c) => c.id);
  const [e, setE] = useState<EntradaPresenca>(original ? entradaDeRegisto(original, edicao!.lote.comunidadeId, idsExtra) : { ...vazio(unica), ...inicial });
  const [sucesso, setSucesso] = useState<{ entrada: EntradaPresenca; comunidade: string; nota: string; contagens: Contagem[] } | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const [contador, setContador] = useState(false);
  const [guardadoEm, setGuardadoEm] = useState<string | undefined>();
  const [rascunhos, setRascunhos] = useState(() => (edicao ? [] : lerRascunhos(armazemLocal(), acesso?.email ?? '')));
  // Rascunho no dispositivo: guarda a cada alteração, quando já há data, evento, comunidade e alguma contagem.
  const comRascunho = !edicao && deveGuardarRascunho(e);
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
  const n = (k: keyof EntradaPresenca) => (v: string) => setE((p) => ({ ...p, [k]: v === '' ? NaN : Number(v) }));

  async function guardarCorrecao() {
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
    } catch (err) { setMsg({ tipo: 'erro', texto: mensagemErro(err) }); }
    finally { setAGuardar(false); }
  }

  async function guardar() {
    if (edicao) return guardarCorrecao();
    setMsg(null);
    if (e.comunidadeId && !nomes.has(e.comunidadeId)) { setMsg({ tipo: 'erro', texto: 'Não tem acesso a esta comunidade.' }); return; }
    const erro = validarPresenca(e, hoje(), lotes, undefined, evSel, nomesContagens);
    if (erro) { setMsg({ tipo: 'erro', texto: erro }); return; }
    setAGuardar(true);
    try {
      const r = novoRegistoPresenca(e, acesso!.email);
      const id = `assistencia_${e.data.slice(0, 4)}_${e.data.slice(5, 7)}_${e.comunidadeId}`;
      const lote = acrescentarRegisto((await lerLote(id)) ?? undefined, r, acesso!.email, e.comunidadeId);
      await gravarLote(lote);
      await auditar(acesso!.email, 'registar presenças', `${dataPt(e.data)} · ${e.evento}${e.descricao ? ` (${e.descricao})` : ''} · ${nomes.get(e.comunidadeId) ?? e.comunidadeId} · ${e.adultos} jovens e adultos`);
      if (podeRecalcular) await recalcularAno(acesso!, Number(e.data.slice(0, 4)));
      setSucesso({ contagens: recolhe, entrada: e, comunidade: nomes.get(e.comunidadeId) ?? e.comunidadeId, nota: podeRecalcular ? 'Resumos recalculados.' : 'Já aparece no mapa de presenças e nos domingos em falta; as médias atualizam no próximo cálculo.' });
      apagarRascunho(armazemLocal(), acesso!.email, idRascunho(e));
      setRascunhos(lerRascunhos(armazemLocal(), acesso!.email));
      setE({ ...vazio(e.comunidadeId), data: e.data });
      await aposGravar();
    } catch (err) { setMsg({ tipo: 'erro', texto: mensagemErro(err) }); }
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
  const campoNum = (c: Contagem) => (
    <label key={c.id} className="campo">{`${c.nome} *`}<input type="number" inputMode="numeric" min={0} step={1} value={Number.isNaN(valorDe(c.id)) ? '' : valorDe(c.id)} onChange={(ev) => mudar(c.id, ev.target.value)} /></label>
  );
  const valoresContador = Object.fromEntries(recolhe.map((c) => [c.id, valorDe(c.id)]));
  const descartar = (id: string) => { apagarRascunho(armazemLocal(), acesso!.email, id); setRascunhos(lerRascunhos(armazemLocal(), acesso!.email)); };
  const outrosRascunhos = rascunhos.filter((r) => r.id !== (comRascunho ? idRascunho(e) : '') && nomes.has(r.entrada.comunidadeId));

  if (config.aCarregar) return <Estado aCarregar erro={null} />;
  if (!comunidades.length && !edicao) return <div className="aviso">Não tem comunidades atribuídas. Peça ao administrador do portal que lhe dê acesso a uma comunidade.</div>;
  return (
    <div className={edicao ? 'form-presencas' : 'card sec form-presencas'}>
      {sucesso && <ResumoRegistoGuardado contagens={sucesso.contagens} entrada={sucesso.entrada} comunidade={sucesso.comunidade} nota={sucesso.nota} aoFechar={() => setSucesso(null)} />}
      {original?.extra?.alteradoEm && <p className="muted small">Última alteração: {dataHora(String(original.extra.alteradoEm))} · {String(original.extra.alteradoPor ?? '')}</p>}
      {msg && <div className={msg.tipo === 'ok' ? 'ok-box' : 'aviso'} role="status">{msg.texto}</div>}
      {contador && (
        <Contador contagens={recolhe} valores={valoresContador} rascunhoAtivo={!edicao && !!e.data && !!e.evento && !!e.comunidadeId} guardadoEm={comRascunho ? guardadoEm : undefined}
          contexto={`${e.data ? dataPt(e.data) : 'sem data'} · ${e.evento || 'evento por escolher'} · ${nomes.get(e.comunidadeId) ?? 'comunidade por escolher'}`}
          aoSomar={somar} aoFechar={() => setContador(false)} />
      )}
      {outrosRascunhos.length > 0 && (
        <div className="nota rascunhos">
          <b>Rascunhos neste dispositivo</b>
          {outrosRascunhos.map((r) => (
            <div key={r.id} className="rascunho-linha">
              <span>{dataPt(r.entrada.data)} · {r.entrada.evento} · {nomes.get(r.entrada.comunidadeId)}{Number.isFinite(r.entrada.adultos) ? ` · ${num(r.entrada.adultos)} jovens e adultos` : ''} <span className="muted">(guardado {dataHora(r.atualizadoEm)})</span></span>
              <span><button className="link" onClick={() => { setE(r.entrada); setMsg(null); }}>Retomar</button>{' '}
                <button className="link" onClick={() => { if (confirm('Descartar este rascunho? As contagens perdem-se.')) descartar(r.id); }}>Descartar</button></span>
            </div>
          ))}
        </div>
      )}
      {comRascunho && <p className="small muted">Rascunho guardado neste dispositivo. Só fica registado ao carregar em Guardar registo.</p>}
      <div className="grelha-form">
        <CampoData rotulo={edicao ? 'Data do evento (no mesmo mês)' : 'Data do evento'} obrigatorio valor={e.data} max={hoje()} onChange={(d) => setE({ ...e, data: d })} />
        <label className="campo">Evento *
          <select value={e.evento} onChange={(ev) => setE({ ...e, evento: ev.target.value })}>
            <option value="">Escolha…</option>
            {opcoesNomes.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          {evSel && <span className="small muted">{evSel.descricao ? `${evSel.descricao} · ` : ''}{descreverQuando(evSel)}</span>}
          {!opcoes.length && <span className="small muted">Nenhum evento ocorre neste dia da semana.</span>}
        </label>
        {eOutra && <label className="campo">Descrição *<input value={e.descricao ?? ''} onChange={(ev) => setE({ ...e, descricao: ev.target.value })} /></label>}
        <label className="campo">Comunidade *
          <select value={e.comunidadeId} disabled={!!edicao} onChange={(ev) => setE({ ...e, comunidadeId: ev.target.value })}>
            {!unica && !edicao && <option value="">Escolha…</option>}
            {edicao && !nomes.has(e.comunidadeId) && <option value={e.comunidadeId}>{e.comunidadeId}</option>}
            {comunidades.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
      </div>
      <div className="linha-contador">
        <button type="button" className="sec" onClick={() => setContador(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: '-3px', marginRight: 6 }}><rect x="3" y="3" width="8" height="8" /><rect x="13" y="3" width="8" height="8" /><rect x="3" y="13" width="8" height="8" /><rect x="13" y="13" width="8" height="8" /></svg>
          Abrir contador
        </button>
        <span className="small muted">Contar por toque, uma contagem por quadrado.</span>
      </div>
      <div className="grelha-num">
        {recolhe.map(campoNum)}
      </div>
      <label className="campo" style={{ marginTop: 12 }}>Observações<textarea rows={2} value={e.observacoes ?? ''} onChange={(ev) => setE({ ...e, observacoes: ev.target.value })} /></label>
      <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>Campos com * são obrigatórios.{edicao ? ' A correção fica registada no registo e na auditoria (o quê, quem e quando). O Jotform não é alterado.' : ''}</p>
      <div className="acoes" style={{ marginTop: 14 }}>
        <button onClick={() => void guardar()} disabled={aGuardar}>{aGuardar ? 'A guardar…' : edicao ? 'Guardar correção' : 'Guardar registo'}</button>
        {edicao
          ? <button className="sec" onClick={aoFechar}>Cancelar</button>
          : <button className="sec" onClick={() => {
            if (comRascunho && !confirm('Limpar o formulário e descartar o rascunho?')) return;
            if (comRascunho) descartar(idRascunho(e));
            setE(vazio(e.comunidadeId)); setMsg(null);
          }}>Limpar</button>}
      </div>
    </div>
  );
}

/** Popup de confirmação depois de um registo novo, com o resumo do que ficou gravado. */
export function ResumoRegistoGuardado({ entrada: e, comunidade, nota, aoFechar, contagens = catalogoContagens().filter((c) => IDS_BASE.includes(c.id)) }: { entrada: EntradaPresenca; comunidade: string; nota?: string; aoFechar: () => void; contagens?: Contagem[] }) {
  const valor = (id: string) => { const v = IDS_BASE.includes(id) ? (e[id as 'adultos'] as number) : e.outras?.[id]; return v == null || Number.isNaN(v) ? 0 : v; };
  const linhas: [string, string][] = [
    ['Data', dataPt(e.data)], ['Evento', `${e.evento}${e.descricao?.trim() ? ` · ${e.descricao.trim()}` : ''}`], ['Comunidade', comunidade],
    ...contagens.map((c) => [c.nome, num(valor(c.id))] as [string, string]),
  ];
  if (e.observacoes?.trim()) linhas.push(['Observações', e.observacoes.trim()]);
  return (
    <Modal titulo="Registo guardado com sucesso" onFechar={aoFechar}>
      <div className="ok-box" role="status">✓ O registo de presenças ficou gravado.</div>
      <table className="resumo-registo"><tbody>
        {linhas.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
        <tr><th scope="row">Total de pessoas</th><td><b>{num(contagens.reduce((s, c) => s + valor(c.id), 0))}</b></td></tr>
      </tbody></table>
      {nota && <p className="muted small">{nota}</p>}
      <div className="acoes" style={{ marginTop: 12 }}><button onClick={aoFechar}>Novo registo</button></div>
    </Modal>
  );
}

/** Domingos sem registo de celebração, por comunidade do utilizador. Tocar num domingo abre o registo desse dia. */
export function DomingosEmFaltaLista({ ano, hoje: hojeIso, comunidades, lotes, aoEscolher }: {
  ano: number; hoje: string; comunidades: Comunidade[]; lotes: Lote[]; aoEscolher: (data: string, comunidadeId: string) => void;
}) {
  const config = useCarregar(lerConfigAssistencia, []);
  const excecoes = useCarregar(listarExcecoes, []);
  if (config.aCarregar || excecoes.aCarregar) return null;
  const evento = config.dados?.eventoCelebracao ?? null;
  const falta = domingosEmFalta({ ano, hoje: hojeIso, comunidades, assistencia: lotes, excecoes: excecoes.dados ?? [], evento });
  const nomes = new Map(comunidades.map((c) => [c.id, c.nome]));
  return (
    <div className="sec domingos-falta">
      <h2>Domingos em falta</h2>
      <p className="muted small">Domingos até hoje sem registo {evento ? `de "${evento}"` : 'de presenças'}. Não contam as exceções (cultos conjuntos, retiros). Toque num domingo para o registar.</p>
      {falta.map((f) => (
        <div key={f.comunidadeId} className="card df-comunidade">
          <div className="df-cabeca"><b>{nomes.get(f.comunidadeId) ?? f.comunidadeId}</b>
            <span className={f.emFalta.length ? 'neg' : 'muted'}>{f.emFalta.length ? `${num(f.emFalta.length)} em falta` : 'Tudo registado'}</span>
            <span className="muted small">{num(f.comRegisto)} de {num(f.esperados)} domingos</span>
          </div>
          {f.emFalta.length > 0 && (
            <div className="df-datas">
              {[...f.emFalta].reverse().map((d) => (
                <button key={d} className="df-data" onClick={() => aoEscolher(d, f.comunidadeId)} aria-label={`Registar ${dataPt(d)} em ${nomes.get(f.comunidadeId) ?? f.comunidadeId}`}>{dataPt(d)} <span className="small">Registar</span></button>
              ))}
            </div>
          )}
        </div>
      ))}
      {!falta.length && <p className="muted">Sem domingos esperados neste período.</p>}
    </div>
  );
}

/** Lista de registos de presenças (do portal ou de todos), com Apagar nos registos feitos no portal. */
export function ListaPresencas({ lotes, comunidades, soPortal, aposApagar }: { lotes: Lote[]; comunidades: Comunidade[]; soPortal: boolean; aposApagar: () => Promise<void> }) {
  const { acesso, pode } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const [aCorrigir, setACorrigir] = useState<{ lote: Lote; registoId: string } | null>(null);
  const config = useCarregar(lerConfigAssistencia, []);
  const extras = catalogoContagens(config.dados).filter((c) => !IDS_BASE.includes(c.id));
  const nomes = new Map(comunidades.map((c) => [c.id, c.nome]));
  const podeRecalcular = acesso?.papel === 'master' || acesso?.papel === 'caf';
  const podeApagar = (r: Lote['registos'][number]) => eRegistoDoPortal(r) && (podeRecalcular || r.extra?.registadoPor === acesso?.email);

  async function apagar(l: Lote, rid: string) {
    const r = l.registos.find((x) => x.id === rid)!;
    if (!confirm(`Apagar o registo de ${r.evento} em ${dataPt(r.data)} (${nomes.get(l.comunidadeId) ?? l.comunidadeId})?`)) return;
    try {
      await gravarLote(removerRegisto(l, rid));
      await auditar(acesso!.email, 'apagar registo de presenças', `${dataPt(r.data)} · ${r.evento} · ${l.comunidadeId}`);
      if (podeRecalcular) await recalcularAno(acesso!, l.ano);
      await aposApagar();
    } catch (err) { setErro(mensagemErro(err)); }
  }

  const linhas = lotes.filter((l) => nomes.has(l.comunidadeId))
    .flatMap((l) => l.registos.filter((r) => !soPortal || eRegistoDoPortal(r)).map((r) => ({ l, r })))
    .sort((a, b) => b.r.data.localeCompare(a.r.data)).slice(0, soPortal ? 30 : 200);
  if (!linhas.length) return <p className="muted">Sem registos.</p>;
  return (
    <>
      {erro && <div className="aviso">{erro}</div>}
      <div className="tabela"><table className="tabela-presencas">
        <thead><tr><th>Data</th><th>Evento</th><th>Comunidade</th><th className="num">Jovens e adultos</th><th className="num">Jump</th><th className="num">Crianças</th><th className="num">Connect's</th>{extras.map((c) => <th key={c.id} className="num">{c.nome}</th>)}<th>Origem</th><th>Última alteração</th><th /></tr></thead>
        <tbody>{linhas.map(({ l, r }) => (
          <tr key={r.id}>
            <td data-rotulo="Data">{dataPt(r.data)}</td><td data-rotulo="Evento">{r.evento}{r.descricao ? ` · ${r.descricao}` : ''}</td><td data-rotulo="Comunidade">{nomes.get(l.comunidadeId) ?? l.comunidadeId}</td>
            <td className="num" data-rotulo="Jovens e adultos">{num(r.valor)}</td><td className="num" data-rotulo="Jump">{num(Number(r.extra?.jump ?? 0))}</td><td className="num" data-rotulo="Crianças">{num(Number(r.extra?.criancas ?? 0))}</td><td className="num" data-rotulo="Connect's">{num(Number(r.extra?.connects ?? 0))}</td>
            {extras.map((c) => <td key={c.id} className="num" data-rotulo={c.nome}>{r.extra?.[c.id] != null ? num(Number(r.extra[c.id])) : '—'}</td>)}
            <td className="small muted" data-rotulo="Origem">{eRegistoDoPortal(r) ? `Portal · ${String(r.extra?.registadoPor ?? '')}` : 'Jotform'}</td>
            <td className="small muted" data-rotulo="Última alteração">{r.extra?.alteradoEm ? `${dataHora(String(r.extra.alteradoEm))} · ${String(r.extra.alteradoPor ?? '')}` : '—'}</td>
            <td className="acoes-linha">
              {pode('registar') && <button className="link" onClick={() => setACorrigir({ lote: l, registoId: r.id })}>Corrigir</button>}
              {podeApagar(r) && <button className="link" onClick={() => void apagar(l, r.id)}>Apagar</button>}
            </td>
          </tr>
        ))}</tbody>
      </table></div>
      {aCorrigir && (
        <Modal titulo="Corrigir registo de presenças" onFechar={() => setACorrigir(null)}>
          <FormularioPresencas comunidades={comunidades} lotes={lotes} edicao={aCorrigir} aoFechar={() => setACorrigir(null)} aposGravar={aposApagar} />
        </Modal>
      )}
    </>
  );
}

/** Página "Registar presenças" dentro do portal. */
export default function RegistarPresencas() {
  const coms = useComunidadesDoUtilizador();
  const ano = new Date().getFullYear();
  const lotes = useLotesPresencas(ano);
  const comunidades = coms.dados ?? [];
  return (
    <>
      <h1>Registar presenças</h1>
      <p className="muted">Equivalente ao formulário CCLX : Registo de Presenças. Grava só no portal (o Jotform não é alterado) e entra de imediato no mapa de presenças e nos domingos em falta. Link direto para telemóvel: <a href="#/registar">portalcaf.cclx.pt/#/registar</a>.</p>
      <Estado aCarregar={coms.aCarregar} erro={coms.erro} />
      {!coms.aCarregar && <FormularioPresencas comunidades={comunidades} lotes={lotes.dados ?? []} aposGravar={lotes.recarregar} />}
      <div className="sec">
        <h2>Registos de presenças em {ano}</h2>
        <p className="muted small">Do Jotform e do portal, das suas comunidades. Corrigir guarda quem alterou e quando, e fica na auditoria; só se apagam registos feitos no portal.</p>
        <ListaPresencas lotes={lotes.dados ?? []} comunidades={comunidades} soPortal={false} aposApagar={lotes.recarregar} />
      </div>
    </>
  );
}
