import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { CampoData, Estado, Modal, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { lerConfigAssistencia, listarComunidades, listarExcecoes, listarLotes } from '../lib/db';
import { registosEmFalta, totalEmFalta, type FaltasComunidade } from '../lib/domingos';
import { dataPT, hoje, norm, num } from '../lib/format';
import { comunidadesDoUtilizador, duplicadosPresenca, filtrarLotesPresenca, type FiltroPresencas, eRegistoDoPortal, resumoRegistoPresenca, type EntradaPresenca } from '../lib/presencas';
import { Contador } from './Contador';
import { apagarPresenca, confirmacaoApagar, podeApagarPresenca, useRegistoPresenca } from '../presencas/useRegistoPresenca';
import { IDS_BASE, catalogoContagens, descreverQuando, eventosEfetivos, type Contagem } from '../lib/eventos';
import type { Comunidade, Lote } from '../lib/types';

const dataPt = dataPT;
/** dd/mm/aaaa hh:mm (hora de Lisboa). */
const dataHora = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' })} ${d.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' })}`; };

/** Comunidades a que o utilizador tem acesso (as únicas que o registo oferece). */
export function useComunidadesDoUtilizador() {
  const { acesso } = useAuth();
  const coms = useCarregar(listarComunidades, []);
  return { ...coms, dados: coms.dados ? comunidadesDoUtilizador(coms.dados, acesso?.comunidades ?? []) : undefined };
}

/** Lotes de presenças do ano nas comunidades do utilizador. */
export function useLotesPresencas(ano: number) {
  const { acesso } = useAuth();
  // ano 0: nada a carregar (ex.: a app Presenças já tem o ano atual).
  return useCarregar(() => (ano ? listarLotes(acesso!, 'assistencia', ano, false) : Promise.resolve([])), [ano, acesso?.email]);
}

/** Formulário de registo, equivalente ao Jotform "CCLX : Registo de Presenças". Só grava no portal. */
export function FormularioPresencas({ comunidades, lotes, aposGravar, edicao, aoFechar, inicial, aoMudarRascunho }: {
  comunidades: Comunidade[]; lotes: Lote[]; aposGravar: () => Promise<void>;
  /** Avisa quando há (ou deixa de haver) um registo começado por gravar. */
  aoMudarRascunho?: (ativo: boolean) => void;
  /** Valores iniciais de um registo novo (ex.: um domingo em falta escolhido na consulta). */
  inicial?: Partial<EntradaPresenca>;
  /** Corrigir um registo existente (do portal ou do Jotform), no mesmo mês e comunidade. */
  edicao?: { lote: Lote; registoId: string }; aoFechar?: () => void;
}) {
  const {
    config, e, setE, original, unica, recolhe, nomes, opcoes, opcoesNomes, evSel, eOutra, raiz, campoErro, erroEm, msg, setMsg, aGuardar, guardar,
    sucesso, setSucesso, contador, setContador, guardadoEm, comRascunho, valorDe, mudar, somar, valoresContador, descartar, outrosRascunhos, limpar,
  } = useRegistoPresenca({ comunidades, lotes, aposGravar, edicao, aoFechar, inicial, aoMudarRascunho });
  const campoNum = (c: Contagem) => (
    <label key={c.id} className={['campo', erroEm(c.id)].filter(Boolean).join(' ')}>{`${c.nome} *`}<input aria-invalid={campoErro === c.id || undefined} type="number" inputMode="numeric" min={0} step={1} value={Number.isNaN(valorDe(c.id)) ? '' : valorDe(c.id)} onChange={(ev) => mudar(c.id, ev.target.value)} /></label>
  );

  if (config.aCarregar) return <Estado aCarregar erro={null} />;
  if (!comunidades.length && !edicao) return <div className="aviso">Não tem comunidades atribuídas. Peça ao administrador do portal que lhe dê acesso a uma comunidade.</div>;
  return (
    <div ref={raiz} className={edicao ? 'form-presencas' : 'card sec form-presencas'}>
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
        <div className={erroEm('data')}><CampoData rotulo={edicao ? 'Data do evento (no mesmo mês)' : 'Data do evento'} obrigatorio valor={e.data} max={hoje()} onChange={(d) => setE({ ...e, data: d })} /></div>
        <label className={['campo', erroEm('evento')].filter(Boolean).join(' ')}>Evento *
          <select value={e.evento} aria-invalid={campoErro === 'evento' || undefined} onChange={(ev) => setE({ ...e, evento: ev.target.value })}>
            <option value="">Escolha…</option>
            {opcoesNomes.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          {evSel && <span className="small muted">{evSel.descricao ? `${evSel.descricao} · ` : ''}{descreverQuando(evSel)}</span>}
          {!opcoes.length && <span className="small muted">Nenhum evento ocorre neste dia da semana.</span>}
        </label>
        {eOutra && <label className={['campo', erroEm('descricao')].filter(Boolean).join(' ')}>Descrição *<input aria-invalid={campoErro === 'descricao' || undefined} value={e.descricao ?? ''} onChange={(ev) => setE({ ...e, descricao: ev.target.value })} /></label>}
        <label className={['campo', erroEm('comunidade')].filter(Boolean).join(' ')}>Comunidade *
          <select value={e.comunidadeId} aria-invalid={campoErro === 'comunidade' || undefined} disabled={!!edicao} onChange={(ev) => setE({ ...e, comunidadeId: ev.target.value })}>
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
      <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>Campos com * são obrigatórios; as contagens em branco gravam-se como 0 (zero).{edicao ? ' A correção fica registada no registo e na auditoria (o quê, quem e quando). O Jotform não é alterado.' : ''}</p>
      <div className="acoes" style={{ marginTop: 14 }}>
        <button onClick={() => void guardar()} disabled={aGuardar}>{aGuardar ? 'A guardar…' : edicao ? 'Guardar correção' : 'Guardar registo'}</button>
        {edicao
          ? <button className="sec" onClick={aoFechar}>Cancelar</button>
          : <button className="sec" onClick={limpar}>Limpar</button>}
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

/** Registos em falta por comunidade (null enquanto a configuração e as exceções carregam). */
export function useFaltasPresencas({ ano, hoje: hojeIso, comunidades, lotes }: { ano: number; hoje: string; comunidades: Comunidade[]; lotes: Lote[] }): { falta: FaltasComunidade[]; eventos: string[] } | null {
  const config = useCarregar(lerConfigAssistencia, []);
  const excecoes = useCarregar(listarExcecoes, []);
  if (config.aCarregar || excecoes.aCarregar) return null;
  const falta = registosEmFalta({ ano, hoje: hojeIso, comunidades, assistencia: lotes, excecoes: excecoes.dados ?? [], eventos: eventosEfetivos(config.dados), eventoCelebracao: config.dados?.eventoCelebracao ?? null });
  return { falta, eventos: [...new Set(falta.flatMap((f) => f.emFalta.map((x) => x.evento)))] };
}

/** Registos em falta (eventos com contagem obrigatória), por comunidade do utilizador. Tocar num abre o registo desse dia e evento. */
export function RegistosEmFaltaLista({ ano, hoje: hojeIso, comunidades, lotes, aoEscolher, compacto, semTitulo }: {
  ano: number; hoje: string; comunidades: Comunidade[]; lotes: Lote[]; aoEscolher: (data: string, comunidadeId: string, evento: string) => void;
  /** Painel lateral: título mais pequeno e só as comunidades com registos em falta. */
  compacto?: boolean;
  /** O título fica fora (ex.: no <summary> de uma secção colapsável). */
  semTitulo?: boolean;
}) {
  const dados = useFaltasPresencas({ ano, hoje: hojeIso, comunidades, lotes });
  if (!dados) return null;
  const { falta, eventos: eventosObrig } = dados;
  const nomes = new Map(comunidades.map((c) => [c.id, c.nome]));
  const mostrar = compacto ? falta.filter((f) => f.emFalta.length) : falta;
  const totalFalta = totalEmFalta(falta);
  return (
    <div className={compacto ? 'domingos-falta compacto' : 'sec domingos-falta'}>
      {semTitulo ? null : compacto ? <h2 style={{ marginTop: 0 }}>Registos em falta <span className={totalFalta ? 'neg' : 'muted'}>({num(totalFalta)})</span></h2> : <h2>Registos em falta</h2>}
      <p className="muted small">Dias até ontem sem registo dos eventos com contagem obrigatória{eventosObrig.length ? ` (${eventosObrig.join(', ')})` : ''}. Não contam as datas sem assistência esperada (exceções). Toque num registo em falta para o registar.</p>
      {compacto && !totalFalta && falta.length > 0 && <p className="ok-box small">Está tudo registado.</p>}
      {mostrar.map((f) => (
        <div key={f.comunidadeId} className="card df-comunidade">
          <div className="df-cabeca"><b>{nomes.get(f.comunidadeId) ?? f.comunidadeId}</b>
            <span className={f.emFalta.length ? 'neg' : 'muted'}>{f.emFalta.length ? `${num(f.emFalta.length)} em falta` : 'Tudo registado'}</span>
            <span className="muted small">{num(f.comRegisto)} de {num(f.esperados)} registos</span>
          </div>
          {f.emFalta.length > 0 && (
            <div className="df-datas">
              {[...f.emFalta].reverse().map((x) => (
                <button key={`${x.data}|${x.evento}`} className="df-data" onClick={() => aoEscolher(x.data, f.comunidadeId, x.evento)} aria-label={`Registar ${x.evento} de ${dataPt(x.data)} em ${nomes.get(f.comunidadeId) ?? f.comunidadeId}`}>
                  <span>{dataPt(x.data)}</span> <span className="df-evento">{x.evento}</span> <span className="small">Registar</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {!falta.length && <p className="muted">Sem registos obrigatórios neste período. Marque a contagem como obrigatória no evento (Configuração → Assistência).</p>}
    </div>
  );
}

/** Lista de registos de presenças (do portal ou de todos), uma linha por registo com todas as contagens. */
export function ListaPresencas({ lotes, comunidades, soPortal, aposApagar }: { lotes: Lote[]; comunidades: Comunidade[]; soPortal: boolean; aposApagar: () => Promise<void> }) {
  const { acesso, pode } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const [aCorrigir, setACorrigir] = useState<{ lote: Lote; registoId: string } | null>(null);
  const config = useCarregar(lerConfigAssistencia, []);
  const extras = catalogoContagens(config.dados).filter((c) => !IDS_BASE.includes(c.id));
  const nomes = new Map(comunidades.map((c) => [c.id, c.nome]));
  // Registos importados do Jotform também se apagam no portal (a sincronização não os volta a importar).
  const podeApagar = (r: Lote['registos'][number]) => podeApagarPresenca(acesso, pode('registar'), r);
  const duplicados = duplicadosPresenca(lotes);

  async function apagar(l: Lote, rid: string) {
    const r = l.registos.find((x) => x.id === rid)!;
    if (!confirm(confirmacaoApagar(r, nomes.get(l.comunidadeId) ?? l.comunidadeId))) return;
    try {
      await apagarPresenca(acesso!, l, rid);
      await aposApagar();
    } catch (err) { setErro(mensagemErro(err)); }
  }

  const linhas = lotes.filter((l) => nomes.has(l.comunidadeId))
    .flatMap((l) => l.registos.filter((r) => !soPortal || eRegistoDoPortal(r)).map((r) => ({ l, r })))
    .sort((a, b) => b.r.data.localeCompare(a.r.data)).slice(0, soPortal ? 30 : 200);
  if (!linhas.length) return <p className="muted">Sem registos.</p>;
  const contagens = resumoRegistoPresenca(linhas[0].r, extras).detalhes.map((d) => d.rotulo);
  return (
    <>
      {erro && <div className="aviso">{erro}</div>}
      <div className="tabela"><table className="tabela-presencas">
        <thead><tr>
          <th>Data</th><th>Evento</th><th>Comunidade</th><th className="num">Jovens e adultos</th>
          {contagens.map((c) => <th key={c} className="num">{c}</th>)}
          <th className="num">Total</th><th>Origem</th><th>Última alteração</th><th />
        </tr></thead>
        <tbody>{linhas.map(({ l, r }) => {
          const { total, detalhes } = resumoRegistoPresenca(r, extras);
          const obs = String(r.extra?.observacoes ?? '').trim();
          const portal = eRegistoDoPortal(r);
          return (
            <tr key={r.id} className={duplicados.has(r.id) ? 'duplicado' : ''}>
              <td data-rotulo="Data">{dataPt(r.data)}{duplicados.has(r.id) && <> <span className="etiqueta neg" title="Há mais do que um registo deste evento nesta comunidade neste dia">Duplicado</span></>}</td>
              <td data-rotulo="Evento">{r.evento}{r.descricao ? ` · ${r.descricao}` : ''}{obs && <div className="muted small" title={obs}>{obs.length > 60 ? `${obs.slice(0, 60)}…` : obs}</div>}</td>
              <td data-rotulo="Comunidade">{nomes.get(l.comunidadeId) ?? l.comunidadeId}</td>
              <td className="num" data-rotulo="Jovens e adultos">{num(r.valor)}</td>
              {detalhes.map((d) => <td key={d.rotulo} className="num" data-rotulo={d.rotulo}>{d.valor == null ? '—' : num(d.valor)}</td>)}
              <td className="num" data-rotulo="Total"><b>{num(total)}</b></td>
              <td className="small" data-rotulo="Origem" title={portal ? String(r.extra?.registadoPor ?? '') : undefined}>{portal ? 'Portal' : 'Jotform'}</td>
              <td className="small" data-rotulo="Última alteração" title={r.extra?.alteradoPor ? String(r.extra.alteradoPor) : undefined}>{r.extra?.alteradoEm ? dataHora(String(r.extra.alteradoEm)) : '—'}</td>
              <td className="acoes-linha">
                {pode('registar') && <button className="link" onClick={() => setACorrigir({ lote: l, registoId: r.id })}>Corrigir</button>}
                {podeApagar(r) && <button className="link" onClick={() => void apagar(l, r.id)}>Apagar</button>}
              </td>
            </tr>
          );
        })}</tbody>
      </table></div>
      {aCorrigir && (
        <Modal titulo="Corrigir registo de presenças" onFechar={() => setACorrigir(null)}>
          <FormularioPresencas comunidades={comunidades} lotes={lotes} edicao={aCorrigir} aoFechar={() => setACorrigir(null)} aposGravar={aposApagar} />
        </Modal>
      )}
    </>
  );
}

/** Filtros da lista de registos: comunidade, intervalo de datas e tipo de culto. */
export function FiltrosListaPresencas({ comunidades, lotes, filtro, aoMudar }: {
  comunidades: Comunidade[]; lotes: Lote[]; filtro: FiltroPresencas; aoMudar: (f: FiltroPresencas) => void;
}) {
  const config = useCarregar(lerConfigAssistencia, []);
  // Tipos de culto: os configurados e os que existem nos registos (ex.: vindos do Jotform).
  const tipos = [...new Map([...eventosEfetivos(config.dados).map((e) => e.nome), ...lotes.flatMap((l) => l.registos.map((r) => r.evento ?? ''))]
    .filter((x) => x.trim()).map((x) => [norm(x), x] as [string, string])).values()].sort((a, b) => a.localeCompare(b, 'pt'));
  const ativo = !!(filtro.de || filtro.ate || filtro.evento || filtro.soDuplicados || filtro.contagem || (filtro.comunidadeId && filtro.comunidadeId !== 'todas'));
  const contagens = catalogoContagens(config.dados);
  const nDup = duplicadosPresenca(filtrarLotesPresenca(lotes, { comunidadeId: filtro.comunidadeId })).size;
  return (
    <div className="filtros linha" style={{ alignItems: 'flex-end', marginBottom: 10 }}>
      {comunidades.length > 1 && (
        <label className="campo">Comunidade
          <select value={filtro.comunidadeId ?? 'todas'} onChange={(e) => aoMudar({ ...filtro, comunidadeId: e.target.value })}>
            <option value="todas">Todas as minhas</option>
            {comunidades.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
      )}
      <CampoData rotulo="De" valor={filtro.de ?? ''} onChange={(d) => aoMudar({ ...filtro, de: d || undefined })} />
      <CampoData rotulo="Até" valor={filtro.ate ?? ''} onChange={(d) => aoMudar({ ...filtro, ate: d || undefined })} />
      <label className="campo">Tipo de culto
        <select value={filtro.evento ?? ''} onChange={(e) => aoMudar({ ...filtro, evento: e.target.value || undefined })}>
          <option value="">Todos</option>
          {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="campo">Contagem
        <select value={filtro.contagem ? `${filtro.contagem}|${filtro.contagemCond ?? 'preenchida'}` : ''} onChange={(e) => { const [c, cond] = e.target.value.split('|'); aoMudar({ ...filtro, contagem: c || undefined, contagemCond: c ? (cond as 'preenchida' | 'vazia') : undefined }); }}>
          <option value="">Todas</option>
          {contagens.map((c) => <option key={`${c.id}p`} value={`${c.id}|preenchida`}>{`${c.nome}: preenchida`}</option>)}
          {contagens.map((c) => <option key={`${c.id}v`} value={`${c.id}|vazia`}>{`${c.nome}: em branco ou 0`}</option>)}
        </select>
      </label>
      <label className="opcao" style={{ alignSelf: 'center' }}><input type="checkbox" checked={!!filtro.soDuplicados} onChange={(e) => aoMudar({ ...filtro, soDuplicados: e.target.checked || undefined })} /> Só duplicados{nDup ? ` (${nDup})` : ''}</label>
      {ativo && <button className="sec" onClick={() => aoMudar({ comunidadeId: filtro.comunidadeId && comunidades.length > 1 ? 'todas' : undefined })}>Limpar filtros</button>}
    </div>
  );
}

/** Página "Registar presenças" dentro do portal: formulário, registos em falta (colapsável, preenche o formulário) e registos com filtros. */
export default function RegistarPresencas() {
  const coms = useComunidadesDoUtilizador();
  const { ano, comunidade, setComunidade } = useFiltros();
  const lotes = useLotesPresencas(ano);
  const comunidades = coms.dados ?? [];
  // Vindo dos Registos em falta: ?data=…&comunidade=…&evento=… preenche o formulário.
  const [params, setParams] = useSearchParams();
  const doLink: Partial<EntradaPresenca> = Object.fromEntries(Object.entries({ data: params.get('data'), comunidadeId: params.get('comunidade'), evento: params.get('evento') }).filter(([, v]) => v)) as Partial<EntradaPresenca>;
  const inicial: Partial<EntradaPresenca> = Object.keys(doLink).length ? doLink : comunidade !== 'todas' ? { comunidadeId: comunidade } : {};
  const [filtro, setFiltro] = useState<Omit<FiltroPresencas, 'comunidadeId'>>({});
  const filtrados = filtrarLotesPresenca(lotes.dados ?? [], { ...filtro, comunidadeId: comunidade });
  const idsComunidades = new Set(comunidades.map((c) => c.id));
  const nRegistos = filtrados.filter((l) => idsComunidades.has(l.comunidadeId)).reduce((s, l) => s + l.registos.length, 0);
  // Registos em falta das comunidades do filtro do topo; escolher um preenche o formulário deste ecrã.
  const comunidadesFalta = comunidade === 'todas' ? comunidades : comunidades.filter((c) => c.id === comunidade);
  const faltas = useFaltasPresencas({ ano, hoje: hoje(), comunidades: comunidadesFalta, lotes: lotes.dados ?? [] });
  const nFalta = faltas ? totalEmFalta(faltas.falta) : 0;
  const emCurso = useRef(false);
  const aoMudarRascunho = useCallback((ativo: boolean) => { emCurso.current = ativo; }, []);
  const formulario = useRef<HTMLDivElement>(null);
  const [focar, setFocar] = useState(0);
  useEffect(() => {
    if (!focar || !formulario.current) return;
    formulario.current.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    formulario.current.querySelector<HTMLInputElement>('input[type="number"]')?.focus({ preventScroll: true });
  }, [focar]);
  function escolherEmFalta(data: string, comunidadeId: string, evento: string) {
    if (emCurso.current && !confirm('Substituir o registo em curso? Fica como rascunho neste dispositivo.')) return;
    setParams({ data, comunidade: comunidadeId, evento }, { replace: true });
    setFocar((n) => n + 1);
  }
  return (
    <>
      <h1>Registar presenças</h1>
      <p className="muted">Equivalente ao formulário CCLX : Registo de Presenças. Grava só no portal (o Jotform não é alterado) e entra de imediato no mapa de presenças e nos registos em falta. Link direto para telemóvel: <a href="#/registar">portalcaf.cclx.pt/#/registar</a>.</p>
      <Estado aCarregar={coms.aCarregar} erro={coms.erro} />
      <div ref={formulario}>
        {!coms.aCarregar && <FormularioPresencas key={params.toString()} inicial={inicial} comunidades={comunidades} lotes={lotes.dados ?? []} aposGravar={lotes.recarregar} aoMudarRascunho={aoMudarRascunho} />}
      </div>
      {!coms.aCarregar && !lotes.aCarregar && comunidades.length > 0 && (
        <details className="sec card registos-falta">
          <summary><h2>Registos em falta <span className={nFalta ? 'neg' : 'muted'}>({num(nFalta)})</span></h2></summary>
          <RegistosEmFaltaLista compacto semTitulo ano={ano} hoje={hoje()} comunidades={comunidadesFalta} lotes={lotes.dados ?? []} aoEscolher={escolherEmFalta} />
        </details>
      )}
      <details className="sec card registos-falta">
        <summary><h2>Registos de presenças em {ano} <span className="muted">({num(nRegistos)})</span></h2></summary>
        <p className="muted small">Do Jotform e do portal, das suas comunidades (ano e comunidade do filtro do topo). Depois de importados, os registos do Jotform passam a ser do portal: corrigir ou apagar não mexe no Jotform, e a sincronização só traz submissões novas (não repete as apagadas nem um dia e evento já registados). Corrigir e apagar ficam na auditoria.</p>
        {(() => { const n = duplicadosPresenca(filtrarLotesPresenca(lotes.dados ?? [], { comunidadeId: comunidade })).size; return n ? <div className="aviso">{`Há ${n} registos duplicados (mesma comunidade, dia e evento). Use "Só duplicados" para os ver e apague ou corrija os que estão a mais.`}</div> : null; })()}
        <FiltrosListaPresencas comunidades={comunidades} lotes={lotes.dados ?? []} filtro={{ ...filtro, comunidadeId: comunidade }}
          aoMudar={({ comunidadeId, ...f }) => { setFiltro(f); if (comunidadeId) setComunidade(comunidadeId); }} />
        <ListaPresencas lotes={filtrados} comunidades={comunidades} soPortal={false} aposApagar={lotes.recarregar} />
      </details>
    </>
  );
}
