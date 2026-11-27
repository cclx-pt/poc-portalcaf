import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Escolha } from '../components/Escolha';
import { Estado, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { useCriarDimensao } from '../components/useCriarDimensao';
import { opcoesCategorias, opcoesDimensoes } from '../lib/escolha';
import { distribuir, linhasCustosFixos, montanteDePct, pctDeMontante, pesosMediaAnual, resumoManual, type Lancamento } from '../lib/calculadora';
import { auditar, gravar, lerConfigAssistencia, listarCategorias, listarComunidades, listarCustosFixos, listarDimensoes, listarLotes } from '../lib/db';
import { eur, MESES, num, parseNumero, periodo } from '../lib/format';
import { fecharEm100, listarPesos } from '../lib/pesos';
import { comunidadeAtiva, destinoFusao, propostaPesos } from '../lib/resumos';
import { NIVEIS, NIVEL_LABEL, type Nivel } from '../lib/types';

/** Lê um valor em euros escrito à portuguesa ("1000", "1.000,50", "1000,5"). */
function lerEuros(t: string): number {
  const s = t.trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  const n = parseNumero(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}
const dif = (v: number) => (Math.round(v * 100) === 0 ? eur(0) : `${v > 0 ? '+' : '−'}${eur(Math.abs(v))}`);

type Linha = { pct: string; valor: string };
interface Gravacao { rubrica: string; categoria: string; centroCusto: string; projeto: string; fornecedor: string; contaAnalitica: string; nivel: Nivel; ano: number; tipo: 'mes' | 'ano'; mes: number }

/**
 * Ferramentas › Calculadora de distribuição (FER-01): reparte um montante pelas comunidades segundo os pesos
 * de um mês (os gravados no ADM-05, senão a proposta pela média) ou a média anual até hoje, e compara com uma
 * distribuição manual. Não grava nada.
 */
export default function Calculadora() {
  const { acesso, pode } = useAuth();
  const { ano } = useFiltros();
  const coms = useCarregar(listarComunidades, []);
  const gravados = useCarregar(() => listarPesos(ano), [ano]);
  const ass = useCarregar(async () => {
    const [atual, antes, cfg] = await Promise.all([listarLotes(acesso!, 'assistencia', ano), listarLotes(acesso!, 'assistencia', ano - 1), lerConfigAssistencia()]);
    return { atual, antes, evento: cfg.eventoCelebracao ?? null };
  }, [ano, acesso?.email]);
  const agora = new Date();
  const ultimoMes = ano === agora.getFullYear() ? agora.getMonth() + 1 : 12;
  const [fonte, setFonte] = useState<string>('anual'); // 'anual' ou o número do mês
  const [totalTxt, setTotalTxt] = useState('1000');
  const [manual, setManual] = useState<Record<string, Linha> | null>(null);
  const total = lerEuros(totalTxt);
  const podeGravar = pode('custos');
  const cats = useCarregar(() => (podeGravar ? listarCategorias() : Promise.resolve([])), [podeGravar]);
  const dims = useCarregar(() => (podeGravar ? listarDimensoes() : Promise.resolve([])), [podeGravar]);
  const [grav, setGrav] = useState<Gravacao>(() => ({ rubrica: '', categoria: '', centroCusto: '', projeto: '', fornecedor: '', contaAnalitica: '', nivel: 'privado', ano, tipo: 'mes', mes: agora.getMonth() + 1 }));
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erroGrav, setErroGrav] = useState<string | null>(null);

  const comunidades = (coms.dados ?? []).filter((c) => !c.especial);
  const destino = useMemo(() => destinoFusao(coms.dados ?? []), [coms.dados]);

  /** Pesos de um mês: os gravados (inteiros, soma 100) ou, sem pesos gravados, a proposta pela média dos 12 meses. */
  const pesosDoMes = (m: number): { pesos: Record<string, number>; gravado: boolean } => {
    const g = (gravados.dados ?? []).find((x) => x.mes === m);
    if (g) return { pesos: fecharEm100(g.pesos), gravado: true };
    const p = periodo(ano, m);
    const eleg = comunidades.filter((c) => comunidadeAtiva(c, p)).map((c) => c.id);
    const prop = propostaPesos(ass.dados?.atual ?? [], ass.dados?.antes ?? [], ano, m, eleg, ass.dados?.evento, (c) => destino(c, p));
    return { pesos: Object.fromEntries(eleg.map((c) => [c, prop.media[c]?.pct ?? 0])), gravado: false };
  };

  const pronto = !!coms.dados && !!gravados.dados && !!ass.dados;
  const { pesos, nota } = useMemo(() => {
    if (!pronto) return { pesos: {} as Record<string, number>, nota: '' };
    if (fonte === 'anual') {
      const meses = Array.from({ length: ultimoMes }, (_, i) => pesosDoMes(i + 1)).filter((x) => Object.values(x.pesos).some((v) => v > 0));
      const nGrav = meses.filter((x) => x.gravado).length;
      return { pesos: pesosMediaAnual(meses.map((x) => x.pesos)), nota: `Média dos pesos de janeiro a ${MESES[ultimoMes - 1]} de ${ano} (${meses.length} meses: ${nGrav} com pesos gravados, os restantes pela proposta da média).` };
    }
    const m = Number(fonte);
    const x = pesosDoMes(m);
    return { pesos: x.pesos, nota: x.gravado ? `Pesos gravados para ${MESES[m - 1]} de ${ano} (ADM-05).` : `${MESES[m - 1]} de ${ano} não tem pesos gravados: usa a proposta pela média dos últimos 12 meses.` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, fonte, ano, ultimoMes, gravados.dados, ass.dados, coms.dados]);

  const linhas = comunidades.filter((c) => c.id in pesos);
  const inicial = distribuir(total, pesos);
  // Distribuição manual: começa igual à inicial; ao mudar o montante global, mantém as % escolhidas.
  const man: Record<string, Linha> = Object.fromEntries(linhas.map((c) => {
    const l = manual?.[c.id];
    if (!l) return [c.id, { pct: String(pesos[c.id] ?? 0), valor: num(inicial[c.id] ?? 0, 2) }];
    return [c.id, l];
  }));
  const pctMan = Object.fromEntries(linhas.map((c) => [c.id, Number(man[c.id].pct.replace(',', '.')) || 0]));
  const valMan = Object.fromEntries(linhas.map((c) => [c.id, lerEuros(man[c.id].valor)]));
  const resumo = resumoManual(total, valMan, pctMan);
  const somaInicialPct = linhas.reduce((t, c) => t + (pesos[c.id] ?? 0), 0);
  const somaDif = linhas.reduce((t, c) => t + (valMan[c.id] - (inicial[c.id] ?? 0)), 0);

  const mudarPct = (c: string, t: string) => {
    const p = Number(t.replace(',', '.'));
    setManual({ ...man, [c]: { pct: t, valor: Number.isFinite(p) ? num(montanteDePct(total, p), 2) : man[c].valor } });
  };
  const mudarValor = (c: string, t: string) => setManual({ ...man, [c]: { pct: String(pctDeMontante(total, lerEuros(t))), valor: t } });
  const mudarTotal = (t: string) => {
    setTotalTxt(t);
    if (manual) { const novo = lerEuros(t); setManual(Object.fromEntries(Object.entries(manual).map(([c, l]) => [c, { pct: l.pct, valor: num(montanteDePct(novo, Number(l.pct.replace(',', '.')) || 0), 2) }]))); }
  };

  const catsDespesa = (cats.dados ?? []).filter((c) => c.tipo === 'saida' && c.codigo && c.ativo !== false);
  const criarDim = useCriarDimensao(dims.dados ?? [], dims.recarregar);
  const dimsDe = (tp: 'centro' | 'projeto' | 'fornecedor' | 'conta') => criarDim.todas.filter((d) => d.tipo === tp && d.ativo !== false);
  const lancamento: Lancamento = grav.tipo === 'mes' ? { tipo: 'mes', mes: grav.mes } : { tipo: 'ano' };
  const novas = linhasCustosFixos(Object.fromEntries(linhas.map((c) => [c.id, valMan[c.id]])), {
    rubrica: grav.rubrica, categoria: grav.categoria, centroCusto: grav.centroCusto, projeto: grav.projeto || undefined, fornecedor: grav.fornecedor || undefined,
    contaAnalitica: grav.contaAnalitica || undefined, nivel: grav.nivel, ano: grav.ano, lancamento,
    notas: `Calculadora de distribuição: ${eur(total)} (${fonte === 'anual' ? `média anual ${ano}` : `pesos de ${MESES[Number(fonte) - 1]} ${ano}`})`,
  });
  const faltaGrav = [!grav.rubrica.trim() && 'o nome', !grav.categoria && 'a categoria', !grav.centroCusto && 'o centro de custo', !grav.projeto && 'o projeto ou evento',
    Math.round(resumo.porDistribuir * 100) !== 0 && 'distribuir o montante todo (Por distribuir a 0,00 €)', !novas.length && 'pelo menos uma comunidade com montante'].filter(Boolean) as string[];

  async function gravarCustos() {
    setErroGrav(null); setMsg(null);
    if (faltaGrav.length) return;
    setOcupado(true);
    try {
      const existentes = new Set((await listarCustosFixos(acesso!)).map((c) => c.id));
      const repetidas = novas.filter((l) => existentes.has(l.id));
      if (repetidas.length && !confirm(`Já existem ${repetidas.length} linhas de custos fixos "${grav.rubrica.trim()}" para estes meses (${repetidas.map((l) => comunidades.find((c) => c.id === l.comunidadeId)?.nome ?? l.comunidadeId).join(', ')}). Substituí-las?`)) return;
      for (const l of novas) await gravar('custos_fixos', l);
      await auditar(acesso!.email, 'custos fixos pela calculadora', `${grav.rubrica.trim()} · ${eur(resumo.montante)} · ${grav.tipo === 'mes' ? MESES[grav.mes - 1] : 'dividido pelos 12 meses'} de ${grav.ano}: ${novas.length} linhas (${novas.map((l) => `${l.comunidadeId} ${l.valorMensal}`).join(', ')})`);
      setMsg(`Gravadas ${novas.length} linhas em Custos fixos (${grav.rubrica.trim()}, ${grav.ano}). Recalcule os dados (Configuração ou Peso das comunidades) para atualizar os resultados.`);
    } catch (e) { setErroGrav(mensagemErro(e)); } finally { setOcupado(false); }
  }

  return (
    <div>
      <h1>Calculadora de distribuição</h1>
      <p className="muted">Reparte um montante pelas comunidades segundo o peso de cada uma e compara com uma distribuição feita à mão. Nada fica gravado.</p>
      <div className="filtros">
        <label>Pesos a usar
          <select value={fonte} onChange={(e) => { setFonte(e.target.value); setManual(null); }}>
            <option value="anual">{`Média anual de ${ano} (até ${MESES[ultimoMes - 1]})`}</option>
            {MESES.map((m, i) => <option key={m} value={String(i + 1)}>{`${m[0].toUpperCase()}${m.slice(1)} ${ano}`}</option>)}
          </select>
        </label>
        <label>Montante global a distribuir (€)
          <input inputMode="decimal" value={totalTxt} onChange={(e) => mudarTotal(e.target.value)} style={{ width: 160 }} />
        </label>
        {manual && <button className="sec" onClick={() => setManual(null)}>Repor distribuição inicial</button>}
      </div>

      <Estado aCarregar={!pronto && !coms.erro && !gravados.erro && !ass.erro} erro={coms.erro || gravados.erro || ass.erro} />
      {pronto && <div className="sec card">
        <p className="small muted" style={{ marginTop: 0 }}>{nota}</p>
        <div className="cards">
          <div className="kpi"><div>Orçamento</div><div className="valor">{eur(total)}</div></div>
          <div className="kpi"><div>Distribuição manual</div><div className="valor">{eur(resumo.montante)}</div></div>
          <div className="kpi"><div>Por distribuir</div><div className={`valor${Math.round(resumo.porDistribuir * 100) ? ' neg' : ''}`}>{dif(resumo.porDistribuir).replace(/^\+/, '')}</div></div>
        </div>
        <div className="tabela"><table>
          <thead>
            <tr><th rowSpan={2}>Comunidade</th><th colSpan={2} className="num">Distribuição inicial</th><th colSpan={2} className="num">Distribuição manual</th><th rowSpan={2} className="num">Diferença €</th></tr>
            <tr><th className="num">%</th><th className="num">Montante €</th><th className="num">%</th><th className="num">Montante €</th></tr>
          </thead>
          <tbody>{linhas.map((c) => {
            const d = valMan[c.id] - (inicial[c.id] ?? 0);
            return (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td className="num">{`${num(pesos[c.id] ?? 0, 0)}%`}</td>
                <td className="num">{eur(inicial[c.id] ?? 0)}</td>
                <td className="num"><input inputMode="numeric" style={{ width: 64 }} aria-label={`% manual de ${c.nome}`} value={man[c.id].pct} onChange={(e) => mudarPct(c.id, e.target.value)} /></td>
                <td className="num"><input inputMode="decimal" style={{ width: 110 }} aria-label={`Montante manual de ${c.nome}`} value={man[c.id].valor} onChange={(e) => mudarValor(c.id, e.target.value)} /></td>
                <td className={`num${d < -0.004 ? ' neg' : ''}`}>{dif(d)}</td>
              </tr>
            );
          })}</tbody>
          <tfoot><tr className="total-geral">
            <td>Total</td>
            <td className="num">{`${num(somaInicialPct, 0)}%`}</td>
            <td className="num">{eur(Object.values(inicial).reduce((t, v) => t + v, 0))}</td>
            <td className={`num${resumo.pct !== 100 ? ' neg' : ''}`}>{`${num(resumo.pct, Number.isInteger(resumo.pct) ? 0 : 2)}%`}</td>
            <td className="num">{eur(resumo.montante)}</td>
            <td className="num">{dif(somaDif)}</td>
          </tr></tfoot>
        </table></div>
        <p className="small muted">As % são inteiras. Ao mudar a % manual o montante acompanha, e ao mudar o montante a % é recalculada. Diferença = manual menos inicial; a negrito, valores abaixo da distribuição inicial e totais que não fecham.</p>
      </div>}

      {pronto && podeGravar && <div className="sec card">
        <h2>Gravar como custos fixos</h2>
        <p className="small muted" style={{ marginTop: 0 }}>Grava uma linha em Custos fixos para cada comunidade com montante na distribuição manual (custo local, incidência 100 %). A comunidade Geral não entra.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 10 }}>
          <label className="campo">Nome *<input value={grav.rubrica} placeholder="Festa de Natal" onChange={(e) => setGrav({ ...grav, rubrica: e.target.value })} /></label>
          <label className="campo">Categoria *
            <Escolha aria-label="Categoria" vazio="Escolha…" valor={grav.categoria} opcoes={opcoesCategorias(catsDespesa)} onChange={(v) => setGrav({ ...grav, categoria: v, contaAnalitica: '' })} /></label>
          <label className="campo">Centro de custo *
            <Escolha aria-label="Centro de custo" vazio="Escolha…" valor={grav.centroCusto} opcoes={opcoesDimensoes(dimsDe('centro'))} criar={criarDim.criar('centro')} onChange={(v) => setGrav({ ...grav, centroCusto: v })} /></label>
          <label className="campo">Projeto ou evento *
            <Escolha aria-label="Projeto ou evento" vazio="Escolha…" valor={grav.projeto} opcoes={opcoesDimensoes(dimsDe('projeto'))} criar={criarDim.criar('projeto')} onChange={(v) => setGrav({ ...grav, projeto: v })} /></label>
          <label className="campo">Fornecedor
            <Escolha aria-label="Fornecedor" vazio="—" textoLivre valor={grav.fornecedor} opcoes={opcoesDimensoes(dimsDe('fornecedor'))} criar={criarDim.criar('fornecedor')} onChange={(v) => setGrav({ ...grav, fornecedor: v })} /></label>
          <label className="campo">Conta analítica
            <Escolha aria-label="Conta analítica" vazio="—" valor={grav.contaAnalitica} opcoes={opcoesDimensoes(dimsDe('conta').filter((d) => !grav.categoria || !d.categoria || grav.categoria.startsWith(d.categoria)))} onChange={(v) => setGrav({ ...grav, contaAnalitica: v })} /></label>
          <label className="campo">Ano *
            <select value={grav.ano} onChange={(e) => setGrav({ ...grav, ano: Number(e.target.value) })}>
              {[ano - 1, ano, ano + 1].map((a) => <option key={a} value={a}>{a}</option>)}
            </select></label>
          <label className="campo">Lançamento
            <select value={grav.tipo} onChange={(e) => setGrav({ ...grav, tipo: e.target.value as 'mes' | 'ano' })}>
              <option value="mes">De uma vez num mês</option>
              <option value="ano">Dividido pelos 12 meses</option>
            </select></label>
          {grav.tipo === 'mes' && <label className="campo">Mês
            <select value={grav.mes} onChange={(e) => setGrav({ ...grav, mes: Number(e.target.value) })}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select></label>}
          <label className="campo">Nível de privacidade
            <select value={grav.nivel} onChange={(e) => setGrav({ ...grav, nivel: e.target.value as Nivel })}>{NIVEIS.map((n) => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}</select></label>
        </div>
        {novas.length > 0 && <p className="small">{`Vai gravar ${novas.length} ${novas.length === 1 ? 'linha' : 'linhas'}: `}{novas.map((l) => `${comunidades.find((c) => c.id === l.comunidadeId)?.nome ?? l.comunidadeId} ${eur(l.valorMensal)}${l.inicio === l.fim ? ` em ${MESES[Number(l.inicio.slice(5)) - 1]}` : ` por mês (${MESES[Number(l.inicio.slice(5)) - 1]} a ${MESES[Number((l.fim ?? '').slice(5)) - 1]})`}`).join(' · ')}</p>}
        {faltaGrav.length > 0 && <p className="small muted">{`Para gravar, falta: ${faltaGrav.join(', ')}.`}</p>}
        {erroGrav && <div className="aviso" role="alert">{erroGrav}</div>}
        {msg && <div className="ok-box" role="status">{msg}</div>}
        <div className="acoes"><button disabled={ocupado || faltaGrav.length > 0} onClick={() => void gravarCustos()}>{ocupado ? 'A gravar…' : `Gravar em Custos fixos`}</button></div>
      </div>}
    </div>
  );
}
