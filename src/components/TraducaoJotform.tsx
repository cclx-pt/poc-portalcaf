import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, mensagemErro, useCarregar } from './ui';
import { auditar, gravarTraducaoJotform, lerTraducaoJotform, listarCategorias, listarLotes } from '../lib/db';
import { eur, norm, num } from '../lib/format';
import { recalcularAno } from '../lib/recalcular';
import { NOME_ORIGEM, ORIGENS_JOTFORM, tradutorJotform, valoresJotform, type LinhaTraducao, type OrigemJotform } from '../lib/traducaoJotform';
import type { Categoria } from '../lib/types';

const chave = (o: OrigemJotform, v: string) => `${o}|${norm(v).replace(/[^a-z0-9]+/g, ' ').trim()}`;
/** Categorias CAF que servem a cada formulário: entradas (ou financeiras) no Contribuir e nos depósitos; gastos (ou financeiras) nas despesas. */
const servem = (o: OrigemJotform, c: Categoria) => !!c.codigo && c.ativo !== false && (c.tipo === 'financeiro' || c.tipo === (o === 'despesas' ? 'saida' : 'entrada'));

/**
 * Tabela de tradução das categorias do Jotform para as categorias CAF (Configuração › Jotform e sincronização).
 * O portal só trabalha com categorias CAF: o que não tiver tradução aparece como "Por traduzir" nos resultados.
 */
