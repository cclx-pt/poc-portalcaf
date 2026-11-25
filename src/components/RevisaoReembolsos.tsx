import { useMemo, useState } from 'react';
import { auditar } from '../lib/db';
import { eur, MESES } from '../lib/format';
import {
  conciliarComSubmissoes, NOTA_REJEITADO, pendentesDeRevisao, reconciliarReembolsos, relatorioInverso,
  type ParametrosReembolsos, type ResultadoReembolso, type SubmissaoReembolso,
} from '../lib/reconciliacaoReembolsos';
import type { Categoria, Comunidade, MovBanco } from '../lib/types';

type Mov = MovBanco & { loteId: string };
const dataPt = (d: string) => d.split('-').reverse().join('/');
const hoje = () => new Date().toISOString().slice(0, 10);
const ORDEM: ResultadoReembolso['estado'][] = ['Confirmado', 'Provável', 'Agregado', 'Ambíguo', 'Sem submissão'];

/**
 * Tesouraria › Reconciliação bancária › Reembolsos MB Way: as saídas do mês por conciliar, cruzadas com o Registo de
 * Despesas pelas regras da especificação (Unique ID, telefone parcial, valor e data). O revisor confirma, troca ou rejeita;
 * cada decisão fica na auditoria e na nota do movimento (grava com "Guardar classificação").
 */
