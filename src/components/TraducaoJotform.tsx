import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, Modal, mensagemErro, useCarregar } from './ui';
import { auditar, gravarTraducaoJotform, lerTraducaoJotform, listarCategorias, listarLotes } from '../lib/db';
import { eur, num } from '../lib/format';
import { recalcularAno } from '../lib/recalcular';
import { Escolha } from './Escolha';
import { NOME_ORIGEM, opcoesRegra, ORIGENS_JOTFORM, sugestaoRegra, tradutorJotform, valoresJotform, type LinhaTraducao, type OrigemJotform } from '../lib/traducaoJotform';
import type { Categoria } from '../lib/types';

/** Categorias CAF que servem a cada formulário: entradas (ou financeiras) no Contribuir e nos depósitos; gastos (ou financeiras) nas despesas. */
const servem = (o: OrigemJotform, c: Categoria) => !!c.codigo && c.ativo !== false && (c.tipo === 'financeiro' || c.tipo === (o === 'despesas' ? 'saida' : 'entrada'));
interface Edicao { indice: number | null; l: LinhaTraducao }

/**
 * Regras de tradução das categorias do Jotform para as categorias CAF (Configuração › Jotform e sincronização):
 * "se aparece A, a categoria CAF é B", por formulário. O portal só trabalha com categorias CAF: sem regra, "Por traduzir".
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
  const [edit, setEdit] = useState<Edicao | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [porAplicar, setPorAplicar] = useState(false);
  if (dados.aCarregar || dados.erro || !dados.dados) return <Estado aCarregar={dados.aCarregar || !dados.dados} erro={dados.erro} />;
  const { categorias, traducao, valores } = dados.dados;
  const master = acesso?.papel === 'master';
  const tr = tradutorJotform(traducao, categorias);
  const nomeCat = (codigo: string) => categorias.find((c) => c.codigo === codigo)?.nome ?? `${codigo} (não existe)`;
  const semRegra = valores.filter((v) => tr(v.origem, v.valor).fonte === null);
  const apanha = (l: LinhaTraducao) => valores.filter((v) => v.origem === l.origem && tr(v.origem, v.valor).regra === l);

  async function gravarLinhas(linhas: LinhaTraducao[], descricao: string) {
    setOcupado(true); setMsg(null);
    try {
      await gravarTraducaoJotform({ linhas, atualizadoEm: new Date().toISOString(), atualizadoPor: acesso!.email });
      await auditar(acesso!.email, 'tradução das categorias do Jotform', descricao);
      setEdit(null); setPorAplicar(true);
      await dados.recarregar();
    } catch (e) { setMsg({ tipo: 'erro', texto: mensagemErro(e) }); } finally { setOcupado(false); }
  }
  function guardar() {
    if (!edit) return;
    const l = { ...edit.l, valor: opcoesRegra(edit.l.valor).join(';'), modo: edit.l.modo ?? 'igual' };
    const linhas = edit.indice == null ? [...traducao.linhas, l] : traducao.linhas.map((x, i) => (i === edit.indice ? l : x));
    void gravarLinhas(linhas, `${edit.indice == null ? 'Nova regra' : 'Regra alterada'}: ${NOME_ORIGEM[l.origem]} · ${l.modo === 'contem' ? 'contém' : 'igual a'} "${l.valor}" → ${nomeCat(l.codigo)}`);
  }
  function apagar(i: number) {
    const l = traducao.linhas[i];
    if (!confirm(`Apagar a regra "${l.valor}" → ${nomeCat(l.codigo)}?`)) return;
    void gravarLinhas(traducao.linhas.filter((_, k) => k !== i), `Regra apagada: ${NOME_ORIGEM[l.origem]} · "${l.valor}" → ${nomeCat(l.codigo)}`);
  }
  async function aplicar() {
    setOcupado(true); setMsg(null);
    try {
      await recalcularAno(acesso!, ano, 'Tradução das categorias do Jotform');
      setPorAplicar(false);
      setMsg({ tipo: 'ok', texto: `Resumos de ${ano} recalculados com as regras. Para ${ano - 1}, use Recalcular no Painel com esse ano.` });
    } catch (e) { setMsg({ tipo: 'erro', texto: mensagemErro(e) }); } finally { setOcupado(false); }
  }
  const novaRegra = (origem: OrigemJotform = 'contribuir', valor = '') =>
    setEdit({ indice: null, l: { origem, valor, modo: 'igual', codigo: valor ? sugestaoRegra(origem, valor, categorias)?.codigo ?? '' : '' } });
  const valido = !!edit && opcoesRegra(edit.l.valor).length > 0 && !!edit.l.codigo;

  return (
    <div className="sec card">
      <div className="linha" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ marginTop: 0 }}>Tradução das categorias do Jotform</h2>
        {master && <button onClick={() => novaRegra()}>Nova regra</button>}
      </div>
      <p className="small">O portal só trabalha com <b>categorias CAF</b>. Cada regra diz: no formulário X, <b>se aparece A, a categoria CAF é B</b>. "Igual" exige o mesmo texto (sem contar maiúsculas e acentos); "Contém" apanha o texto dentro de outro (ex.: "Dízimo" apanha "Dízimo Sede Manhã"). Uma regra pode ter <b>várias opções separadas por ";"</b> (ex.: "Retiro;Retiros;B1-Retiro2026"): basta uma aparecer. Sem regra, o registo aparece como "Por traduzir". O Jotform não é alterado.</p>
      {msg && <div className={msg.tipo === 'ok' ? 'ok-box' : 'aviso'}>{msg.texto}</div>}
      {porAplicar && master && <div className="nota">Regras gravadas. Os resultados do Painel e das análises mudam depois de recalcular. <button className="sec" disabled={ocupado} onClick={() => void aplicar()}>{ocupado ? 'A recalcular…' : `Recalcular ${ano}`}</button></div>}

      <h3>Regras ({num(traducao.linhas.length)})</h3>
      {!traducao.linhas.length ? <p className="muted small">Ainda não há regras. Comece pelos valores sem regra, em baixo.</p> : (
        <div className="tabela"><table>
          <thead><tr><th>Formulário</th><th>Se aparece (A)</th><th>Correspondência</th><th>Categoria CAF (B)</th><th className="num">Registos que apanha</th>{master && <th />}</tr></thead>
          <tbody>{traducao.linhas.map((l, i) => {
            const vs = apanha(l);
            return (
              <tr key={`${l.origem}|${l.valor}|${i}`}>
                <td className="small">{NOME_ORIGEM[l.origem]}</td>
                <td>{opcoesRegra(l.valor).join('; ')}</td>
                <td className="small">{l.modo === 'contem' ? 'Contém' : 'Igual'}</td>
                <td>{nomeCat(l.codigo)}</td>
                <td className="num" title={vs.map((v) => v.valor).join(', ')}>{num(vs.reduce((s, v) => s + v.n, 0))}</td>
                {master && <td><button className="link" onClick={() => setEdit({ indice: i, l })}>Editar</button> · <button className="link" onClick={() => apagar(i)}>Apagar</button></td>}
              </tr>
            );
          })}</tbody>
        </table></div>
      )}

      <h3>Valores do Jotform sem regra ({num(semRegra.length)})</h3>
      {!semRegra.length ? <p className="ok-box small">Todos os valores do Jotform de {ano - 1} e {ano} têm regra.</p> : <>
        <div className="aviso">{num(semRegra.length)} valores ainda aparecem como "Por traduzir" nos resultados.</div>
        <div className="tabela"><table>
          <thead><tr><th>Formulário</th><th>Valor no Jotform</th><th className="num">Registos</th><th className="num">Total</th><th>Sugestão</th>{master && <th />}</tr></thead>
          <tbody>{semRegra.map((v) => (
            <tr key={`${v.origem}|${v.valor}`}>
              <td className="small">{NOME_ORIGEM[v.origem]}</td>
              <td>{v.valor}</td>
              <td className="num">{num(v.n)}</td>
              <td className="num">{eur(v.total)}</td>
              <td className="small muted">{sugestaoRegra(v.origem, v.valor, categorias)?.nome ?? '—'}</td>
              {master && <td><button className="link" onClick={() => novaRegra(v.origem, v.valor)}>Criar regra</button></td>}
            </tr>
          ))}</tbody>
        </table></div>
      </>}
      {!master && <p className="small muted">Só o Master cria e altera regras.</p>}
      {traducao.atualizadoEm && <p className="small muted">Última alteração: {new Date(traducao.atualizadoEm).toLocaleDateString('pt-PT')} · {traducao.atualizadoPor}</p>}

      {edit && (
        <Modal titulo={edit.indice == null ? 'Nova regra de tradução' : 'Editar regra de tradução'} onFechar={() => setEdit(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <label className="campo">Formulário
              <select value={edit.l.origem} onChange={(e) => setEdit({ ...edit, l: { ...edit.l, origem: e.target.value as OrigemJotform, codigo: '' } })}>
                {ORIGENS_JOTFORM.map((o) => <option key={o} value={o}>{NOME_ORIGEM[o]}</option>)}
              </select></label>
            <label className="campo">Se aparece (A)<input value={edit.l.valor} placeholder="Retiro;Retiros;B1-Retiro2026" onChange={(e) => setEdit({ ...edit, l: { ...edit.l, valor: e.target.value } })} /></label>
            <label className="campo">Correspondência
              <select value={edit.l.modo ?? 'igual'} onChange={(e) => setEdit({ ...edit, l: { ...edit.l, modo: e.target.value as 'igual' | 'contem' } })}>
                <option value="igual">Igual</option><option value="contem">Contém</option>
              </select></label>
            <label className="campo">Categoria CAF (B)
              <Escolha aria-label="Categoria CAF" vazio="Escolha…" valor={edit.l.codigo} opcoes={categorias.filter((c) => servem(edit.l.origem, c)).map((c) => ({ valor: c.codigo!, rotulo: c.nome }))} onChange={(v) => setEdit({ ...edit, l: { ...edit.l, codigo: v } })} /></label>
          </div>
          {edit.l.valor.trim() && <p className="small">Apanha {num(valores.filter((v) => v.origem === edit.l.origem && tradutorJotform({ linhas: [{ ...edit.l, modo: edit.l.modo ?? 'igual', codigo: edit.l.codigo || (categorias.find((c) => servem(edit.l.origem, c))?.codigo ?? '') }] }, categorias)(v.origem, v.valor).fonte === 'regra').reduce((s, v) => s + v.n, 0))} registos de {ano - 1} e {ano}.</p>}
          <div className="acoes" style={{ marginTop: 12 }}>
            <button disabled={!valido || ocupado} onClick={guardar}>{ocupado ? 'A gravar…' : 'Guardar regra'}</button>
            <button className="sec" onClick={() => setEdit(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
