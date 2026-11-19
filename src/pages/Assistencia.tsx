import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, GraficoBarras, Kpi, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { SyncEstado } from '../components/SyncEstado';
import { lerConfigAssistencia, listarComunidades, listarExcecoes, listarLotes } from '../lib/db';
import { sincronizarAgora } from '../lib/syncWeb';
import { MESES, MESES_CURTOS, num } from '../lib/format';
import { contaParaMedia, eDomingo, registosEmFalta } from '../lib/domingos';
import { eventosEfetivos } from '../lib/eventos';
import { CATEGORICAS } from '../lib/cores';
import { ocorrenciasDeEvento } from '../lib/presencas';

/** Grupos de idade do Registo de Presenças. Só pessoas: nunca símbolo de moeda. */
const GRUPOS = [
  { key: 'adultos', nome: 'Jovens e adultos' },
  { key: 'jump', nome: 'Jump (12-14)' },
  { key: 'criancas', nome: 'Crianças (3-11)' },
  { key: 'connects', nome: "Connect's" },
] as const;
type Grupo = (typeof GRUPOS)[number]['key'];

interface Linha { data: string; mes: number; comunidadeId: string; evento: string; adultos: number; jump: number; criancas: number; connects: number; total: number }
interface Agregado { n: number; soma: Record<Grupo | 'total', number>; max: number }

const vazio = (): Agregado => ({ n: 0, soma: { adultos: 0, jump: 0, criancas: 0, connects: 0, total: 0 }, max: 0 });
function somar(a: Agregado, l: Linha) {
  a.n++;
  for (const g of GRUPOS) a.soma[g.key] += l[g.key];
  a.soma.total += l.total;
  a.max = Math.max(a.max, l.adultos);
}
const media = (a: Agregado, k: Grupo | 'total') => (a.n ? a.soma[k] / a.n : null);
const m1 = (v: number | null) => num(v, 1);
const dataPt = (d: string) => d.split('-').reverse().join('/');

