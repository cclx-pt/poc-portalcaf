import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { CampoData, Estado, Modal, mensagemErro, useCarregar } from '../components/ui';
import { auditar, gravarLote, lerConfigAssistencia, lerLote, listarComunidades, listarExcecoes, listarLotes } from '../lib/db';
import { domingosEmFalta } from '../lib/domingos';
import { dataPT, hoje, norm, num } from '../lib/format';
import { EVENTOS_INICIAIS, acrescentarRegisto, comunidadesDoUtilizador, corrigirRegisto, entradaDeRegisto, eRegistoDoPortal, novoRegistoPresenca, removerRegisto, validarPresenca, type EntradaPresenca } from '../lib/presencas';
import { recalcularAno } from '../lib/recalcular';
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
  const [e, setE] = useState<EntradaPresenca>(original ? entradaDeRegisto(original, edicao!.lote.comunidadeId) : { ...vazio(unica), ...inicial });
  const [sucesso, setSucesso] = useState<{ entrada: EntradaPresenca; comunidade: string; nota: string } | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const eventos = config.dados?.eventos?.length ? config.dados.eventos : EVENTOS_INICIAIS;
  const nomes = new Map(comunidades.map((c) => [c.id, c.nome]));
  const eOutra = norm(e.evento) === 'outra';
  const podeRecalcular = acesso?.papel === 'master' || acesso?.papel === 'caf';
  const n = (k: keyof EntradaPresenca) => (v: string) => setE({ ...e, [k]: v === '' ? NaN : Number(v) });

  async function guardarCorrecao() {
    setMsg(null);
    setAGuardar(true);
    try {
      // Relê o lote para não perder alterações feitas entretanto por outra pessoa.
      const atual = (await lerLote(edicao!.lote.id)) ?? edicao!.lote;
      const { lote, alteracoes } = corrigirRegisto(atual, edicao!.registoId, e, acesso!.email, hoje());
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
    const erro = validarPresenca(e, hoje(), lotes);
    if (erro) { setMsg({ tipo: 'erro', texto: erro }); return; }
    setAGuardar(true);
    try {
      const r = novoRegistoPresenca(e, acesso!.email);
      const id = `assistencia_${e.data.slice(0, 4)}_${e.data.slice(5, 7)}_${e.comunidadeId}`;
      const lote = acrescentarRegisto((await lerLote(id)) ?? undefined, r, acesso!.email, e.comunidadeId);
      await gravarLote(lote);
      await auditar(acesso!.email, 'registar presenças', `${dataPt(e.data)} · ${e.evento}${e.descricao ? ` (${e.descricao})` : ''} · ${nomes.get(e.comunidadeId) ?? e.comunidadeId} · ${e.adultos} jovens e adultos`);
      if (podeRecalcular) await recalcularAno(acesso!, Number(e.data.slice(0, 4)));
      setSucesso({ entrada: e, comunidade: nomes.get(e.comunidadeId) ?? e.comunidadeId, nota: podeRecalcular ? 'Resumos recalculados.' : 'Já aparece no mapa de presenças e nos domingos em falta; as médias atualizam no próximo cálculo.' });
      setE(vazio(e.comunidadeId));
      await aposGravar();
    } catch (err) { setMsg({ tipo: 'erro', texto: mensagemErro(err) }); }
    finally { setAGuardar(false); }
  }

  const campoNum = (rot: string, k: 'adultos' | 'jump' | 'criancas' | 'connects') => (
    <label className="campo">{rot} *<input type="number" inputMode="numeric" min={0} step={1} value={Number.isNaN(e[k]) ? '' : e[k]} onChange={(ev) => n(k)(ev.target.value)} /></label>
  );

  if (config.aCarregar) return <Estado aCarregar erro={null} />;
  if (!comunidades.length && !edicao) return <div className="aviso">Não tem comunidades atribuídas. Peça ao administrador do portal que lhe dê acesso a uma comunidade.</div>;
  return (
    <div className={edicao ? 'form-presencas' : 'card sec form-presencas'}>
      {sucesso && <ResumoRegistoGuardado entrada={sucesso.entrada} comunidade={sucesso.comunidade} nota={sucesso.nota} aoFechar={() => setSucesso(null)} />}
      {original?.extra?.alteradoEm && <p className="muted small">Última alteração: {dataHora(String(original.extra.alteradoEm))} · {String(original.extra.alteradoPor ?? '')}</p>}
      {msg && <div className={msg.tipo === 'ok' ? 'ok-box' : 'aviso'} role="status">{msg.texto}</div>}
      <div className="grelha-form">
        <CampoData rotulo={edicao ? 'Data do evento (no mesmo mês)' : 'Data do evento'} obrigatorio valor={e.data} max={hoje()} onChange={(d) => setE({ ...e, data: d })} />
        <label className="campo">Evento *
          <select value={e.evento} onChange={(ev) => setE({ ...e, evento: ev.target.value })}>
            <option value="">Escolha…</option>
            {eventos.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
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
      <div className="grelha-num">
        {campoNum('Jovens e adultos', 'adultos')}
        {campoNum('Jump (12-14)', 'jump')}
        {campoNum('Crianças (3-11)', 'criancas')}
        {campoNum("Connect's (antigos VIP's)", 'connects')}
      </div>
      <label className="campo" style={{ marginTop: 12 }}>Observações<textarea rows={2} value={e.observacoes ?? ''} onChange={(ev) => setE({ ...e, observacoes: ev.target.value })} /></label>
      <div className="acoes" style={{ marginTop: 14 }}>
        <button onClick={() => void guardar()} disabled={aGuardar}>{aGuardar ? 'A guardar…' : edicao ? 'Guardar correção' : 'Guardar registo'}</button>
        {edicao
          ? <button className="sec" onClick={aoFechar}>Cancelar</button>
          : <button className="sec" onClick={() => { setE(vazio(e.comunidadeId)); setMsg(null); }}>Limpar</button>}
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>Campos com * são obrigatórios.{edicao ? ' A correção fica registada no registo e na auditoria (o quê, quem e quando). O Jotform não é alterado.' : ''}</p>
    </div>
  );
}

/** Popup de confirmação depois de um registo novo, com o resumo do que ficou gravado. */
export function ResumoRegistoGuardado({ entrada: e, comunidade, nota, aoFechar }: { entrada: EntradaPresenca; comunidade: string; nota?: string; aoFechar: () => void }) {
  const linhas: [string, string][] = [
    ['Data', dataPt(e.data)], ['Evento', `${e.evento}${e.descricao?.trim() ? ` · ${e.descricao.trim()}` : ''}`], ['Comunidade', comunidade],
    ['Jovens e adultos', num(e.adultos)], ['Jump (12-14)', num(e.jump)], ['Crianças (3-11)', num(e.criancas)], ["Connect's", num(e.connects)],
  ];
  if (e.observacoes?.trim()) linhas.push(['Observações', e.observacoes.trim()]);
  return (
    <Modal titulo="Registo guardado com sucesso" onFechar={aoFechar}>
      <div className="ok-box" role="status">✓ O registo de presenças ficou gravado.</div>
      <table className="resumo-registo"><tbody>
        {linhas.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
        <tr><th scope="row">Total de pessoas</th><td><b>{num(e.adultos + e.jump + e.criancas + e.connects)}</b></td></tr>
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
        <thead><tr><th>Data</th><th>Evento</th><th>Comunidade</th><th className="num">Jovens e adultos</th><th className="num">Jump</th><th className="num">Crianças</th><th className="num">Connect's</th><th>Origem</th><th>Última alteração</th><th /></tr></thead>
        <tbody>{linhas.map(({ l, r }) => (
          <tr key={r.id}>
            <td data-rotulo="Data">{dataPt(r.data)}</td><td data-rotulo="Evento">{r.evento}{r.descricao ? ` · ${r.descricao}` : ''}</td><td data-rotulo="Comunidade">{nomes.get(l.comunidadeId) ?? l.comunidadeId}</td>
            <td className="num" data-rotulo="Jovens e adultos">{num(r.valor)}</td><td className="num" data-rotulo="Jump">{num(Number(r.extra?.jump ?? 0))}</td><td className="num" data-rotulo="Crianças">{num(Number(r.extra?.criancas ?? 0))}</td><td className="num" data-rotulo="Connect's">{num(Number(r.extra?.connects ?? 0))}</td>
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
