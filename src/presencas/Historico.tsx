import { useState } from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { mensagemErro, useCarregar } from '../components/ui';
import { lerConfigAssistencia } from '../lib/db';
import { dataPT, hoje, norm, num } from '../lib/format';
import { IDS_BASE, catalogoContagens, eventosEfetivos } from '../lib/eventos';
import { duplicadosPresenca, eRegistoDoPortal, filtrarLotesPresenca, resumoRegistoPresenca, type FiltroPresencas } from '../lib/presencas';
import { agruparHistorico, filtrarOrigem, type OrigemPresenca } from '../lib/presencasHistorico';
import { useLotesPresencas } from '../pages/RegistarPresencas';
import type { Lote } from '../lib/types';
import { apagarPresenca, confirmacaoApagar, podeApagarPresenca } from './useRegistoPresenca';
import { FormularioPz } from './Registar';
import { EstadoPz, Mensagem, Painel, diaSemana, nomeMes, usePz } from './ui';

type Modo = 'todos' | 'dia' | 'periodo';
interface Filtros { ano: number; comunidadeId: string; evento?: string; contagem?: string; contagemCond?: 'preenchida' | 'vazia'; origem?: OrigemPresenca; soDuplicados?: boolean }

/** Histórico: registos por mês e dia (dias recolhidos, um aberto de cada vez), pesquisa por data e filtros num painel. */
export function Historico() {
  const { acesso, pode } = useAuth();
  const pz = usePz();
  const anoAtual = Number(hoje().slice(0, 4));
  const [f, setF] = useState<Filtros>({ ano: anoAtual, comunidadeId: pz.comunidade });
  const [modo, setModo] = useState<Modo>('todos');
  const [dia, setDia] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [painel, setPainel] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [aCorrigir, setACorrigir] = useState<{ lote: Lote; registoId: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const outros = useLotesPresencas(f.ano === anoAtual ? 0 : f.ano);
  const todos = f.ano === anoAtual ? pz.lotes : outros.dados ?? [];
  const aCarregar = f.ano === anoAtual ? pz.aCarregar : outros.aCarregar;
  const recarregar = f.ano === anoAtual ? pz.recarregar : outros.recarregar;
  const config = useCarregar(lerConfigAssistencia, []);
  const extras = catalogoContagens(config.dados).filter((c) => !IDS_BASE.includes(c.id));
  const nomes = new Map(pz.comunidades.map((c) => [c.id, c.nome]));
  const meus = todos.filter((l) => nomes.has(l.comunidadeId));

  const periodoInvalido = modo === 'periodo' && !!de && !!ate && de > ate;
  const datas: Pick<FiltroPresencas, 'de' | 'ate'> = modo === 'dia' && dia ? { de: dia, ate: dia } : modo === 'periodo' && !periodoInvalido ? { de: de || undefined, ate: ate || undefined } : {};
  const filtro: FiltroPresencas = { comunidadeId: f.comunidadeId, evento: f.evento, contagem: f.contagem, contagemCond: f.contagemCond, soDuplicados: f.soDuplicados, ...datas };
  const visiveis = filtrarOrigem(filtrarLotesPresenca(meus, filtro), f.origem);
  const meses = agruparHistorico(visiveis, extras);
  const duplicados = duplicadosPresenca(meus);
  const nFiltros = [f.evento, f.contagem, f.origem, f.soDuplicados, f.comunidadeId !== 'todas' && pz.comunidades.length > 1 ? 1 : undefined, f.ano !== anoAtual ? 1 : undefined].filter(Boolean).length;

  async function apagar(l: Lote, rid: string) {
    const r = l.registos.find((x) => x.id === rid)!;
    if (!confirm(confirmacaoApagar(r, nomes.get(l.comunidadeId) ?? l.comunidadeId))) return;
    setErro(null);
    try { await apagarPresenca(acesso!, l, rid); await recarregar(); } catch (e) { setErro(mensagemErro(e)); }
  }

  if (aCorrigir) {
    return (
      <div className="pz-ecra"><div className="pz-conteudo" style={{ paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
        <FormularioPz comunidades={pz.comunidades} lotes={meus} edicao={aCorrigir} aoFechar={() => setACorrigir(null)} aposGravar={recarregar} />
      </div></div>
    );
  }

  return (
    <>
      <h1>Histórico</h1>
      <div className="pz-cartao pz-pesquisa">
        <div className="pz-secao">
          <h3>Pesquisar por data</h3>
          <button className="pz-link" onClick={() => setPainel(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} aria-label={`Filtros${nFiltros ? `, ${nFiltros} ativos` : ''}`}>
            <SlidersHorizontal size={18} aria-hidden /> Filtros{nFiltros ? ` (${nFiltros})` : ''}
          </button>
        </div>
        <div className="pz-segmentos" role="group" aria-label="Pesquisa por data">
          {(['todos', 'dia', 'periodo'] as Modo[]).map((m) => <button key={m} aria-pressed={modo === m} onClick={() => setModo(m)}>{{ todos: 'Todos', dia: 'Dia', periodo: 'Período' }[m]}</button>)}
        </div>
        {modo === 'dia' && <label className="pz-campo">Dia<input type="date" value={dia} max={hoje()} onChange={(e) => setDia(e.target.value)} /></label>}
        {modo === 'periodo' && (
          <div className="pz-pesquisa-linha">
            <label className={`pz-campo${periodoInvalido ? ' pz-com-erro' : ''}`}>De<input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
            <label className={`pz-campo${periodoInvalido ? ' pz-com-erro' : ''}`}>Até<input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
          </div>
        )}
        {periodoInvalido && <Mensagem tipo="erro">A data de início tem de ser anterior ou igual à data de fim.</Mensagem>}
        {modo !== 'todos' && (dia || de || ate) && <button className="pz-link" onClick={() => { setDia(''); setDe(''); setAte(''); }}>Limpar pesquisa</button>}
      </div>
      {duplicados.size > 0 && !f.soDuplicados && <Mensagem tipo="info">Há {num(duplicados.size)} registos duplicados (mesma comunidade, dia e evento). <button className="pz-link" style={{ minHeight: 0, padding: 0 }} onClick={() => setF({ ...f, soDuplicados: true })}>Ver só os duplicados</button></Mensagem>}
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <EstadoPz aCarregar={aCarregar} erro={f.ano === anoAtual ? pz.erro : outros.erro} />
      {!aCarregar && !meses.length && <div className="pz-vazio"><h2>Sem registos</h2><p>{nFiltros || modo !== 'todos' ? 'Nenhum registo corresponde à pesquisa e aos filtros.' : `Ainda não há registos em ${f.ano}.`}</p></div>}

      {meses.map((m) => (
        <section key={m.mes} className="pz-lista" aria-label={nomeMes(m.mes)}>
          <h2 className="pz-mes">{nomeMes(m.mes)}</h2>
          {m.dias.map((d) => {
            const abre = aberto === d.data;
            const varios = d.registos.length > 1;
            return (
              <div key={d.data} className={`pz-dia${abre ? ' aberto' : ''}`}>
                <button aria-expanded={abre} aria-controls={`pz-dia-${d.data}`} onClick={() => setAberto(abre ? null : d.data)}>
                  <div>
                    <b>{Number(d.data.slice(8))} · {diaSemana(d.data)}</b>
                    <div className="pz-muted pz-peq">{varios ? `${d.registos.length} registos` : `${d.registos[0].registo.evento}${pz.comunidades.length > 1 ? ` · ${nomes.get(d.registos[0].lote.comunidadeId)}` : ''}`}</div>
                  </div>
                  {d.registos.some((x) => duplicados.has(x.registo.id)) && <span className="pz-etiqueta">Duplicado</span>}
                  <span className="pz-dia-total" aria-label={`${d.total} pessoas`}>{num(d.total)}</span>
                  {abre ? <ChevronUp size={20} aria-hidden /> : <ChevronDown size={20} aria-hidden />}
                </button>
                {abre && (
                  <div id={`pz-dia-${d.data}`} className="pz-dia-detalhe">
                    {d.registos.map(({ lote: l, registo: r, total }) => {
                      const { detalhes } = resumoRegistoPresenca(r, extras);
                      const obs = String(r.extra?.observacoes ?? '').trim();
                      return (
                        <div key={r.id} className="pz-registo">
                          {varios && <h3>{r.evento}{r.descricao ? ` · ${r.descricao}` : ''} · {num(total)}</h3>}
                          {!varios && r.descricao && <h3>{r.evento} · {r.descricao}</h3>}
                          <dl className="pz-linhas">
                            <dt>Jovens e adultos</dt><dd>{num(r.valor)}</dd>
                            {detalhes.map((x) => <div key={x.rotulo} style={{ display: 'contents' }}><dt>{x.rotulo}</dt><dd>{x.valor == null ? '—' : num(x.valor)}</dd></div>)}
                          </dl>
                          <p className="pz-meta">{nomes.get(l.comunidadeId)} · {eRegistoDoPortal(r) ? 'Portal' : 'Jotform'}{r.extra?.alteradoEm ? ` · Última alteração: ${dataPT(String(r.extra.alteradoEm).slice(0, 10))}` : ''}</p>
                          <p className="pz-meta">Observações: {obs || 'sem observações'}</p>
                          {duplicados.has(r.id) && <p><span className="pz-etiqueta">Duplicado</span></p>}
                          <div style={{ display: 'flex', gap: 8 }}>
                            {pode('registar') && <button className="pz-btn prim" style={{ flex: 1 }} onClick={() => setACorrigir({ lote: l, registoId: r.id })}>Corrigir</button>}
                            {podeApagarPresenca(acesso, pode('registar'), r) && <button className="pz-btn perigo" style={{ flex: 1 }} onClick={() => void apagar(l, r.id)}>Apagar</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
      <p className="pz-meta">Inclui os registos do Jotform e os feitos no portal. Corrigir ou apagar aqui não mexe no Jotform; os apagados não voltam a ser importados.</p>

      {painel && <PainelFiltros atual={f} anoAtual={anoAtual} lotes={meus} aoFechar={() => setPainel(false)} aoAplicar={(n) => { setF(n); setAberto(null); setPainel(false); }} />}
    </>
  );
}

/** Painel inferior com os filtros avançados (ano, comunidade, tipo de evento, contagem, origem e duplicados). */
function PainelFiltros({ atual, anoAtual, lotes, aoFechar, aoAplicar }: { atual: Filtros; anoAtual: number; lotes: Lote[]; aoFechar: () => void; aoAplicar: (f: Filtros) => void }) {
  const pz = usePz();
  const [f, setF] = useState(atual);
  const config = useCarregar(lerConfigAssistencia, []);
  const tipos = [...new Map([...eventosEfetivos(config.dados).map((e) => e.nome), ...lotes.flatMap((l) => l.registos.map((r) => r.evento ?? ''))]
    .filter((x) => x.trim()).map((x) => [norm(x), x] as [string, string])).values()].sort((a, b) => a.localeCompare(b, 'pt'));
  const contagens = catalogoContagens(config.dados);
  return (
    <Painel titulo="Filtros avançados" aoFechar={aoFechar}>
      <label className="pz-campo">Ano
        <select value={f.ano} onChange={(e) => setF({ ...f, ano: Number(e.target.value) })}>{[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => <option key={a} value={a}>{a}</option>)}</select>
      </label>
      {pz.comunidades.length > 1 && (
        <label className="pz-campo">Comunidade
          <select value={f.comunidadeId} onChange={(e) => setF({ ...f, comunidadeId: e.target.value })}>
            <option value="todas">Todas as minhas</option>
            {pz.comunidades.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
      )}
      <label className="pz-campo">Tipo de evento
        <select value={f.evento ?? ''} onChange={(e) => setF({ ...f, evento: e.target.value || undefined })}>
          <option value="">Todos</option>{tipos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="pz-campo">Contagem
        <select value={f.contagem ? `${f.contagem}|${f.contagemCond ?? 'preenchida'}` : ''} onChange={(e) => { const [c, cond] = e.target.value.split('|'); setF({ ...f, contagem: c || undefined, contagemCond: c ? (cond as 'preenchida' | 'vazia') : undefined }); }}>
          <option value="">Todas</option>
          {contagens.map((c) => <option key={`${c.id}p`} value={`${c.id}|preenchida`}>{`${c.nome}: preenchida`}</option>)}
          {contagens.map((c) => <option key={`${c.id}v`} value={`${c.id}|vazia`}>{`${c.nome}: em branco ou 0`}</option>)}
        </select>
      </label>
      <label className="pz-campo">Origem
        <select value={f.origem ?? ''} onChange={(e) => setF({ ...f, origem: (e.target.value || undefined) as OrigemPresenca | undefined })}>
          <option value="">Todas</option><option value="portal">Portal</option><option value="jotform">Jotform</option>
        </select>
      </label>
      <label className="pz-campo" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}>
        <input type="checkbox" style={{ width: 24, height: 24, minHeight: 0 }} checked={!!f.soDuplicados} onChange={(e) => setF({ ...f, soDuplicados: e.target.checked || undefined })} /> Apenas duplicados
      </label>
      <button className="pz-btn prim bloco" onClick={() => aoAplicar(f)}>Aplicar filtros</button>
      <button className="pz-btn claro bloco" onClick={() => aoAplicar({ ano: anoAtual, comunidadeId: pz.comunidade })}>Limpar filtros</button>
    </Painel>
  );
}