export default function Assistencia() {
  const { acesso, pode } = useAuth();
  const { ano, comunidade } = useFiltros();
  const [eventoEscolhido, setEvento] = useState<string | null>(null);
  const config = useCarregar(lerConfigAssistencia, []);
  const tipoCelebracao = config.dados?.eventoCelebracao ?? null;
  const lotes = useCarregar(() => listarLotes(acesso!, 'assistencia', ano, false), [ano, acesso?.email]);
  const coms = useCarregar(listarComunidades, []);
  const nomes = new Map((coms.dados ?? []).map((c) => [c.id, c.nome]));
  const excecoes = useCarregar(listarExcecoes, []);
  // "Calcular": traz os registos novos do Jotform (Master), recalcula os resumos e atualiza o mapa e os registos em falta.
  const [aCalcular, setACalcular] = useState(false);
  const [msgCalc, setMsgCalc] = useState<string | null>(null);
  async function calcular() {
    setACalcular(true); setMsgCalc(null);
    try {
      if (acesso?.papel === 'master') {
        const e = await sincronizarAgora(acesso, setMsgCalc, 'incremental');
        const novos = e.resultado.assistencia?.novos ?? 0;
        setMsgCalc(e.ok ? `Atualizado: ${novos} registo${novos === 1 ? '' : 's'} de presenças novo${novos === 1 ? '' : 's'}; resumos recalculados.` : `Terminou com erros: ${e.erros.join('; ')}`);
      } else {
        setMsgCalc('Dados recarregados. A leitura de registos novos do Jotform é feita pela sincronização automática ou pelo Master.');
      }
      await Promise.all([lotes.recarregar(), excecoes.recarregar(), config.recarregar()]);
    } catch (e) { setMsgCalc(mensagemErro(e)); }
    finally { setACalcular(false); }
  }
  const hojeIso = new Date().toISOString().slice(0, 10);

  const todas: Linha[] = useMemo(() => (lotes.dados ?? [])
    .filter((l) => comunidade === 'todas' || l.comunidadeId === comunidade)
    .flatMap((l) => l.registos.map((r) => {
      const x = (k: string) => Number(r.extra?.[k] ?? 0) || 0;
      const adultos = r.valor, jump = x('jump'), criancas = x('criancas'), connects = x('connects');
      return { data: r.data, mes: l.mes, comunidadeId: l.comunidadeId, evento: r.evento?.trim() || 'Sem evento', adultos, jump, criancas, connects, total: adultos + jump + criancas + connects };
    })), [lotes.dados, comunidade]);
  const eventos = [...new Set(todas.map((l) => l.evento))].sort((a, b) => a.localeCompare(b, 'pt'));
  // Por defeito, o filtro mostra o tipo que conta como celebração de domingo (se existir nos dados).
  const evento = eventoEscolhido ?? (tipoCelebracao && eventos.includes(tipoCelebracao) ? tipoCelebracao : 'todos');
  const linhas = todas.filter((l) => evento === 'todos' || l.evento === evento).sort((a, b) => b.data.localeCompare(a.data));

  const porMes = Array.from({ length: 12 }, () => vazio());
  const ano_ = vazio();
  const porCom = new Map<string, Agregado>();
  // Com tipo de celebração configurado, o mapa mostra o evento escolhido no filtro (qualquer dia).
  // Sem configuração, mantém-se a regra anterior: só os registos de domingo entram nos totais.
  const doMapa = tipoCelebracao ? linhas : linhas.filter((l) => eDomingo(l.data));
  const foraDoMapa = linhas.length - doMapa.length;
  // As médias são por evento (ex.: por domingo): os registos da mesma data e evento juntam-se (todas as comunidades filtradas).
  const CAMPOS = ['adultos', 'jump', 'criancas', 'connects', 'total'] as const;
  const comoLinha = (o: { data: string; evento: string } & Record<(typeof CAMPOS)[number], number>, comunidadeId = ''): Linha => ({ ...o, mes: Number(o.data.slice(5, 7)), comunidadeId });
  for (const o of ocorrenciasDeEvento(doMapa, [...CAMPOS])) { const l = comoLinha(o); somar(porMes[l.mes - 1], l); somar(ano_, l); }
  for (const c of [...new Set(doMapa.map((l) => l.comunidadeId))]) {
    const a = vazio();
    for (const o of ocorrenciasDeEvento(doMapa.filter((l) => l.comunidadeId === c), [...CAMPOS])) somar(a, comoLinha(o, c));
    porCom.set(c, a);
  }
  const unidade = tipoCelebracao && evento !== 'todos' && evento === tipoCelebracao ? 'domingo' : 'evento';
  const mesesComDados = porMes.filter((m) => m.n).length;
  const mediaMensal = (k: Grupo | 'total') => (mesesComDados ? ano_.soma[k] / mesesComDados : null);
  const melhor = porMes.map((m, i) => ({ i, v: media(m, 'adultos') ?? -1 })).sort((a, b) => b.v - a.v)[0];
  const grafico = porMes.map((m, i) => ({
    rotulo: MESES_CURTOS[i],
    ...Object.fromEntries(GRUPOS.map((g) => [g.key, m.n ? Math.round((m.soma[g.key] / m.n) * 10) / 10 : 0])),
  }));

  const falta = registosEmFalta({
    ano, hoje: hojeIso, comunidades: (coms.dados ?? []).filter((c) => (c.ativo ?? true) && (comunidade === 'todas' || c.id === comunidade)),
    assistencia: lotes.dados ?? [], excecoes: excecoes.dados ?? [], eventos: eventosEfetivos(config.dados), eventoCelebracao: tipoCelebracao,
  });

  const emFaltaTotal = falta.reduce((s0, f) => s0 + f.emFalta.length, 0);
  const esperadosTotal = falta.reduce((s0, f) => s0 + f.esperados, 0);

  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1>Presenças por evento {ano}</h1>
          <p className="muted">Registo de presenças nos cultos e restantes atividades da comunidade (formulário CCLX : Registo de Presenças). Valores em número de pessoas. A média de jovens e adultos dos últimos 12 meses serve para distribuir, cada mês, a bolsa geral e os gerais.</p>
          <SyncEstado />
        </div>
        <div className="acoes">
          {pode('registar') && <a className="btn" href={`${import.meta.env.BASE_URL}#/registos/presencas/novo`}>Registar presenças</a>}
          <button onClick={() => void calcular()} disabled={aCalcular} title="Vai buscar os registos novos ao Jotform e atualiza o mapa e os registos em falta">{aCalcular ? 'A calcular…' : 'Calcular'}</button>
        </div>
      </div>

      {msgCalc && <div className="nota">{msgCalc}</div>}
      <div className="filtros" style={{ marginBottom: 12 }}>
        <label className="campo">Evento
          <select value={evento} onChange={(e) => setEvento(e.target.value)}>
            <option value="todos">Todos os eventos</option>
            {eventos.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
      </div>

      <Estado aCarregar={lotes.aCarregar} erro={lotes.erro} vazio={!linhas.length} />
      {!!linhas.length && <>
        <div className="cards">
          <Kpi titulo={unidade === 'domingo' ? 'Domingos com registo' : 'Eventos com registo'} valor={num(ano_.n)} sub={`${num(doMapa.length)} registos em ${mesesComDados} ${mesesComDados === 1 ? 'mês' : 'meses'}`} />
          <Kpi titulo="Média de jovens e adultos" valor={m1(media(ano_, 'adultos'))} sub={`por ${unidade}`} />
          <Kpi titulo="Média total de pessoas" valor={m1(media(ano_, 'total'))} sub={`por ${unidade}, todas as idades`} />
          <Kpi titulo="Registos em falta" valor={num(emFaltaTotal)} negativo={emFaltaTotal > 0}
            sub={esperadosTotal ? <a href="#registos-em-falta" onClick={(e) => { e.preventDefault(); document.getElementById('registos-em-falta')?.scrollIntoView({ behavior: 'smooth' }); }}>{`de ${num(esperadosTotal)} esperados · ${num((1 - emFaltaTotal / esperadosTotal) * 100, 1)}% registados`}</a> : 'Sem eventos obrigatórios'} />
          <Kpi titulo="Mês com maior média" valor={melhor && melhor.v >= 0 ? MESES[melhor.i] : '—'} sub={melhor && melhor.v >= 0 ? `${m1(melhor.v)} jovens e adultos` : undefined} />
        </div>

        <div className="card sec">
          <h2>Média de pessoas por {unidade}, por mês</h2>
          <GraficoBarras dados={grafico} series={GRUPOS.map((g, i) => ({ key: g.key, nome: g.nome, cor: CATEGORICAS[i] }))} empilhado unidade="pessoas" altura={260} />
        </div>

        <div className="sec">
          <h2>Mapa mensal</h2>
          <p className="muted small">
            {tipoCelebracao
              ? <>Mapa do evento escolhido no filtro. Para a bolsa geral, os gerais e os valores por pessoa conta só o tipo "{tipoCelebracao}" (escolhido na Configuração).</>
              : <>Sem tipo de celebração escolhido na Configuração: contam os registos feitos a um domingo{foraDoMapa ? `; ${foraDoMapa} registo(s) noutros dias aparecem na lista mas não entram nas contas` : ''}.</>}
            {' '}Total = soma das presenças registadas no mês. Média = total a dividir pelo número de {unidade === 'domingo' ? 'domingos' : 'eventos'} (cada data conta uma vez, somando as comunidades do filtro). Máx. = maior número de jovens e adultos num só {unidade}.</p>
          <div className="tabela"><table>
            <thead>
              <tr>
                <th rowSpan={2}>Mês</th><th rowSpan={2} className="num">{unidade === 'domingo' ? 'Domingos' : 'Eventos'}</th>
                <th colSpan={3} className="num">Jovens e adultos</th>
                <th colSpan={2} className="num">Jump (12-14)</th>
                <th colSpan={2} className="num">Crianças (3-11)</th>
                <th colSpan={2} className="num">Connect's</th>
                <th colSpan={2} className="num">Total de pessoas</th>
              </tr>
              <tr>
                <th className="num">Total</th><th className="num">Média</th><th className="num">Máx.</th>
                <th className="num">Total</th><th className="num">Média</th>
                <th className="num">Total</th><th className="num">Média</th>
                <th className="num">Total</th><th className="num">Média</th>
                <th className="num">Total</th><th className="num">Média</th>
              </tr>
            </thead>
            <tbody>
              {porMes.map((m, i) => (
                <tr key={i} className={m.n ? '' : 'muted'}>
                  <td>{MESES[i]}</td><td className="num">{m.n ? num(m.n) : '—'}</td>
                  <td className="num">{m.n ? num(m.soma.adultos) : '—'}</td><td className="num">{m1(media(m, 'adultos'))}</td><td className="num">{m.n ? num(m.max) : '—'}</td>
                  {(['jump', 'criancas', 'connects', 'total'] as const).map((k) => (
                    <FragCel key={k} total={m.n ? m.soma[k] : null} media={media(m, k)} />
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-geral">
                <th>Total do ano</th><th className="num">{num(ano_.n)}</th>
                <th className="num">{num(ano_.soma.adultos)}</th><th className="num">{m1(media(ano_, 'adultos'))}</th><th className="num">{num(ano_.max)}</th>
                {(['jump', 'criancas', 'connects', 'total'] as const).map((k) => <FragCel key={k} total={ano_.soma[k]} media={media(ano_, k)} cab />)}
              </tr>
              <tr>
                <th>Média mensal</th><th className="num">{m1(mesesComDados ? ano_.n / mesesComDados : null)}</th>
                <th className="num">{m1(mediaMensal('adultos'))}</th><th className="num" /><th className="num" />
                {(['jump', 'criancas', 'connects', 'total'] as const).map((k) => <FragCel key={k} total={mediaMensal(k)} media={null} cab decimal />)}
              </tr>
            </tfoot>
          </table></div>
          <p className="muted small">Média mensal = total do ano a dividir pelos meses com registos ({mesesComDados}).</p>
        </div>

        {comunidade === 'todas' && porCom.size > 1 && (
          <div className="sec">
            <h2>Por comunidade</h2>
            <div className="tabela"><table>
              <thead><tr><th>Comunidade</th><th className="num">{unidade === 'domingo' ? 'Domingos' : 'Eventos'}</th><th className="num">{`Média jovens e adultos por ${unidade}`}</th><th className="num">{`Média total de pessoas por ${unidade}`}</th><th className="num">Total jovens e adultos</th><th className="num">Total de pessoas</th></tr></thead>
              <tbody>{[...porCom.entries()].sort((a, b) => (media(b[1], 'adultos') ?? 0) - (media(a[1], 'adultos') ?? 0)).map(([c, a]) => (
                <tr key={c}><td>{nomes.get(c) ?? c}</td><td className="num">{num(a.n)}</td><td className="num">{m1(media(a, 'adultos'))}</td><td className="num">{m1(media(a, 'total'))}</td><td className="num">{num(a.soma.adultos)}</td><td className="num">{num(a.soma.total)}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
        )}

        <div className="sec">
          <h2>Registos ({linhas.length > 500 ? 'últimos 500 de ' : ''}{linhas.length})</h2>
          <div className="tabela"><table>
            <thead><tr><th>Data</th><th>Conta para as médias</th><th>Comunidade</th><th>Evento</th>{GRUPOS.map((g) => <th key={g.key} className="num">{g.nome}</th>)}<th className="num">Total</th></tr></thead>
            <tbody>{linhas.slice(0, 500).map((l, i) => (
              <tr key={i} className={contaParaMedia(l, tipoCelebracao) ? '' : 'muted'}><td>{dataPt(l.data)}</td><td>{contaParaMedia(l, tipoCelebracao) ? 'sim' : 'não'}</td><td>{nomes.get(l.comunidadeId) ?? l.comunidadeId}</td><td>{l.evento}</td>
                {GRUPOS.map((g) => <td key={g.key} className="num">{num(l[g.key])}</td>)}<td className="num">{num(l.total)}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      </>}
      <div className="sec" id="registos-em-falta">
        <h2>Registos em falta</h2>
        <p className="muted small">Dias até ontem sem registo dos eventos com contagem obrigatória (Configuração → Assistência), por comunidade ativa (filtro de comunidade no topo). Não contam as datas sem assistência esperada (exceções).</p>
        {falta.length ? <>
          <div className="tabela"><table>
            <thead><tr><th>Comunidade</th><th className="num">Registos esperados</th><th className="num">Com registo</th><th className="num">Em falta</th><th className="num">Cobertura</th><th>Registos em falta</th></tr></thead>
            <tbody>{falta.map((f) => (
              <tr key={f.comunidadeId}>
                <td>{nomes.get(f.comunidadeId) ?? f.comunidadeId}</td>
                <td className="num">{num(f.esperados)}</td><td className="num">{num(f.comRegisto)}</td>
                <td className={'num' + (f.emFalta.length ? ' neg' : '')}>{num(f.emFalta.length)}</td>
                <td className="num">{f.esperados ? `${num((f.comRegisto / f.esperados) * 100, 1)}%` : '—'}</td>
                <td className="small">{f.emFalta.length ? f.emFalta.map((x) => `${dataPt(x.data)} (${x.evento})`).join(' · ') : '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </> : <p className="muted">Sem registos obrigatórios neste período.</p>}
      </div>

      <p className="muted small">As datas sem assistência esperada (cultos conjuntos, retiros, encerramentos) registam-se na Configuração, no separador Assistência.</p>

    </>
  );
}

function FragCel({ total, media, cab, decimal }: { total: number | null; media: number | null; cab?: boolean; decimal?: boolean }) {
  const T = cab ? 'th' : 'td';
  return <><T className="num">{total == null ? '—' : num(total, decimal ? 1 : 0)}</T><T className="num">{media == null ? (cab && decimal ? '' : '—') : m1(media)}</T></>;
}
