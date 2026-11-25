import { useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CORES } from '../lib/cores';
import { useAuth } from '../auth/AuthProvider';
import { CampoData, Estado, Modal, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { apagar, auditar, gravar, listarCategorias, listarComunidades, listarCustosFixos, listarDimensoes } from '../lib/db';
import { proporClassificacaoCusto, propostasCustos } from '../lib/custosPlano';
import { eur, eurK, periodo, r2 } from '../lib/format';
import { custoAtivo, custoNoAno, descreverPeriodicidade, mesesDecorridos, valorImputado, valorImputadoNoMes } from '../lib/resumos';
import { COMUNIDADE_GERAL, importarCustosFixos, type ResultadoImportacao } from '../lib/custosImport';
import { anoDoCusto, copiarAno, totaisPorRubrica } from '../lib/custosAno';
import { lerFicheiro } from '../lib/ficheiros';
import { NIVEIS, NIVEL_LABEL, type CustoFixo, type Nivel } from '../lib/types';
import { hoje } from '../lib/format';

/** AAAA-MM → mm/aaaa. */
const mesPT = (p?: string | null) => (p ? p.split('-').reverse().join('/') : '');
const pct = (v?: number) => `${(v ?? 100).toLocaleString('pt-PT', { maximumFractionDigits: 2 })}%`;

const vazio = (comunidadeId: string, ano: number): CustoFixo => ({ id: '', comunidadeId, rubrica: '', valorMensal: 0, ano, inicio: `${ano}-01`, fim: `${ano}-12`, nivel: 'privado' });
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mm = (p?: string | null, omissao = '12') => (p ? p.slice(5, 7) : omissao);
const NIVEL_SUGERIDO: Record<string, Nivel> = { vencimentos: 'confidencial', 'seguranca social': 'confidencial', renda: 'privado', luz: 'publico', agua: 'publico', internet: 'publico' };

export default function CustosFixos() {
  const { acesso, pode } = useAuth();
  const { ano, comunidade } = useFiltros();
  const coms = useCarregar(listarComunidades, []);
  const cf = useCarregar(() => listarCustosFixos(acesso!), [acesso?.email]);
  const cats = useCarregar(listarCategorias, []);
  const dims = useCarregar(listarDimensoes, []);
  const catsDespesa = (cats.dados ?? []).filter((c) => c.tipo === 'saida' && c.codigo && c.ativo !== false);
  const dimsDe = (t: 'centro' | 'projeto' | 'fornecedor' | 'conta') => (dims.dados ?? []).filter((d) => d.tipo === t && d.ativo !== false);
  const nomeCentro = (cod?: string) => dimsDe('centro').find((d) => d.codigo === cod)?.nome ?? cod;
  const [classificar, setClassificar] = useState(false);
  const [aClassificar, setAClassificar] = useState(false);
  const propostas = classificar ? propostasCustos(cf.dados ?? [], cats.dados ?? []) : [];
  const comProposta = propostas.filter((p) => p.proposta.categoria);
  async function aplicarPropostas() {
    setAClassificar(true);
    try {
      for (let i = 0; i < comProposta.length; i += 20) await Promise.all(comProposta.slice(i, i + 20).map((p) => gravar('custos_fixos', { ...p.custo, ...p.proposta })));
      await auditar(acesso!.email, 'classificar custos fixos com o plano', `${comProposta.length} linhas`);
      setMsg(`${comProposta.length} custos fixos classificados com o plano financeiro.${propostas.length - comProposta.length ? ` ${propostas.length - comProposta.length} ficaram sem proposta: classifique-os em Editar.` : ''} Recalcule os resumos para atualizar os mapas.`);
      setClassificar(false); await cf.recarregar();
    } catch (e) { setMsg(mensagemErro(e)); }
    finally { setAClassificar(false); }
  }
  const [edit, setEdit] = useState<CustoFixo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const nomes = new Map((coms.dados ?? []).map((c) => [c.id, c.nome]));
  const linhas = (cf.dados ?? []).filter((c) => (comunidade === 'todas' || c.comunidadeId === comunidade) && custoNoAno(c, ano))
    .sort((a, b) => (nomes.get(a.comunidadeId) ?? '').localeCompare(nomes.get(b.comunidadeId) ?? '') || a.rubrica.localeCompare(b.rubrica) || a.inicio.localeCompare(b.inicio));
  const ate = mesesDecorridos(ano, hoje());
  const noAno = (c: CustoFixo) => r2(Array.from({ length: 12 }, (_, i) => (custoAtivo(c, periodo(ano, i + 1)) ? valorImputadoNoMes(c, periodo(ano, i + 1)) : 0)).reduce((s, v) => s + v, 0));
  const ateHoje = (c: CustoFixo) => r2(Array.from({ length: ate }, (_, i) => (custoAtivo(c, periodo(ano, i + 1)) ? valorImputadoNoMes(c, periodo(ano, i + 1)) : 0)).reduce((s, v) => s + v, 0));
  // Vista anual (total imputado no ano) ou mensal (imputado num mês), por rubrica: gráfico à esquerda, tabela à direita.
  const [vista, setVista] = useState<'anual' | 'mensal'>('anual');
  const [mesVista, setMesVista] = useState(() => (ano === Number(hoje().slice(0, 4)) ? Number(hoje().slice(5, 7)) : 12));
  const noMes = (c: CustoFixo) => (custoAtivo(c, periodo(ano, mesVista)) ? r2(valorImputadoNoMes(c, periodo(ano, mesVista))) : 0);
  const valorVista = vista === 'anual' ? noAno : noMes;
  const grafico = totaisPorRubrica(linhas, valorVista, 12);
  const porRubrica = totaisPorRubrica(linhas, valorVista, Number.MAX_SAFE_INTEGER);
  const totalVista = r2(porRubrica.reduce((s, x) => s + x.valor, 0));
  const rotuloVista = vista === 'anual' ? `Imputado em ${ano}` : `Imputado em ${MESES[mesVista - 1]} de ${ano}`;
  const ficheiro = useRef<HTMLInputElement>(null);
  const [imp, setImp] = useState<(ResultadoImportacao & { nome: string; substituir: boolean }) | null>(null);
  const [aImportar, setAImportar] = useState(false);
  const [copia, setCopia] = useState<{ origem: number; destino: number; atualizacao: string; todas: boolean; substituir: boolean } | null>(null);
  const [aCopiar, setACopiar] = useState(false);
  const comsCopia = copia ? (copia.todas || comunidade === 'todas' ? null : [comunidade]) : null;
  let previa: ReturnType<typeof copiarAno> | null = null;
  let erroCopia: string | null = null;
  if (copia) {
    try { previa = copiarAno(cf.dados ?? [], { origem: copia.origem, destino: copia.destino, atualizacao: Number(copia.atualizacao.replace(',', '.')) || 0, comunidades: comsCopia }, coms.dados ?? []); }
    catch (e) { erroCopia = mensagemErro(e); }
  }
  const comsPrevia = new Set((previa?.novos ?? []).map((c) => c.comunidadeId));
  const existentesDestino = copia ? (cf.dados ?? []).filter((c) => anoDoCusto(c) === copia.destino && comsPrevia.has(c.comunidadeId)) : [];
  async function confirmarCopia() {
    if (!copia || !previa) return;
    setACopiar(true);
    try {
      const novos = new Set(previa.novos.map((c) => c.id));
      if (copia.substituir) for (const c of existentesDestino) if (!novos.has(c.id)) await apagar('custos_fixos', c.id);
      for (let i = 0; i < previa.novos.length; i += 20) await Promise.all(previa.novos.slice(i, i + 20).map((c) => gravar('custos_fixos', c)));
      await auditar(acesso!.email, 'copiar custos fixos', `${copia.origem} → ${copia.destino}: ${previa.novos.length} linhas, atualização ${copia.atualizacao || 0}%${comsCopia ? ` (${comsCopia.map((c) => nomes.get(c) ?? c).join(', ')})` : ''}; ${copia.substituir ? existentesDestino.length : 0} substituídas`);
      setMsg(`Criadas ${previa.novos.length} linhas de ${copia.destino} com base em ${copia.origem}. Recalcule os resumos (Configuração ou Calcular) para atualizar os mapas.`);
      setCopia(null); await cf.recarregar();
    } catch (e) { setMsg(mensagemErro(e)); }
    finally { setACopiar(false); }
  }
  const [apagarSel, setApagarSel] = useState<{ ano: string; confirmo: boolean } | null>(null);
  const [aApagar, setAApagar] = useState(false);
  const ondeApagar = comunidade === 'todas' ? 'todas as comunidades' : nomes.get(comunidade) ?? comunidade;
  const daComunidade = (cf.dados ?? []).filter((c) => comunidade === 'todas' || c.comunidadeId === comunidade);
  const anosComLinhas = [...new Set(daComunidade.map(anoDoCusto))].sort((a, b) => a - b);
  const alvoApagar = apagarSel?.ano ? daComunidade.filter((c) => anoDoCusto(c) === Number(apagarSel.ano)) : [];
  async function apagarAno() {
    if (!apagarSel?.ano || !apagarSel.confirmo || !alvoApagar.length) return;
    setAApagar(true);
    try {
      for (let i = 0; i < alvoApagar.length; i += 20) await Promise.all(alvoApagar.slice(i, i + 20).map((c) => apagar('custos_fixos', c.id)));
      await auditar(acesso!.email, 'apagar custos fixos do ano', `${apagarSel.ano} (${ondeApagar}): ${alvoApagar.length} linhas`);
      setMsg(`Apagadas ${alvoApagar.length} linhas de ${apagarSel.ano}. Recalcule os resumos (Configuração ou Calcular) para atualizar os mapas.`);
      setApagarSel(null); await cf.recarregar();
    } catch (e) { setMsg(mensagemErro(e)); }
    finally { setAApagar(false); }
  }

  async function lerImportacao(f: File) {
    setMsg(null);
    try {
      const t = await lerFicheiro(f);
      const r = importarCustosFixos(t.linhas, coms.dados ?? []);
      if (!r.custos.length) { setMsg(`Não encontrei custos no ficheiro ${f.name}. Colunas esperadas: Site, Rúbrica, Incidência % e uma coluna por ano.`); return; }
      setImp({ ...r, nome: f.name, substituir: true });
    } catch (e) { setMsg(mensagemErro(e)); }
  }
  const comsImp = new Set((imp?.custos ?? []).map((c) => c.comunidadeId));
  const aRemover = imp?.substituir ? (cf.dados ?? []).filter((c) => comsImp.has(c.comunidadeId)) : (cf.dados ?? []).filter((c) => imp?.custos.some((n) => n.id === c.id));
  async function confirmarImportacao() {
    if (!imp) return;
    setAImportar(true);
    try {
      const novos = new Set(imp.custos.map((c) => c.id));
      for (const c of aRemover) if (!novos.has(c.id)) await apagar('custos_fixos', c.id);
      for (let i = 0; i < imp.custos.length; i += 20) await Promise.all(imp.custos.slice(i, i + 20).map((c) => gravar('custos_fixos', c)));
      await auditar(acesso!.email, 'importar custos fixos', `${imp.nome}: ${imp.custos.length} linhas (${[...comsImp].map((c) => nomes.get(c) ?? c).join(', ')}); ${aRemover.length} substituídas; ${imp.avisos.length} avisos`);
      setMsg(`Importados ${imp.custos.length} custos fixos de ${imp.nome}.${imp.avisos.length ? ` ${imp.avisos.length} avisos (ver acima antes de importar).` : ''} Recalcule os resumos (Configuração ou Calcular) para atualizar os mapas.`);
      setImp(null); await cf.recarregar();
    } catch (e) { setMsg(mensagemErro(e)); }
    finally { setAImportar(false); }
  }

  async function guardar() {
    if (!edit) return;
    try {
      const id = edit.id || `${edit.comunidadeId}-${edit.rubrica.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${edit.inicio}`;
      const incidencia = Math.min(100, Math.max(0, r2(Number(edit.incidencia ?? 100))));
      await gravar('custos_fixos', { ...edit, id, ano: anoDoCusto(edit), valorMensal: r2(Number(edit.valorMensal)), incidencia, ambito: edit.comunidadeId === COMUNIDADE_GERAL ? 'geral' : edit.ambito ?? 'local', fim: edit.fim || `${anoDoCusto(edit)}-12` });
      await auditar(acesso!.email, 'custo fixo', `${edit.comunidadeId} · ${edit.rubrica} · ${edit.valorMensal} € × ${pct(incidencia)} desde ${mesPT(edit.inicio)}`);
      setEdit(null); await cf.recarregar();
    } catch (e) { setMsg(mensagemErro(e)); }
  }
  async function remover(c: CustoFixo) {
    if (!confirm(`Remover "${c.rubrica}" de ${nomes.get(c.comunidadeId)}?`)) return;
    try { await apagar('custos_fixos', c.id); await auditar(acesso!.email, 'remover custo fixo', c.id); await cf.recarregar(); } catch (e) { setMsg(mensagemErro(e)); }
  }

  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1>Custos Fixos</h1>
          <p className="muted">Uma linha por rubrica e ano (mostra o ano escolhido no filtro). Quando um valor muda a meio do ano, feche a linha anterior (mês de fim) e crie uma nova no mesmo ano. Para preparar um ano novo, use <b>Copiar ano</b>. Os vencimentos e a Segurança Social são confidenciais. A <b>incidência</b> é a parte do custo imputada a esta comunidade (custos partilhados); nos resultados entra o valor imputado. Os custos lançados na comunidade <b>Geral</b> (e os de âmbito geral) repartem-se por todas as comunidades conforme a assistência.</p>
        </div>
        {pode('custos') && <div className="acoes">
          <button className="sec" onClick={() => ficheiro.current?.click()}>Importar do Excel</button>
          <input ref={ficheiro} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void lerImportacao(f); }} />
          <button className="sec" onClick={() => setClassificar(true)} title="Propõe a categoria do plano, o fornecedor e o centro de custo das linhas ainda sem categoria">Classificar com o plano</button>
          <button className="sec" onClick={() => setCopia({ origem: ano, destino: ano + 1, atualizacao: '', todas: comunidade === 'todas', substituir: false })}>Copiar ano…</button>
          {acesso!.papel === 'master' && <button className="sec" disabled={!anosComLinhas.length} onClick={() => setApagarSel({ ano: '', confirmo: false })}>Apagar ano…</button>}
          <button onClick={() => setEdit(vazio(comunidade === 'todas' ? (acesso!.comunidades[0] === '*' ? 'caldas-da-rainha' : acesso!.comunidades[0]) : comunidade, ano))}>Nova linha</button>
        </div>}
      </div>
      {msg && <div className="aviso">{msg}</div>}
      <Estado aCarregar={cf.aCarregar} erro={cf.erro} vazio={!linhas.length} />
      {!!linhas.length && (
        <div className="acoes" style={{ alignItems: 'flex-end' }}>
          <div className="abas" role="tablist" aria-label="Vista" style={{ marginBottom: 0 }}>
            {([['anual', 'Anual'], ['mensal', 'Mensal']] as const).map(([k, rot]) => (
              <button key={k} role="tab" aria-selected={vista === k} className={vista === k ? 'ativa' : ''} onClick={() => setVista(k)}>{rot}</button>
            ))}
          </div>
          {vista === 'mensal' && (
            <label className="campo">Mês
              <select value={mesVista} onChange={(e) => setMesVista(Number(e.target.value))}>
                {MESES.map((m, i) => <option key={m} value={i + 1}>{`${m.charAt(0).toUpperCase()}${m.slice(1)} ${ano}`}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      {!!linhas.length && (
        <div className="grafico-tabela">
          <div className="card">
            <h2 style={{ marginTop: 0 }}>{`Por rubrica · ${rotuloVista.toLowerCase()}${comunidade === 'todas' ? '' : ` · ${nomes.get(comunidade) ?? comunidade}`}`}</h2>
            {grafico.length ? (
              <ResponsiveContainer width="100%" height={grafico.length * 30 + 40}>
                <BarChart data={grafico} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                  <CartesianGrid stroke={CORES.grelha} horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => eurK(Number(v))} tick={{ fontSize: 12, fill: CORES.eixo }} />
                  <YAxis type="category" dataKey="rubrica" width={180} interval={0} tick={{ fontSize: 12, fill: CORES.texto }} tickFormatter={(t: string) => (t.length > 26 ? `${t.slice(0, 25)}…` : t)} />
                  <Tooltip cursor={{ fill: CORES.grelha }} formatter={(v: number) => [eur(v), rotuloVista]} />
                  <Bar dataKey="valor" fill={CORES.saidas} barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="muted">Sem custos neste período.</p>}
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>{rotuloVista}</h2>
            <div className="tabela"><table>
              <thead><tr><th>Rubrica</th><th className="num">Valor (€)</th><th className="num">%</th></tr></thead>
              <tbody>{porRubrica.map((x) => (
                <tr key={x.rubrica}><td>{x.rubrica}</td><td className="num">{eur(x.valor)}</td><td className="num">{totalVista ? `${((x.valor / totalVista) * 100).toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%` : '—'}</td></tr>
              ))}</tbody>
              <tfoot><tr><td>Total</td><td className="num">{eur(totalVista)}</td><td className="num">100%</td></tr></tfoot>
            </table></div>
          </div>
        </div>
      )}
      {!!linhas.length && (
        <details className="sec card registos-falta">
          <summary><h2>{`Dados · ${linhas.length} linha${linhas.length === 1 ? '' : 's'} de ${ano}`}</h2></summary>
        <div className="tabela"><table>
          <thead><tr><th>Ano</th><th>Comunidade</th><th>Rubrica</th><th>Nível</th><th className="num">Mensal (total)</th><th className="num">Incidência</th><th className="num">Imputado</th><th>Âmbito</th><th>Início</th><th>Fim</th><th className="num">{ano} (até hoje)</th><th className="num">{ano} (ano)</th><th /></tr></thead>
          <tbody>{linhas.map((c) => (
            <tr key={c.id}>
              <td>{anoDoCusto(c)}</td>
              <td>{nomes.get(c.comunidadeId) ?? c.comunidadeId}</td>
              <td>{c.rubrica}
                <div className="small muted">{c.categoria ? [c.categoria, c.fornecedor, nomeCentro(c.centroCusto), c.projeto].filter(Boolean).join(' · ') : 'Sem categoria do plano'}</div>
                {c.notas && <div className="muted">{c.notas}</div>}</td>
              <td><span className={'etiqueta' + (c.nivel === 'confidencial' ? ' preta' : '')}>{NIVEL_LABEL[c.nivel]}</span></td>
              <td className="num">{eur(c.valorMensal)}{c.periodicidade && <div className="small muted">{descreverPeriodicidade(c)}</div>}</td><td className="num">{pct(c.incidencia)}</td><td className="num">{eur(valorImputado(c))}</td>
              <td className="small">{c.ambito === 'geral' ? 'Geral' : 'Local'}</td><td>{mesPT(c.inicio)}</td><td>{c.fim ? mesPT(c.fim) : 'em vigor'}</td>
              <td className="num">{eur(ateHoje(c))}</td><td className="num">{eur(noAno(c))}</td>
              <td>{pode('custos') && <><button className="link" onClick={() => setEdit(c)}>Editar</button> · <button className="link" onClick={() => remover(c)}>Remover</button></>}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr><td colSpan={4}>Total</td><td className="num">{eur(r2(linhas.reduce((s, c) => s + c.valorMensal, 0)))}</td><td /><td className="num">{eur(r2(linhas.reduce((s, c) => s + valorImputado(c), 0)))}</td><td colSpan={3} /><td className="num">{eur(r2(linhas.reduce((s, c) => s + ateHoje(c), 0)))}</td><td className="num">{eur(r2(linhas.reduce((s, c) => s + noAno(c), 0)))}</td><td /></tr></tfoot>
        </table></div>
        </details>
      )}
      {imp && (
        <Modal titulo={`Importar custos fixos: ${imp.nome}`} onFechar={() => setImp(null)}>
          <p className="small">{imp.custos.length} custos fixos de {comsImp.size} comunidades, anos {imp.anos.join(', ')}. Cada ano gera linhas desse ano, de janeiro a dezembro. Os nomes das pessoas foram retirados das rubricas.</p>
          {imp.avisos.length > 0 && <div className="aviso"><b>Avisos ({imp.avisos.length})</b><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{imp.avisos.map((a) => <li key={a}>{a}</li>)}</ul></div>}
          <label className="opcao"><input type="checkbox" checked={imp.substituir} onChange={(e) => setImp({ ...imp, substituir: e.target.checked })} /> Substituir os custos fixos atuais destas comunidades ({(cf.dados ?? []).filter((c) => comsImp.has(c.comunidadeId)).length} linhas)</label>
          <div className="tabela" style={{ maxHeight: '50vh', overflowY: 'auto' }}><table>
            <thead><tr><th>Comunidade</th><th>Rubrica</th><th>Nível</th><th className="num">Mensal</th><th className="num">Incidência</th><th className="num">Imputado</th><th>Âmbito</th><th>Início</th><th>Fim</th></tr></thead>
            <tbody>{imp.custos.map((c) => (
              <tr key={c.id}><td>{nomes.get(c.comunidadeId) ?? c.comunidadeId}</td><td>{c.rubrica}</td><td className="small">{NIVEL_LABEL[c.nivel]}</td>
                <td className="num">{eur(c.valorMensal)}</td><td className="num">{pct(c.incidencia)}</td><td className="num">{eur(valorImputado(c))}</td>
                <td className="small">{c.ambito === 'geral' ? 'Geral' : 'Local'}</td><td>{mesPT(c.inicio)}</td><td>{c.fim ? mesPT(c.fim) : 'em vigor'}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="acoes" style={{ marginTop: 12 }}>
            <button disabled={aImportar} onClick={() => void confirmarImportacao()}>{aImportar ? 'A importar…' : `Importar ${imp.custos.length} custos fixos`}</button>
            <button className="sec" onClick={() => setImp(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
      {classificar && (
        <Modal titulo="Classificar os custos fixos com o plano financeiro" onFechar={() => setClassificar(false)}>
          {!catsDespesa.length ? <div className="aviso">O plano financeiro ainda não está carregado. Carregue-o na Configuração.</div> : <>
            <p className="small">{`${propostas.length} linhas de todos os anos ainda sem categoria do plano; ${comProposta.length} com proposta. As linhas sem proposta classificam-se em Editar.`}</p>
            <div className="tabela" style={{ maxHeight: '50vh', overflowY: 'auto' }}><table>
              <thead><tr><th>Ano</th><th>Comunidade</th><th>Rubrica atual</th><th>Categoria proposta</th><th>Fornecedor</th><th>Centro de custo</th></tr></thead>
              <tbody>{propostas.map(({ custo: c, proposta: p }) => (
                <tr key={c.id}><td>{anoDoCusto(c)}</td><td>{nomes.get(c.comunidadeId) ?? c.comunidadeId}</td><td>{c.rubrica}</td>
                  <td>{p.categoria ?? <span className="muted">sem proposta</span>}</td><td>{p.fornecedor ?? ''}</td><td>{nomeCentro(p.centroCusto) ?? ''}</td></tr>
              ))}</tbody>
            </table></div>
            <div className="acoes" style={{ marginTop: 12 }}>
              <button disabled={aClassificar || !comProposta.length} onClick={() => void aplicarPropostas()}>{aClassificar ? 'A classificar…' : `Aplicar ${comProposta.length} propostas`}</button>
              <button className="sec" onClick={() => setClassificar(false)}>Cancelar</button>
            </div>
          </>}
        </Modal>
      )}
      {apagarSel && (
        <Modal titulo="Apagar os custos fixos de um ano" onFechar={() => setApagarSel(null)}>
          <label className="campo">{`Ano a apagar (${ondeApagar})`}
            <select value={apagarSel.ano} onChange={(e) => setApagarSel({ ano: e.target.value, confirmo: false })}>
              <option value="">Escolha o ano…</option>
              {anosComLinhas.map((a) => <option key={a} value={String(a)}>{`${a} (${daComunidade.filter((c) => anoDoCusto(c) === a).length} linhas)`}</option>)}
            </select>
          </label>
          {alvoApagar.length > 0 && <>
            <div className="aviso">{`Vão ser apagadas ${alvoApagar.length} linhas de ${apagarSel.ano} (${ondeApagar}). Esta ação não se pode desfazer.`}</div>
            <label className="opcao"><input type="checkbox" checked={apagarSel.confirmo} onChange={(e) => setApagarSel({ ...apagarSel, confirmo: e.target.checked })} /> Confirmo que quero apagar estas linhas</label>
          </>}
          <div className="acoes" style={{ marginTop: 12 }}>
            <button disabled={aApagar || !apagarSel.confirmo || !alvoApagar.length} onClick={() => void apagarAno()}>{aApagar ? 'A apagar…' : alvoApagar.length ? `Apagar ${alvoApagar.length} linhas de ${apagarSel.ano}` : 'Apagar'}</button>
            <button className="sec" onClick={() => setApagarSel(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
      {copia && (
        <Modal titulo="Copiar custos fixos de um ano para outro" onFechar={() => setCopia(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <label className="campo">Ano de origem<input type="number" inputMode="numeric" value={copia.origem} onChange={(e) => setCopia({ ...copia, origem: Number(e.target.value) || copia.origem })} /></label>
            <label className="campo">Ano de destino<input type="number" inputMode="numeric" value={copia.destino} onChange={(e) => setCopia({ ...copia, destino: Number(e.target.value) || copia.destino })} /></label>
            <label className="campo">Atualização (%)<input inputMode="decimal" placeholder="0" value={copia.atualizacao} onChange={(e) => setCopia({ ...copia, atualizacao: e.target.value })} /></label>
          </div>
          {comunidade !== 'todas' && <label className="opcao"><input type="checkbox" checked={copia.todas} onChange={(e) => setCopia({ ...copia, todas: e.target.checked })} /> {`Todas as comunidades (senão, só ${nomes.get(comunidade) ?? comunidade})`}</label>}
          <p className="small muted">Por comunidade e rubrica copia-se a linha mais recente do ano de origem, como linha de janeiro a dezembro do ano de destino, com os valores atualizados pela percentagem indicada.</p>
          {erroCopia && <div className="aviso">{erroCopia}</div>}
          {previa && previa.avisos.length > 0 && <div className="aviso"><b>Avisos ({previa.avisos.length})</b><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{previa.avisos.map((a) => <li key={a}>{a}</li>)}</ul></div>}
          {existentesDestino.length > 0 && <label className="opcao"><input type="checkbox" checked={copia.substituir} onChange={(e) => setCopia({ ...copia, substituir: e.target.checked })} /> {`Substituir as ${existentesDestino.length} linhas que já existem em ${copia.destino} nestas comunidades`}</label>}
          {previa && (previa.novos.length ? (
            <div className="tabela" style={{ maxHeight: '45vh', overflowY: 'auto' }}><table>
              <thead><tr><th>Comunidade</th><th>Rubrica</th><th className="num">Mensal</th><th className="num">Incidência</th><th className="num">Imputado</th><th>Âmbito</th></tr></thead>
              <tbody>{previa.novos.map((c) => (
                <tr key={c.id}><td>{nomes.get(c.comunidadeId) ?? c.comunidadeId}</td><td>{c.rubrica}</td><td className="num">{eur(c.valorMensal)}</td><td className="num">{pct(c.incidencia)}</td><td className="num">{eur(valorImputado(c))}</td><td className="small">{c.ambito === 'geral' ? 'Geral' : 'Local'}</td></tr>
              ))}</tbody>
              <tfoot><tr><td colSpan={4}>Total mensal (imputado)</td><td className="num">{eur(r2(previa.novos.reduce((s, c) => s + valorImputado(c), 0)))}</td><td /></tr></tfoot>
            </table></div>
          ) : <p className="muted">{`Não há linhas de ${copia.origem} para copiar.`}</p>)}
          <div className="acoes" style={{ marginTop: 12 }}>
            <button disabled={aCopiar || !previa?.novos.length || (existentesDestino.length > 0 && !copia.substituir)} onClick={() => void confirmarCopia()}>{aCopiar ? 'A copiar…' : `Criar ${previa?.novos.length ?? 0} linhas em ${copia.destino}`}</button>
            <button className="sec" onClick={() => setCopia(null)}>Cancelar</button>
          </div>
          {existentesDestino.length > 0 && !copia.substituir && <p className="small muted">{`${copia.destino} já tem linhas nestas comunidades: marque "Substituir" para continuar.`}</p>}
        </Modal>
      )}
      {edit && (
        <div className="modal-fundo" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{edit.id ? 'Editar custo fixo' : 'Novo custo fixo'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <label className="campo">Comunidade
                <select value={edit.comunidadeId} onChange={(e) => setEdit({ ...edit, comunidadeId: e.target.value, ...(e.target.value === COMUNIDADE_GERAL ? { ambito: 'geral' as const } : {}) })}>
                  {(coms.dados ?? []).filter((c) => (!c.especial || c.id === COMUNIDADE_GERAL) && (c.ativo !== false || c.id === edit.comunidadeId) && (acesso!.comunidades.includes('*') || acesso!.comunidades.includes(c.id))).map((c) => <option key={c.id} value={c.id}>{c.id === COMUNIDADE_GERAL ? 'Geral (repartido por todas as comunidades)' : c.nome}</option>)}
                </select>
              </label>
              <label className="campo">Rubrica
                <input value={edit.rubrica} list="rubricas" onChange={(e) => {
                  const r = e.target.value; const k = r.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
                  const prop = edit.categoria ? {} : proporClassificacaoCusto(r, cats.dados ?? []);
                  setEdit({ ...edit, ...prop, rubrica: r, nivel: edit.id ? edit.nivel : NIVEL_SUGERIDO[k] ?? edit.nivel });
                }} />
                <datalist id="rubricas">{['Renda', 'Vencimentos', 'Segurança Social', 'Luz', 'Água', 'Internet', 'Seguros', 'Condomínio'].map((r) => <option key={r} value={r} />)}</datalist>
              </label>
              <label className="campo">Categoria do plano
                <select value={edit.categoria ?? ''} onChange={(e) => setEdit({ ...edit, categoria: e.target.value || undefined, contaAnalitica: undefined })}>
                  <option value="">—</option>
                  {catsDespesa.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                </select>
              </label>
              <label className="campo">Conta analítica
                <select value={edit.contaAnalitica ?? ''} onChange={(e) => setEdit({ ...edit, contaAnalitica: e.target.value || undefined })}>
                  <option value="">—</option>
                  {dimsDe('conta').filter((d) => !edit.categoria || !d.categoria || edit.categoria.startsWith(d.categoria)).map((d) => <option key={d.id} value={d.nome}>{d.nome}</option>)}
                </select>
              </label>
              <label className="campo">Fornecedor
                <input value={edit.fornecedor ?? ''} list="fornecedores" onChange={(e) => setEdit({ ...edit, fornecedor: e.target.value || undefined })} />
                <datalist id="fornecedores">{dimsDe('fornecedor').map((d) => <option key={d.id} value={d.nome} />)}</datalist>
              </label>
              <label className="campo">Centro de custo
                <select value={edit.centroCusto ?? ''} onChange={(e) => setEdit({ ...edit, centroCusto: e.target.value || undefined })}>
                  <option value="">—</option>
                  {dimsDe('centro').map((d) => <option key={d.id} value={d.codigo}>{`${d.codigo} ${d.nome}`}</option>)}
                </select>
              </label>
              <label className="campo">Projeto ou evento
                <select value={edit.projeto ?? ''} onChange={(e) => setEdit({ ...edit, projeto: e.target.value || undefined })}>
                  <option value="">—</option>
                  {dimsDe('projeto').map((d) => <option key={d.id} value={d.nome}>{d.nome}</option>)}
                </select>
              </label>
              <label className="campo">Periodicidade
                <select value={edit.periodicidade ? edit.periodicidade.unidade : 'mensal'} onChange={(e) => {
                  const u = e.target.value;
                  setEdit({ ...edit, periodicidade: u === 'mensal' ? undefined : { cada: edit.periodicidade?.cada ?? (u === 'dias' ? 7 : 1), unidade: u as 'meses' | 'anos' | 'dias' }, desde: u === 'mensal' ? undefined : edit.desde ?? `${edit.inicio}-01` });
                }}>
                  <option value="mensal">Todos os meses</option>
                  <option value="meses">A cada N meses</option>
                  <option value="anos">A cada N anos</option>
                  <option value="dias">A cada N dias</option>
                </select>
              </label>
              {edit.periodicidade && <>
                <label className="campo">{`A cada (${edit.periodicidade.unidade})`}<input type="number" inputMode="numeric" min={1} step={1} value={edit.periodicidade.cada} onChange={(e) => setEdit({ ...edit, periodicidade: { ...edit.periodicidade!, cada: Math.max(1, Math.round(Number(e.target.value) || 1)) } })} /></label>
                <CampoData rotulo="Primeira ocorrência" valor={edit.desde ?? ''} onChange={(d) => setEdit({ ...edit, desde: d || undefined })} />
              </>}
              <label className="campo">{edit.periodicidade ? 'Valor de cada vez (€)' : 'Valor mensal (€)'}<input type="number" inputMode="decimal" step="0.01" value={edit.valorMensal} onChange={(e) => setEdit({ ...edit, valorMensal: Number(e.target.value) })} /></label>
              <label className="campo">Incidência (%)<input type="number" inputMode="decimal" min={0} max={100} step="0.01" value={edit.incidencia ?? 100} onChange={(e) => setEdit({ ...edit, incidencia: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
              <label className="campo">Âmbito
                <select value={edit.comunidadeId === COMUNIDADE_GERAL ? 'geral' : edit.ambito ?? 'local'} disabled={edit.comunidadeId === COMUNIDADE_GERAL} onChange={(e) => setEdit({ ...edit, ambito: e.target.value as 'local' | 'geral' })}>
                  <option value="local">Local (só esta comunidade)</option>
                  <option value="geral">Geral (repartido por média proporcional de assistência)</option>
                </select>
              </label>
              <p className="small muted" style={{ gridColumn: '1 / -1', margin: 0 }}>Imputado a esta comunidade: {eur(valorImputado({ valorMensal: Number(edit.valorMensal) || 0, incidencia: edit.incidencia }))} {edit.periodicidade ? `de cada vez (${descreverPeriodicidade(edit)}); no ano: ${eur(noAno({ ...edit, valorMensal: Number(edit.valorMensal) || 0 }))}` : 'por mês'}.</p>
              <label className="campo">Nível de privacidade
                <select value={edit.nivel} onChange={(e) => setEdit({ ...edit, nivel: e.target.value as Nivel })}>{NIVEIS.map((n) => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}</select>
              </label>
              <label className="campo">Ano *<input type="number" inputMode="numeric" min={2000} max={2100} value={anoDoCusto(edit)} onChange={(e) => { const a = Number(e.target.value) || anoDoCusto(edit); setEdit({ ...edit, ano: a, inicio: `${a}-${mm(edit.inicio, '01')}`, fim: `${a}-${mm(edit.fim)}` }); }} /></label>
              <label className="campo">Mês de início
                <select value={mm(edit.inicio, '01')} onChange={(e) => setEdit({ ...edit, ano: anoDoCusto(edit), inicio: `${anoDoCusto(edit)}-${e.target.value}` })}>{MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}</select>
              </label>
              <label className="campo">Mês de fim
                <select value={mm(edit.fim)} onChange={(e) => setEdit({ ...edit, ano: anoDoCusto(edit), fim: `${anoDoCusto(edit)}-${e.target.value}` })}>{MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}</select>
              </label>
              <label className="campo" style={{ gridColumn: '1 / -1' }}>Notas<input value={edit.notas ?? ''} onChange={(e) => setEdit({ ...edit, notas: e.target.value })} /></label>
            </div>
            <div className="acoes" style={{ marginTop: 14 }}>
              <button disabled={!edit.rubrica || !edit.inicio || (!!edit.fim && edit.fim < edit.inicio)} onClick={guardar}>Guardar</button>
              <button className="sec" onClick={() => setEdit(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