export function RevisaoReembolsos({ movs, subs, usados, parametros, categorias, comunidades, ano, mes, email, verPessoais, onAplicar, pessoasRef = [] }: {
  movs: Mov[]; subs: SubmissaoReembolso[]; usados: Set<string>; parametros: ParametrosReembolsos;
  categorias: Categoria[]; comunidades: Comunidade[]; ano: number; mes: number; email: string; verPessoais: boolean;
  onAplicar: (loteId: string, m: MovBanco) => void;
  /** Base de Pessoas (nome + telemóvel), para inferir o telefone de quem submeteu sem ele. */
  pessoasRef?: { nome: string; telefone?: string }[];
}) {
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const pendentes = useMemo(() => pendentesDeRevisao(movs), [movs]);
  const resultados = useMemo(() => reconciliarReembolsos(pendentes, subs, usados, parametros, pessoasRef), [pendentes, subs, usados, parametros, pessoasRef]);
  const porId = new Map(subs.map((s) => [s.id, s]));
  const movDe = new Map(pendentes.map((m) => [m.id, m]));
  const nomeCom = (id: string) => comunidades.find((c) => c.id === id)?.nome ?? id;
  const ordenados = [...resultados].sort((a, b) => ORDEM.indexOf(a.estado) - ORDEM.indexOf(b.estado) || movDe.get(a.movId)!.data.localeCompare(movDe.get(b.movId)!.data));
  const conta = (e: ResultadoReembolso['estado']) => resultados.filter((r) => r.estado === e).length;
  const de = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ate = `${ano}-${String(mes).padStart(2, '0')}-31`;
  const inverso = relatorioInverso(subs, resultados, { de, ate }, usados);

  /** Submissões a aplicar: a escolhida na lista (troca) ou as propostas pelo motor. */
  const aplicar = (r: ResultadoReembolso) => {
    const troca = escolha[r.movId];
    return (troca ? [troca] : r.submissoes).map((id) => porId.get(id)).filter(Boolean) as SubmissaoReembolso[];
  };
  async function confirmar(r: ResultadoReembolso) {
    const m = movDe.get(r.movId)!;
    const ss = aplicar(r);
    if (!ss.length) return;
    const troca = !!escolha[r.movId] && escolha[r.movId] !== r.submissoes[0];
    const score = troca ? r.candidatos.find((c) => c.id === escolha[r.movId])?.score ?? r.score : r.score;
    const estado = troca ? 'Provável' : r.estado;
    onAplicar(m.loteId, conciliarComSubmissoes(m, ss, categorias, { estado, regra: r.regra, score }, email, hoje()));
    await auditar(email, 'revisão de reembolsos', `${dataPt(m.data)} ${m.descricao} ${eur(-m.valor)} → ${ss.map((s) => s.codigo ?? s.id).join(' + ')} (${troca ? 'trocado' : 'confirmado'}; regra ${r.regra ?? '—'}, ${estado}, score ${score})`);
  }
  async function confirmarTodos() {
    for (const r of resultados.filter((x) => x.estado === 'Confirmado')) await confirmar(r);
  }
  async function rejeitar(r: ResultadoReembolso) {
    const m = movDe.get(r.movId)!;
    onAplicar(m.loteId, { ...m, estado: 'rever', nota: `${NOTA_REJEITADO} por ${email} em ${dataPt(hoje())}: classificar à mão${r.observacoes.length ? ` (${r.observacoes.join('; ')})` : ''}` });
    await auditar(email, 'revisão de reembolsos', `${dataPt(m.data)} ${m.descricao} ${eur(-m.valor)} → rejeitado (${r.estado}${r.candidatos.length ? `; candidatos ${r.candidatos.map((c) => `${porId.get(c.id)?.codigo ?? c.id} ${c.score}`).join(', ')}` : ''})`);
  }
  const textoSub = (s?: SubmissaoReembolso) => (s ? `${s.codigo ?? s.id} · ${verPessoais && s.pessoa ? `${s.pessoa} · ` : ''}${nomeCom(s.comunidadeId)} · ${eur(s.valor)} · ${dataPt(s.submetido)}` : '—');

  return (
    <div className="sec">
      <p className="muted small">
        {`Saídas de ${MESES[mes - 1]} ${ano} por conciliar com MB Way, transferência ou "Reembolso" no descritivo, cruzadas com o Registo de Despesas: Unique ID, telefone parcial, valor e data (janela de ${parametros.diasAntes} dias antes a ${parametros.diasDepois} dias depois da submissão). `}
        Confirme, troque ou rejeite; as decisões ficam na auditoria e gravam com &quot;Guardar classificação&quot;.
      </p>
      <div className="acoes">
        <span className="small">{ORDEM.map((e) => `${e}: ${conta(e)}`).join(' · ')}</span>
        <button disabled={!conta('Confirmado')} onClick={() => void confirmarTodos()}>{`Aplicar os confirmados (${conta('Confirmado')})`}</button>
      </div>
      <div className="tabela"><table>
        <thead><tr><th>Data</th><th>Descrição</th><th>MB Way</th><th className="num">Valor</th><th>Estado</th><th className="num">Score</th><th>Regra</th><th>Submissão</th><th>Observações</th><th /></tr></thead>
        <tbody>
          {ordenados.map((r) => {
            const m = movDe.get(r.movId)!;
            const alternativas = r.candidatos.filter((c) => !r.submissoes.includes(c.id));
            const podeConfirmar = aplicar(r).length > 0;
            return (
              <tr key={r.movId}>
                <td>{dataPt(m.data)}</td>
                <td className="small">{m.descricao}</td>
                <td className="small">{r.mbway ?? '—'}</td>
                <td className="num">{eur(-m.valor)}</td>
                <td><span className={`etiqueta${r.estado === 'Confirmado' ? ' preta' : r.estado === 'Sem submissão' || r.estado === 'Ambíguo' ? ' neg' : ''}`}>{r.estado}</span></td>
                <td className="num">{r.estado === 'Sem submissão' ? '—' : r.score}</td>
                <td>{r.regra ?? '—'}</td>
                <td className="small">
                  {r.submissoes.length ? r.submissoes.map((id) => <div key={id}>{textoSub(porId.get(id))}</div>) : <span className="muted">—</span>}
                  {alternativas.length > 0 && (
                    <select aria-label="Trocar por outro candidato" value={escolha[r.movId] ?? ''} onChange={(e) => setEscolha({ ...escolha, [r.movId]: e.target.value })} style={{ marginTop: 4, maxWidth: 280 }}>
                      <option value="">{r.submissoes.length ? 'Trocar por…' : 'Escolher candidato…'}</option>
                      {alternativas.map((c) => <option key={c.id} value={c.id}>{`${textoSub(porId.get(c.id))} · score ${c.score}`}</option>)}
                    </select>
                  )}
                </td>
                <td className="small">{r.observacoes.join('; ') || '—'}</td>
                <td>
                  <div className="acoes" style={{ margin: 0, flexWrap: 'nowrap' }}>
                    <button className="sec" disabled={!podeConfirmar} onClick={() => void confirmar(r)}>{escolha[r.movId] ? 'Trocar' : 'Confirmar'}</button>
                    <button className="link" onClick={() => void rejeitar(r)}>Rejeitar</button>
                  </div>
                </td>
              </tr>
            );
          })}
          {!ordenados.length && <tr><td colSpan={10} className="muted">Sem saídas de reembolso por conciliar neste mês.</td></tr>}
        </tbody>
      </table></div>

      <h2 style={{ marginTop: 18 }}>{`Relatório inverso · ${MESES[mes - 1]} ${ano}`}</h2>
      <p className="muted small">Reembolsos fechados no Jotform, pagos por MB Way e submetidos neste mês, que não estão associados a nenhum movimento do extrato.</p>
      <div className="tabela"><table>
        <thead><tr><th>Submissão</th><th>Data de submissão</th>{verPessoais && <th>Nome</th>}<th>Comunidade</th><th className="num">Valor</th></tr></thead>
        <tbody>
          {inverso.map((s) => <tr key={s.id}><td>{s.codigo ?? s.id}</td><td>{dataPt(s.submetido)}</td>{verPessoais && <td>{s.pessoa ?? '—'}</td>}<td>{nomeCom(s.comunidadeId)}</td><td className="num">{eur(s.valor)}</td></tr>)}
          {!inverso.length && <tr><td colSpan={verPessoais ? 5 : 4} className="muted">Todos os reembolsos fechados deste mês têm saída no extrato.</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}