export function TraducaoJotform() {
  const { acesso } = useAuth();
  const ano = new Date().getFullYear();
  const dados = useCarregar(async () => {
    const [categorias, traducao, ...ls] = await Promise.all([
      listarCategorias(), lerTraducaoJotform(),
      ...ORIGENS_JOTFORM.flatMap((o) => [listarLotes(acesso!, o, ano), listarLotes(acesso!, o, ano - 1)]),
    ]);
    const lotes = Object.fromEntries(ORIGENS_JOTFORM.map((o, i) => [o, [...ls[i * 2], ...ls[i * 2 + 1]]]));
    return { categorias, traducao, valores: valoresJotform(lotes) };
  }, [acesso?.email]);
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [filtro, setFiltro] = useState<'todos' | 'por-traduzir'>('todos');
  if (dados.aCarregar || dados.erro || !dados.dados) return <Estado aCarregar={dados.aCarregar || !dados.dados} erro={dados.erro} />;
  const { categorias, traducao, valores } = dados.dados;
  const master = acesso?.papel === 'master';
  const daTabela = Object.fromEntries(traducao.linhas.map((l) => [chave(l.origem, l.valor), l.codigo]));
  const atual = edit ?? daTabela;
  const tr = tradutorJotform({ linhas: [] }, categorias);
  const codigoDe = new Map(categorias.filter((c) => c.codigo).map((c) => [c.nome, c.codigo!]));
  // Linhas: os valores que existem nos dados e as traduções gravadas que já não aparecem nos dados.
  const linhas = [...valores, ...traducao.linhas.filter((l) => !valores.some((v) => chave(v.origem, v.valor) === chave(l.origem, l.valor))).map((l) => ({ origem: l.origem, valor: l.valor, n: 0, total: 0 }))];
  const estado = (o: OrigemJotform, v: string) => {
    if (atual[chave(o, v)]) return 'tabela';
    const r = tr(o, v);
    return r.fonte === 'caf' ? 'caf' : r.fonte === 'automatica' ? 'automatica' : 'falta';
  };
  const nFalta = linhas.filter((l) => estado(l.origem, l.valor) === 'falta').length;
  const nAuto = linhas.filter((l) => estado(l.origem, l.valor) === 'automatica').length;
  const mostrar = filtro === 'todos' ? linhas : linhas.filter((l) => ['falta', 'automatica'].includes(estado(l.origem, l.valor)));

  function aceitarPropostas() {
    const n = { ...atual };
    for (const l of linhas) if (estado(l.origem, l.valor) === 'automatica') n[chave(l.origem, l.valor)] = codigoDe.get(tr(l.origem, l.valor).categoria!)!;
    setEdit(n);
  }
  async function guardar() {
    setOcupado(true); setMsg(null);
    try {
      const novas: LinhaTraducao[] = linhas.filter((l) => atual[chave(l.origem, l.valor)]).map((l) => ({ origem: l.origem, valor: l.valor, codigo: atual[chave(l.origem, l.valor)] }));
      await gravarTraducaoJotform({ linhas: novas, atualizadoEm: new Date().toISOString(), atualizadoPor: acesso!.email });
      await auditar(acesso!.email, 'tradução das categorias do Jotform', `${novas.length} traduções gravadas`);
      await recalcularAno(acesso!, ano, 'Tradução das categorias do Jotform');
      setEdit(null);
      await dados.recarregar();
      setMsg({ tipo: 'ok', texto: `${novas.length} traduções gravadas e resumos de ${ano} recalculados. Para anos anteriores, use Recalcular no Painel.` });
    } catch (e) { setMsg({ tipo: 'erro', texto: mensagemErro(e) }); } finally { setOcupado(false); }
  }

  return (
    <div className="sec card">
      <h2 style={{ marginTop: 0 }}>Tradução das categorias do Jotform</h2>
      <p className="small">O portal só trabalha com <b>categorias CAF</b>. Os formulários do Jotform usam nomes diferentes para a mesma coisa ("Dízimo", "Dizimo", "Dízimos"…): aqui diz-se a que categoria CAF corresponde cada valor, por formulário. O Jotform não é alterado; a tradução aplica-se nos resultados, nas listas e na exportação. Valores dos anos {ano - 1} e {ano}.</p>
      {(nFalta > 0 || nAuto > 0) && <div className="aviso">{nFalta > 0 && <>{num(nFalta)} valores <b>por traduzir</b> (aparecem como "Por traduzir" nos resultados). </>}{nAuto > 0 && <>{num(nAuto)} com proposta automática por confirmar.</>}</div>}
      {msg && <div className={msg.tipo === 'ok' ? 'ok-box' : 'aviso'}>{msg.texto}</div>}
      <div className="linha" style={{ gap: 8, marginBottom: 8 }}>
        <label className="campo">Mostrar
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as 'todos' | 'por-traduzir')}><option value="todos">Todos</option><option value="por-traduzir">Por traduzir ou por confirmar</option></select>
        </label>
        {master && nAuto > 0 && <button className="sec" style={{ alignSelf: 'flex-end' }} onClick={aceitarPropostas}>{`Aceitar as ${nAuto} propostas automáticas`}</button>}
      </div>
      <div className="tabela"><table>
        <thead><tr><th>Formulário</th><th>Valor no Jotform</th><th className="num">Registos</th><th className="num">Total</th><th>Categoria CAF</th><th>Estado</th></tr></thead>
        <tbody>{mostrar.map((l) => {
          const k = chave(l.origem, l.valor);
          const e = estado(l.origem, l.valor);
          const proposta = e === 'automatica' || e === 'caf' ? tr(l.origem, l.valor).categoria : null;
          return (
            <tr key={k}>
              <td className="small">{NOME_ORIGEM[l.origem]}</td>
              <td>{l.valor}</td>
              <td className="num">{l.n ? num(l.n) : '—'}</td>
              <td className="num">{l.n ? eur(l.total) : '—'}</td>
              <td>
                {e === 'caf' ? <span className="small muted">Já é uma categoria CAF</span> : (
                  <select value={atual[k] ?? ''} disabled={!master} aria-label={`Categoria CAF para ${l.valor}`} onChange={(ev) => setEdit({ ...atual, [k]: ev.target.value })}>
                    <option value="">{proposta ? `Proposta: ${proposta}` : 'Escolha…'}</option>
                    {categorias.filter((c) => servem(l.origem, c)).map((c) => <option key={c.id} value={c.codigo}>{c.nome}</option>)}
                  </select>
                )}
              </td>
              <td className="small">{e === 'tabela' ? 'Traduzido' : e === 'caf' ? 'Categoria CAF' : e === 'automatica' ? 'Proposta automática' : <b className="neg">Por traduzir</b>}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
      {master
        ? <div className="acoes" style={{ marginTop: 10 }}><button disabled={ocupado || !edit} onClick={() => void guardar()}>{ocupado ? 'A gravar…' : 'Guardar tradução'}</button>{edit && <button className="sec" onClick={() => setEdit(null)}>Cancelar</button>}</div>
        : <p className="small muted">Só o Master altera a tradução.</p>}
      {traducao.atualizadoEm && <p className="small muted">Última alteração: {new Date(traducao.atualizadoEm).toLocaleDateString('pt-PT')} · {traducao.atualizadoPor}</p>}
    </div>
  );
}
