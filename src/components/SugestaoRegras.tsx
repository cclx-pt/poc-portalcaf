import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, mensagemErro, useCarregar } from './ui';
import { auditar, gravar, listarBanco, listarCategorias, listarComunidades, listarDimensoes, listarRegrasBanco } from '../lib/db';
import { eur, num } from '../lib/format';
import { regraDaSugestao, sugerirRegras, type RegraSugerida } from '../lib/sugestaoRegras';

const mesPt = (p: string) => `${p.slice(5, 7)}/${p.slice(0, 4)}`;

/**
 * Regras sugeridas a partir do histórico já consolidado (movimentos validados que se repetem em 3 meses ou mais,
 * sempre com a mesma classificação). As escolhidas ficam em Configuração › Regras dos extratos e passam a ser
 * usadas em "Propor classificação" na Reconciliação.
 */
export function SugestaoRegras({ anos, aoGuardar }: { anos: number[]; aoGuardar?: () => void }) {
  const { acesso } = useAuth();
  const dados = useCarregar(async () => {
    const [lotes, regras, categorias, comunidades, dims] = await Promise.all([
      Promise.all([...new Set(anos)].map((a) => listarBanco(a))).then((x) => x.flat()), listarRegrasBanco(), listarCategorias(), listarComunidades(), listarDimensoes(),
    ]);
    return { sugestoes: sugerirRegras(lotes.flatMap((l) => l.registos), regras, { categorias }), regras, comunidades, dims };
  }, [anos.join(',')]);
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  if (dados.aCarregar || dados.erro || !dados.dados) return <Estado aCarregar={dados.aCarregar || !dados.dados} erro={dados.erro} />;
  const { sugestoes, regras, comunidades, dims } = dados.dados!;
  const nomeCom = (id?: string) => (id ? comunidades.find((c) => c.id === id)?.nome ?? id : undefined);
  const nomeCC = (cod?: string) => (cod ? `${cod} ${dims.find((d) => d.tipo === 'centro' && d.codigo === cod)?.nome ?? ''}`.trim() : undefined);
  const escolhidas = sugestoes.filter((s) => !fora.has(s.id) && (textos[s.id] ?? s.padrao).trim());

  async function guardar() {
    setOcupado(true); setMsg(null);
    try {
      for (const s of escolhidas) {
        const padrao = (textos[s.id] ?? s.padrao).trim();
        const r: RegraSugerida = { ...s, padrao };
        await gravar('regras_banco', regraDaSugestao(r, regras.find((x) => x.id === s.id)));
      }
      await auditar(acesso!.email, 'regras dos extratos', `Guardadas ${escolhidas.length} regras sugeridas pelo histórico: ${escolhidas.map((s) => (textos[s.id] ?? s.padrao).trim()).join(', ')}`);
      setMsg({ tipo: 'ok', texto: `${escolhidas.length} regras guardadas em Configuração › Regras dos extratos. São usadas em "Propor classificação" na Reconciliação bancária.` });
      await dados.recarregar();
      setFora(new Set()); setTextos({});
      aoGuardar?.();
    } catch (e) { setMsg({ tipo: 'erro', texto: mensagemErro(e) }); } finally { setOcupado(false); }
  }

  return (
    <div className="sec card">
      <h2 style={{ marginTop: 0 }}>Regras sugeridas pelo histórico</h2>
      <p className="small">Movimentos já validados que se repetem em 3 meses ou mais, sempre com a mesma classificação ({anos.length > 1 ? `${Math.min(...anos)} e ${Math.max(...anos)}` : anos[0]}). Guardar uma regra faz com que os próximos extratos com esse texto fiquem logo propostos com esta classificação.</p>
      {msg && <div className={msg.tipo === 'ok' ? 'ok-box' : 'aviso'}>{msg.texto}</div>}
      {!sugestoes.length ? <p className="muted small">Sem regras novas a sugerir: as repetições do histórico já têm regra, ou ainda não há meses suficientes validados.</p> : <>
        <div className="tabela"><table>
          <thead><tr><th /><th>Texto no banco</th><th>Classificação</th><th className="num">Meses</th><th className="num">Valor médio</th><th>Regra</th></tr></thead>
          <tbody>{sugestoes.map((s) => (
            <tr key={s.id}>
              <td><input type="checkbox" aria-label={`Guardar a regra ${s.padrao}`} checked={!fora.has(s.id)} onChange={(e) => { const n = new Set(fora); if (e.target.checked) n.delete(s.id); else n.add(s.id); setFora(n); }} /></td>
              <td><input value={textos[s.id] ?? s.padrao} aria-label="Texto no descritivo do banco" style={{ minWidth: 140 }} onChange={(e) => setTextos({ ...textos, [s.id]: e.target.value })} /></td>
              <td className="small">{[s.categoria, nomeCom(s.comunidadeId), nomeCC(s.centroCusto), s.fornecedor, s.projeto].filter(Boolean).join(' · ')}{!s.centroCusto && <div className="neg">Sem centro de custo: as propostas desta regra não se validam sem o escolher.</div>}</td>
              <td className="num small" title={s.meses.map(mesPt).join(', ')}>{num(s.meses.length)}{s.mensal ? ' · todos os meses' : ''}</td>
              <td className="num">{eur(s.valorMedio)}</td>
              <td className="small">{s.acao === 'atualizar' ? 'Atualiza a regra existente' : 'Nova'}{s.concordancia < 1 ? ` · ${Math.round(s.concordancia * 100)}% iguais` : ''}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <div className="acoes" style={{ marginTop: 10 }}>
          <button disabled={ocupado || !escolhidas.length} onClick={() => void guardar()}>{ocupado ? 'A guardar…' : `Guardar ${escolhidas.length} regras`}</button>
        </div>
      </>}
    </div>
  );
}
