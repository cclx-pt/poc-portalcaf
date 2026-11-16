import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, mensagemErro, useCarregar } from '../components/ui';
import { auditar, gravarLote, lerConfigAssistencia, lerLote, listarComunidades, listarLotes } from '../lib/db';
import { hoje, norm, num } from '../lib/format';
import { EVENTOS_INICIAIS, acrescentarRegisto, eRegistoDoPortal, novoRegistoPresenca, removerRegisto, validarPresenca, type EntradaPresenca } from '../lib/presencas';
import { recalcularAno } from '../lib/recalcular';
import type { Lote } from '../lib/types';

const dataPt = (d: string) => d.split('-').reverse().join('/');
const vazio = (comunidadeId = ''): EntradaPresenca => ({ data: hoje(), evento: '', descricao: '', comunidadeId, adultos: 0, jump: 0, criancas: 0, connects: 0, observacoes: '' });

/** Registo de presenças no portal, equivalente ao formulário Jotform "CCLX : Registo de Presenças". Só grava no portal. */
export default function RegistarPresencas() {
  const { acesso } = useAuth();
  const config = useCarregar(lerConfigAssistencia, []);
  const coms = useCarregar(listarComunidades, []);
  const [e, setE] = useState<EntradaPresenca>(vazio());
  const anoData = Number(e.data.slice(0, 4)) || new Date().getFullYear();
  const lotes = useCarregar(() => listarLotes(acesso!, 'assistencia', anoData, false), [anoData, acesso?.email]);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [aGuardar, setAGuardar] = useState(false);

  const eventos = config.dados?.eventos?.length ? config.dados.eventos : EVENTOS_INICIAIS;
  const comunidades = (coms.dados ?? []).filter((c) => !c.especial && c.ativo !== false);
  const nomes = new Map(comunidades.map((c) => [c.id, c.nome]));
  const eOutra = norm(e.evento) === 'outra';
  const n = (k: keyof EntradaPresenca) => (v: string) => setE({ ...e, [k]: v === '' ? NaN : Number(v) });

  async function guardar() {
    setMsg(null);
    const erro = validarPresenca(e, hoje(), lotes.dados ?? []);
    if (erro) { setMsg({ tipo: 'erro', texto: erro }); return; }
    setAGuardar(true);
    try {
      const r = novoRegistoPresenca(e, acesso!.email);
      const id = `assistencia_${e.data.slice(0, 4)}_${e.data.slice(5, 7)}_${e.comunidadeId}`;
      const lote = acrescentarRegisto((await lerLote(id)) ?? undefined, r, acesso!.email, e.comunidadeId);
      await gravarLote(lote);
      await auditar(acesso!.email, 'registar presenças', `${e.data} · ${e.evento}${e.descricao ? ` (${e.descricao})` : ''} · ${nomes.get(e.comunidadeId) ?? e.comunidadeId} · ${e.adultos} jovens e adultos`);
      await recalcularAno(acesso!, Number(e.data.slice(0, 4)));
      setMsg({ tipo: 'ok', texto: `Registo guardado: ${e.evento} em ${dataPt(e.data)}, ${nomes.get(e.comunidadeId) ?? e.comunidadeId}. Resumos recalculados.` });
      setE(vazio(e.comunidadeId));
      await lotes.recarregar();
    } catch (err) { setMsg({ tipo: 'erro', texto: mensagemErro(err) }); }
    finally { setAGuardar(false); }
  }

  async function apagar(l: Lote, rid: string) {
    const r = l.registos.find((x) => x.id === rid)!;
    if (!confirm(`Apagar o registo de ${r.evento} em ${dataPt(r.data)} (${nomes.get(l.comunidadeId) ?? l.comunidadeId})?`)) return;
    try {
      await gravarLote(removerRegisto(l, rid));
      await auditar(acesso!.email, 'apagar registo de presenças', `${r.data} · ${r.evento} · ${l.comunidadeId}`);
      await recalcularAno(acesso!, l.ano);
      await lotes.recarregar();
    } catch (err) { setMsg({ tipo: 'erro', texto: mensagemErro(err) }); }
  }

  const doPortal = (lotes.dados ?? []).flatMap((l) => l.registos.filter(eRegistoDoPortal).map((r) => ({ l, r }))).sort((a, b) => b.r.data.localeCompare(a.r.data)).slice(0, 30);
  const campoNum = (rot: string, k: 'adultos' | 'jump' | 'criancas' | 'connects') => (
    <label className="campo">{rot} *<input type="number" inputMode="numeric" min={0} step={1} value={Number.isNaN(e[k]) ? '' : e[k]} onChange={(ev) => n(k)(ev.target.value)} style={{ width: 110 }} /></label>
  );

  return (
    <>
      <h1>Registar presenças</h1>
      <p className="muted">Equivalente ao formulário CCLX : Registo de Presenças. Grava só no portal (o Jotform não é alterado) e entra de imediato no mapa de presenças, nas médias e nos domingos em falta.</p>
      <Estado aCarregar={config.aCarregar || coms.aCarregar} erro={config.erro || coms.erro} />
      {!config.aCarregar && !coms.aCarregar && (
        <div className="card sec" style={{ maxWidth: 760 }}>
          {msg && <div className={msg.tipo === 'ok' ? 'ok-box' : 'aviso'}>{msg.texto}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <label className="campo">Data do evento *<input type="date" value={e.data} max={hoje()} onChange={(ev) => setE({ ...e, data: ev.target.value })} /></label>
            <label className="campo">Evento *
              <select value={e.evento} onChange={(ev) => setE({ ...e, evento: ev.target.value })}>
                <option value="">Escolha…</option>
                {eventos.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            {eOutra && <label className="campo">Descrição *<input value={e.descricao ?? ''} onChange={(ev) => setE({ ...e, descricao: ev.target.value })} /></label>}
            <label className="campo">Comunidade *
              <select value={e.comunidadeId} onChange={(ev) => setE({ ...e, comunidadeId: ev.target.value })}>
                <option value="">Escolha…</option>
                {comunidades.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          </div>
          <div className="linha" style={{ marginTop: 12 }}>
            {campoNum('Jovens e adultos', 'adultos')}
            {campoNum('Jump (12-14)', 'jump')}
            {campoNum('Crianças (3-11)', 'criancas')}
            {campoNum("Connect's (antigos VIP's)", 'connects')}
          </div>
          <label className="campo" style={{ marginTop: 12 }}>Observações<textarea rows={2} value={e.observacoes ?? ''} onChange={(ev) => setE({ ...e, observacoes: ev.target.value })} /></label>
          <div className="acoes" style={{ marginTop: 14 }}>
            <button onClick={() => void guardar()} disabled={aGuardar}>{aGuardar ? 'A guardar…' : 'Guardar registo'}</button>
            <button className="sec" onClick={() => { setE(vazio(e.comunidadeId)); setMsg(null); }}>Limpar</button>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>Campos com * são obrigatórios. Os tipos de evento configuram-se em Configuração → Assistência.</p>
        </div>
      )}

      <div className="sec">
        <h2>Registos feitos no portal em {anoData}</h2>
        {doPortal.length ? (
          <div className="tabela"><table>
            <thead><tr><th>Data</th><th>Evento</th><th>Comunidade</th><th className="num">Jovens e adultos</th><th className="num">Jump</th><th className="num">Crianças</th><th className="num">Connect's</th><th>Registado por</th><th /></tr></thead>
            <tbody>{doPortal.map(({ l, r }) => (
              <tr key={r.id}>
                <td>{dataPt(r.data)}</td><td>{r.evento}{r.descricao ? ` · ${r.descricao}` : ''}</td><td>{nomes.get(l.comunidadeId) ?? l.comunidadeId}</td>
                <td className="num">{num(r.valor)}</td><td className="num">{num(Number(r.extra?.jump ?? 0))}</td><td className="num">{num(Number(r.extra?.criancas ?? 0))}</td><td className="num">{num(Number(r.extra?.connects ?? 0))}</td>
                <td className="small muted">{String(r.extra?.registadoPor ?? '')}</td>
                <td><button className="link" onClick={() => void apagar(l, r.id)}>Apagar</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="muted">Ainda não há registos feitos no portal em {anoData}. Os registos do Jotform aparecem em Presenças por evento.</p>}
      </div>
    </>
  );
}
