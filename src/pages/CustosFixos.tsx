import { useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, Modal, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { apagar, auditar, gravar, listarComunidades, listarCustosFixos } from '../lib/db';
import { eur, periodo, r2 } from '../lib/format';
import { custoAtivo, custoNoAno, mesesDecorridos, valorImputado } from '../lib/resumos';
import { importarCustosFixos, type ResultadoImportacao } from '../lib/custosImport';
import { lerFicheiro } from '../lib/ficheiros';
import { NIVEIS, NIVEL_LABEL, type CustoFixo, type Nivel } from '../lib/types';
import { hoje } from '../lib/format';

/** AAAA-MM → mm/aaaa. */
const mesPT = (p?: string | null) => (p ? p.split('-').reverse().join('/') : '');
const pct = (v?: number) => `${(v ?? 100).toLocaleString('pt-PT', { maximumFractionDigits: 2 })}%`;

const vazio = (comunidadeId: string): CustoFixo => ({ id: '', comunidadeId, rubrica: '', valorMensal: 0, inicio: `${new Date().getFullYear()}-01`, fim: null, nivel: 'privado' });
const NIVEL_SUGERIDO: Record<string, Nivel> = { vencimentos: 'confidencial', 'seguranca social': 'confidencial', renda: 'privado', luz: 'publico', agua: 'publico', internet: 'publico' };

export default function CustosFixos() {
  const { acesso, pode } = useAuth();
  const { ano, comunidade } = useFiltros();
  const coms = useCarregar(listarComunidades, []);
  const cf = useCarregar(() => listarCustosFixos(acesso!), [acesso?.email]);
  const [edit, setEdit] = useState<CustoFixo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const nomes = new Map((coms.dados ?? []).map((c) => [c.id, c.nome]));
  const linhas = (cf.dados ?? []).filter((c) => (comunidade === 'todas' || c.comunidadeId === comunidade) && custoNoAno(c, ano))
    .sort((a, b) => (nomes.get(a.comunidadeId) ?? '').localeCompare(nomes.get(b.comunidadeId) ?? '') || a.rubrica.localeCompare(b.rubrica) || a.inicio.localeCompare(b.inicio));
  const ate = mesesDecorridos(ano, hoje());
  const noAno = (c: CustoFixo) => r2(Array.from({ length: 12 }, (_, i) => (custoAtivo(c, periodo(ano, i + 1)) ? valorImputado(c) : 0)).reduce((s, v) => s + v, 0));
  const ateHoje = (c: CustoFixo) => r2(Array.from({ length: ate }, (_, i) => (custoAtivo(c, periodo(ano, i + 1)) ? valorImputado(c) : 0)).reduce((s, v) => s + v, 0));
  const ficheiro = useRef<HTMLInputElement>(null);
  const [imp, setImp] = useState<(ResultadoImportacao & { nome: string; substituir: boolean }) | null>(null);
  const [aImportar, setAImportar] = useState(false);

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
      await gravar('custos_fixos', { ...edit, id, valorMensal: r2(Number(edit.valorMensal)), incidencia, ambito: edit.ambito ?? 'local', fim: edit.fim || null });
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
          <h1>Custos fixos por comunidade</h1>
          <p className="muted">Uma linha por rubrica e período. Quando um valor muda a meio do ano, feche a linha anterior (mês de fim) e crie uma nova. Os vencimentos e a Segurança Social são confidenciais. A <b>incidência</b> é a parte do custo imputada a esta comunidade (custos partilhados); nos resultados entra o valor imputado. Os custos de âmbito <b>geral</b> repartem-se pelas comunidades conforme a assistência.</p>
        </div>
        {pode('custos') && <div className="acoes">
          <button className="sec" onClick={() => ficheiro.current?.click()}>Importar do Excel</button>
          <input ref={ficheiro} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void lerImportacao(f); }} />
          <button onClick={() => setEdit(vazio(comunidade === 'todas' ? (acesso!.comunidades[0] === '*' ? 'caldas-da-rainha' : acesso!.comunidades[0]) : comunidade))}>Nova linha</button>
        </div>}
      </div>
      {msg && <div className="aviso">{msg}</div>}
      <Estado aCarregar={cf.aCarregar} erro={cf.erro} vazio={!linhas.length} />
      {!!linhas.length && (
        <div className="tabela"><table>
          <thead><tr><th>Comunidade</th><th>Rubrica</th><th>Nível</th><th className="num">Mensal (total)</th><th className="num">Incidência</th><th className="num">Imputado</th><th>Âmbito</th><th>Início</th><th>Fim</th><th className="num">{ano} (até hoje)</th><th className="num">{ano} (ano)</th><th /></tr></thead>
          <tbody>{linhas.map((c) => (
            <tr key={c.id}>
              <td>{nomes.get(c.comunidadeId) ?? c.comunidadeId}</td>
              <td>{c.rubrica}{c.notas && <div className="muted">{c.notas}</div>}</td>
              <td><span className={'etiqueta' + (c.nivel === 'confidencial' ? ' preta' : '')}>{NIVEL_LABEL[c.nivel]}</span></td>
              <td className="num">{eur(c.valorMensal)}</td><td className="num">{pct(c.incidencia)}</td><td className="num">{eur(valorImputado(c))}</td>
              <td className="small">{c.ambito === 'geral' ? 'Geral' : 'Local'}</td><td>{mesPT(c.inicio)}</td><td>{c.fim ? mesPT(c.fim) : 'em vigor'}</td>
              <td className="num">{eur(ateHoje(c))}</td><td className="num">{eur(noAno(c))}</td>
              <td>{pode('custos') && <><button className="link" onClick={() => setEdit(c)}>Editar</button> · <button className="link" onClick={() => remover(c)}>Remover</button></>}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr><td colSpan={9}>Total (imputado)</td><td className="num">{eur(r2(linhas.reduce((s, c) => s + ateHoje(c), 0)))}</td><td className="num">{eur(r2(linhas.reduce((s, c) => s + noAno(c), 0)))}</td><td /></tr></tfoot>
        </table></div>
      )}
      {imp && (
        <Modal titulo={`Importar custos fixos: ${imp.nome}`} onFechar={() => setImp(null)}>
          <p className="small">{imp.custos.length} custos fixos de {comsImp.size} comunidades, anos {imp.anos.join(', ')}. Cada ano vale de janeiro a dezembro; o último ({imp.anos[imp.anos.length - 1]}) fica em vigor. Os nomes das pessoas foram retirados das rubricas.</p>
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
      {edit && (
        <div className="modal-fundo" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{edit.id ? 'Editar custo fixo' : 'Novo custo fixo'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <label className="campo">Comunidade
                <select value={edit.comunidadeId} onChange={(e) => setEdit({ ...edit, comunidadeId: e.target.value })}>
                  {(coms.dados ?? []).filter((c) => !c.especial && (c.ativo !== false || c.id === edit.comunidadeId) && (acesso!.comunidades.includes('*') || acesso!.comunidades.includes(c.id))).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </label>
              <label className="campo">Rubrica
                <input value={edit.rubrica} list="rubricas" onChange={(e) => {
                  const r = e.target.value; const k = r.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
                  setEdit({ ...edit, rubrica: r, nivel: edit.id ? edit.nivel : NIVEL_SUGERIDO[k] ?? edit.nivel });
                }} />
                <datalist id="rubricas">{['Renda', 'Vencimentos', 'Segurança Social', 'Luz', 'Água', 'Internet', 'Seguros', 'Condomínio'].map((r) => <option key={r} value={r} />)}</datalist>
              </label>
              <label className="campo">Valor mensal (€)<input type="number" inputMode="decimal" step="0.01" value={edit.valorMensal} onChange={(e) => setEdit({ ...edit, valorMensal: Number(e.target.value) })} /></label>
              <label className="campo">Incidência (%)<input type="number" inputMode="decimal" min={0} max={100} step="0.01" value={edit.incidencia ?? 100} onChange={(e) => setEdit({ ...edit, incidencia: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
              <label className="campo">Âmbito
                <select value={edit.ambito ?? 'local'} onChange={(e) => setEdit({ ...edit, ambito: e.target.value as 'local' | 'geral' })}>
                  <option value="local">Local (só esta comunidade)</option>
                  <option value="geral">Geral (repartido pela assistência)</option>
                </select>
              </label>
              <p className="small muted" style={{ gridColumn: '1 / -1', margin: 0 }}>Imputado a esta comunidade: {eur(valorImputado({ valorMensal: Number(edit.valorMensal) || 0, incidencia: edit.incidencia }))} por mês.</p>
              <label className="campo">Nível de privacidade
                <select value={edit.nivel} onChange={(e) => setEdit({ ...edit, nivel: e.target.value as Nivel })}>{NIVEIS.map((n) => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}</select>
              </label>
              <label className="campo">Início (mês)<input type="month" value={edit.inicio} onChange={(e) => setEdit({ ...edit, inicio: e.target.value })} /></label>
              <label className="campo">Fim (mês, vazio = em vigor)<input type="month" value={edit.fim ?? ''} onChange={(e) => setEdit({ ...edit, fim: e.target.value || null })} /></label>
              <label className="campo" style={{ gridColumn: '1 / -1' }}>Notas<input value={edit.notas ?? ''} onChange={(e) => setEdit({ ...edit, notas: e.target.value })} /></label>
            </div>
            <div className="acoes" style={{ marginTop: 14 }}>
              <button disabled={!edit.rubrica || !edit.inicio} onClick={guardar}>Guardar</button>
              <button className="sec" onClick={() => setEdit(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
