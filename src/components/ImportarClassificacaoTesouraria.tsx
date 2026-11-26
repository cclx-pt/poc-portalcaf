import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Modal, mensagemErro } from './ui';
import { auditar, gravar, gravarBancoLote, listarBanco, listarCategorias, listarComunidades, listarDimensoes } from '../lib/db';
import { lerFicheiro } from '../lib/ficheiros';
import { aplicarClassificacaoTesouraria, categoriasEmFalta, dimensoesEmFalta, lerFolhaTesouraria, type LinhaTesouraria, type ResultadoTesouraria } from '../lib/classificacaoTesouraria';
import type { BancoLote, Categoria, Dimensao } from '../lib/types';

interface Previa { linhas: LinhaTesouraria[]; ignoradas: number; lotes: BancoLote[]; res: ResultadoTesouraria; cats: Categoria[]; dims: Dimensao[] }

/**
 * Aplica a classificação feita pela tesouraria fora do portal (folha "Proposta") aos movimentos do banco do ano:
 * cria as categorias, centros de custo, projetos, fornecedores e contas analíticas em falta e deixa os movimentos como propostos.
 */
export function ImportarClassificacaoTesouraria({ ano, onFechar, onFeito }: { ano: number; onFechar: () => void; onFeito: () => void }) {
  const { acesso } = useAuth();
  const [nome, setNome] = useState('');
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function escolher(f: File) {
    setMsg(null); setPrevia(null); setNome(f.name); setOcupado(true);
    try {
      const t = await lerFicheiro(f, 'auto', 'Proposta');
      const { linhas: todas, ignoradas, erro } = lerFolhaTesouraria(t);
      if (erro) { setMsg({ tipo: 'erro', texto: erro }); return; }
      const linhas = todas.filter((l) => l.data.startsWith(`${ano}-`));
      const [lotes, categorias, comunidades, dimensoes] = await Promise.all([listarBanco(ano), listarCategorias(), listarComunidades(), listarDimensoes()]);
      const cats = categoriasEmFalta(linhas, categorias);
      const res = aplicarClassificacaoTesouraria(lotes.flatMap((l) => l.registos), linhas, { categorias: [...categorias, ...cats], comunidades, quando: new Date().toLocaleDateString('pt-PT') });
      setPrevia({ linhas, ignoradas: ignoradas + (todas.length - linhas.length), lotes, res, cats, dims: dimensoesEmFalta(linhas, dimensoes) });
    } catch (e) { setMsg({ tipo: 'erro', texto: mensagemErro(e) }); } finally { setOcupado(false); }
  }

  async function aplicar() {
    if (!previa) return;
    setOcupado(true); setMsg(null);
    try {
      for (const c of previa.cats) await gravar('categorias', c);
      for (const d of previa.dims) await gravar('dimensoes', d);
      const porId = new Map(previa.res.alterados.map((m) => [m.id, m]));
      const agora = new Date().toISOString();
      let lotes = 0;
      for (const l of previa.lotes) {
        if (!l.registos.some((m) => porId.has(m.id))) continue;
        // Firestore não aceita undefined: os campos limpos saem do objeto.
        const registos = l.registos.map((m) => JSON.parse(JSON.stringify(porId.get(m.id) ?? m)));
        await gravarBancoLote({ ...l, registos, atualizadoEm: agora, atualizadoPor: acesso!.email });
        lotes++;
      }
      await auditar(acesso!.email, 'classificação da tesouraria', `${nome}: ${previa.res.alterados.length} movimentos propostos em ${lotes} extratos de ${ano}; criadas ${previa.cats.length} categorias e ${previa.dims.length} dimensões`);
      setMsg({ tipo: 'ok', texto: `${previa.res.alterados.length} movimentos ficaram propostos. Reveja-os por mês e use "Aceitar propostas" para os validar.` });
      setPrevia(null);
      onFeito();
    } catch (e) { setMsg({ tipo: 'erro', texto: mensagemErro(e) }); } finally { setOcupado(false); }
  }

  const n = (x: number, um: string, varios: string) => `${x} ${x === 1 ? um : varios}`;
  const dimsTxt = (t: Dimensao['tipo']) => previa?.dims.filter((d) => d.tipo === t).map((d) => (d.codigo ? `${d.codigo} ${d.nome}` : d.nome)).join(', ');
  return (
    <Modal titulo="Importar classificação da tesouraria" onFechar={onFechar}>
      <p className="small">Escolha o Excel da proposta de classificação (folha "Proposta"). Entram só as linhas de {ano} com confiança Alta ou Média e com comunidade. Os lotes IFTHENPAY, os depósitos e os reembolsos ficam de fora, porque o portal os concilia com o Jotform. Os movimentos já validados ou conciliados não mudam.</p>
      <label className="campo">Ficheiro<input type="file" accept=".xlsx" disabled={ocupado} onChange={(e) => { const f = e.target.files?.[0]; if (f) void escolher(f); }} /></label>
      {ocupado && !previa && <p className="small muted">A ler…</p>}
      {previa && <div className="card" style={{ marginTop: 10 }}>
        <p className="small" style={{ marginTop: 0 }}>{`${n(previa.linhas.length, 'linha', 'linhas')} da folha para ${ano} (${previa.ignoradas} ignoradas).`}</p>
        <ul className="small">
          <li><b>{n(previa.res.alterados.length, 'movimento fica proposto', 'movimentos ficam propostos')}</b> com categoria, comunidade e centro de custo.</li>
          <li>{n(previa.res.jaTratados, 'movimento já validado ou conciliado (não muda)', 'movimentos já validados ou conciliados (não mudam)')}.</li>
          <li>{n(previa.res.semPar, 'grupo de linhas sem movimento no portal', 'grupos de linhas sem movimento no portal')} (extratos ainda não carregados ou valores diferentes).</li>
          {previa.res.desconhecidas > 0 && <li>{n(previa.res.desconhecidas, 'grupo com comunidade desconhecida', 'grupos com comunidade desconhecida')} no portal.</li>}
        </ul>
        {(previa.cats.length > 0 || previa.dims.length > 0) && <>
          <p className="small"><b>A criar no portal:</b></p>
          <ul className="small">
            {previa.cats.length > 0 && <li>Categorias: {previa.cats.map((c) => c.nome).join(', ')}</li>}
            {dimsTxt('centro') && <li>Centros de custo: {dimsTxt('centro')}</li>}
            {dimsTxt('projeto') && <li>Projetos ou eventos: {dimsTxt('projeto')}</li>}
            {dimsTxt('fornecedor') && <li>Fornecedores: {dimsTxt('fornecedor')}</li>}
            {dimsTxt('conta') && <li>Contas analíticas: {dimsTxt('conta')}</li>}
          </ul>
        </>}
      </div>}
      {msg && <div className={msg.tipo === 'ok' ? 'ok-box' : 'aviso'} style={{ marginTop: 10 }}>{msg.texto}</div>}
      <div className="acoes" style={{ marginTop: 14 }}>
        <button disabled={ocupado || !previa || (!previa.res.alterados.length && !previa.dims.length && !previa.cats.length)} onClick={() => void aplicar()}>{ocupado && previa ? 'A gravar…' : 'Aplicar'}</button>
        <button className="sec" onClick={onFechar}>Fechar</button>
      </div>
    </Modal>
  );
}
