import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Modal, mensagemErro, useCarregar } from './ui';
import { auditar, gravarLotes, listarCategorias, listarComunidades, listarDimensoes, listarLotes } from '../lib/db';
import { Escolha } from './Escolha';
import { useCriarDimensao } from './useCriarDimensao';
import { opcoesCategorias, opcoesDimensoes } from '../lib/escolha';
import { lerFicheiro } from '../lib/ficheiros';
import { eur, r2 } from '../lib/format';
import { juntarIfthenpay, lerPagamentosIfthenpay, registosIfthenpay, type PagamentoIfthenpay } from '../lib/ifthenpay';

const dataPt = (d: string) => d.split('-').reverse().join('/');

/**
 * Dados › Contribuir › Importar pagamentos IFTHENPAY: a exportação dos pagamentos dos formulários da IFTHENPAY
 * entra no Contribuir da comunidade escolhida, com a categoria e o centro de custo. Cada pedido só entra uma vez.
 */
export function ImportarIfthenpay({ onFechar, onFeito }: { onFechar: () => void; onFeito: () => void }) {
  const { acesso } = useAuth();
  const coms = useCarregar(listarComunidades, []);
  const cats = useCarregar(listarCategorias, []);
  const dims = useCarregar(listarDimensoes, []);
  const [nome, setNome] = useState('');
  const [pags, setPags] = useState<PagamentoIfthenpay[]>([]);
  const [existentes, setExistentes] = useState<Set<string>>(new Set());
  const [comunidadeId, setComunidade] = useState('');
  const [categoria, setCategoria] = useState('');
  const [centroCusto, setCentro] = useState('');
  const [projeto, setProjeto] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [contaAnalitica, setConta] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const entradas = (cats.dados ?? []).filter((c) => c.tipo === 'entrada' && c.ativo !== false);
  const criarDim = useCriarDimensao(dims.dados ?? [], dims.recarregar);
  const dimsDe = (t: 'centro' | 'projeto' | 'fornecedor' | 'conta') => criarDim.todas.filter((d) => d.tipo === t && d.ativo !== false);
  const centros = dimsDe('centro');
  const codCat = entradas.find((c) => c.nome === categoria)?.codigo;
  const contas = dimsDe('conta').filter((d) => !codCat || !d.categoria || d.categoria === codCat);
  const anos = [...new Set(pags.map((p) => Number(p.data.slice(0, 4))))];
  const novos = pags.filter((p) => !existentes.has(`portal-ifthenpay-${p.idPedido}`));
  const soma = (xs: PagamentoIfthenpay[], k: 'valor' | 'tarifa' | 'liquido') => r2(xs.reduce((s, p) => s + p[k], 0));
  const datas = pags.map((p) => p.data).sort();

  /** Ids dos pagamentos IFTHENPAY já gravados (em qualquer comunidade) nos anos do ficheiro. */
  async function idsGravados(as: number[]) {
    const lotes = (await Promise.all(as.map((a) => listarLotes(acesso!, 'contribuir', a)))).flat();
    return new Set(lotes.flatMap((l) => l.registos.map((r) => r.id)).filter((id) => id.startsWith('portal-ifthenpay-')));
  }

  async function ler(f: File) {
    setMsg(null); setPags([]);
    try {
      const r = lerPagamentosIfthenpay(await lerFicheiro(f));
      if (r.erro) { setMsg({ tipo: 'erro', texto: r.erro }); return; }
      setNome(f.name); setPags(r.pagamentos);
      setExistentes(await idsGravados([...new Set(r.pagamentos.map((p) => Number(p.data.slice(0, 4))))]));
      if (r.rejeitadas) setMsg({ tipo: 'erro', texto: `${r.rejeitadas} linhas sem ID do pedido, data ou valor foram ignoradas.` });
    } catch (e) { setMsg({ tipo: 'erro', texto: mensagemErro(e) }); }
  }

  async function gravar() {
    if (!comunidadeId || !categoria) { setMsg({ tipo: 'erro', texto: 'Escolha a comunidade e a categoria.' }); return; }
    setOcupado(true); setMsg(null);
    try {
      const agora = new Date().toISOString();
      const quem = acesso!.email;
      const ja = await idsGravados(anos); // volta a confirmar, para nunca gravar duas vezes
      const regs = registosIfthenpay(pags, { comunidadeId, categoria, centroCusto, projeto: projeto || undefined, fornecedor: fornecedor.trim() || undefined, contaAnalitica: contaAnalitica || undefined }, quem, agora);
      const [priv, conf] = await Promise.all([false, true].map(async (c) => (await Promise.all(anos.map((a) => listarLotes(acesso!, 'contribuir', a, c)))).flat()));
      const p = juntarIfthenpay(regs, comunidadeId, new Map(priv.map((l) => [l.id, l])), ja, quem, agora);
      const c = juntarIfthenpay(regs, comunidadeId, new Map(conf.map((l) => [l.id, l])), ja, quem, agora);
      if (!p.novos) { setMsg({ tipo: 'ok', texto: `Nada a gravar: os ${p.repetidos} pagamentos deste ficheiro já tinham sido importados.` }); return; }
      const porId = new Map(c.lotes.map((l) => [l.id, l]));
      const falhas = await gravarLotes(p.lotes.map((l) => porId.get(l.id)!), p.lotes);
      const nomeCom = (coms.dados ?? []).find((x) => x.id === comunidadeId)?.nome ?? comunidadeId;
      await auditar(quem, 'importar IFTHENPAY', `${nome}: ${p.novos} pagamentos (${eur(soma(novos, 'valor'))}, líquido ${eur(soma(novos, 'liquido'))}) em ${nomeCom} · ${categoria}· ${[centroCusto, projeto, fornecedor.trim(), contaAnalitica].filter(Boolean).join(' · ')}${p.repetidos ? `; ${p.repetidos} já importados` : ''}${falhas.length ? `; recusados: ${falhas.join(', ')}` : ''}`);
      setExistentes(await idsGravados(anos));
      setMsg({ tipo: falhas.length ? 'erro' : 'ok', texto: `${p.novos} pagamentos gravados em ${nomeCom}${p.repetidos ? `; ${p.repetidos} já tinham sido importados e ficaram de fora` : ''}.${falhas.length ? ` Recusados (mês fechado ou sem permissão): ${falhas.join(', ')}.` : ' Recalcule os resumos no Painel para atualizar os totais.'}` });
      onFeito();
    } catch (e) { setMsg({ tipo: 'erro', texto: mensagemErro(e) }); } finally { setOcupado(false); }
  }

  return (
    <Modal titulo="Importar pagamentos IFTHENPAY" onFechar={onFechar}>
      <div className="nota">Pagamentos recebidos pelos formulários da IFTHENPAY (não passam pelo Jotform). Exporte em IFTHENPAY › Pagamentos (Excel) e carregue o ficheiro. Entram no Contribuir da comunidade escolhida e o líquido entra na conferência dos lotes IFTHENPAY do extrato. <b>Cada pedido só é gravado uma vez</b>: os que já foram importados ficam de fora.</div>
      <input type="file" accept=".xlsx,.csv" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void ler(f); }} />
      {!!pags.length && <>
        <div className="tabela" style={{ marginTop: 10 }}><table>
          <thead><tr><th>Ficheiro</th><th>Período</th><th className="num">Pagamentos</th><th className="num">Valor</th><th className="num">Tarifa</th><th className="num">Líquido</th></tr></thead>
          <tbody>
            <tr><td className="small">{nome}</td><td>{`${dataPt(datas[0])} a ${dataPt(datas[datas.length - 1])}`}</td><td className="num">{pags.length}</td><td className="num">{eur(soma(pags, 'valor'))}</td><td className="num">{eur(soma(pags, 'tarifa'))}</td><td className="num">{eur(soma(pags, 'liquido'))}</td></tr>
            <tr><td colSpan={2}><b>A gravar</b> (ainda não importados)</td><td className="num"><b>{novos.length}</b></td><td className="num"><b>{eur(soma(novos, 'valor'))}</b></td><td className="num">{eur(soma(novos, 'tarifa'))}</td><td className="num"><b>{eur(soma(novos, 'liquido'))}</b></td></tr>
          </tbody>
        </table></div>
        {pags.length > novos.length && <p className="small muted">{`${pags.length - novos.length} pagamentos deste ficheiro já foram importados e não voltam a entrar.`}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
          <label className="campo">Comunidade *
            <select value={comunidadeId} onChange={(e) => setComunidade(e.target.value)}>
              <option value="">Escolha…</option>
              {(coms.dados ?? []).filter((c) => c.ativo !== false).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="campo">Categoria *
            <Escolha aria-label="Categoria" vazio="Escolha…" valor={categoria} opcoes={opcoesCategorias(entradas)} onChange={(v) => { setCategoria(v); setConta(''); }} />
          </label>
          <label className="campo">Centro de custo *
            <Escolha aria-label="Centro de custo" vazio="Escolha…" valor={centroCusto} opcoes={opcoesDimensoes(centros)} criar={criarDim.criar('centro')} onChange={setCentro} />
          </label>
          <label className="campo">Projeto ou evento
            <Escolha aria-label="Projeto ou evento" vazio="—" valor={projeto} opcoes={opcoesDimensoes(dimsDe('projeto'))} criar={criarDim.criar('projeto')} onChange={setProjeto} />
          </label>
          <label className="campo">Fornecedor
            <Escolha aria-label="Fornecedor" vazio="—" textoLivre valor={fornecedor} opcoes={opcoesDimensoes(dimsDe('fornecedor'))} criar={criarDim.criar('fornecedor')} onChange={setFornecedor} />
          </label>
          <label className="campo">Conta analítica
            <Escolha aria-label="Conta analítica" vazio="—" valor={contaAnalitica} opcoes={opcoesDimensoes(contas)} onChange={setConta} />
          </label>
        </div>
      </>}
      {msg && <div className={msg.tipo === 'ok' ? 'ok-box' : 'aviso'} style={{ marginTop: 10 }}>{msg.texto}</div>}
      <div className="acoes" style={{ marginTop: 14 }}>
        <button disabled={ocupado || !novos.length || !comunidadeId || !categoria || !centroCusto} onClick={() => void gravar()}>{ocupado ? 'A gravar…' : `Gravar ${novos.length} pagamentos`}</button>
        <button className="sec" onClick={onFechar}>Fechar</button>
      </div>
    </Modal>
  );
}
