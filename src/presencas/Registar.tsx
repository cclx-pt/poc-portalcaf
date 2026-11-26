import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, Grid2x2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { dataPT, hoje, num } from '../lib/format';
import { armazemLocal, lerRascunhos } from '../lib/rascunhos';
import { descreverQuando } from '../lib/eventos';
import type { EntradaPresenca } from '../lib/presencas';
import type { Comunidade, Lote } from '../lib/types';
import { useRegistoPresenca, type Contagem, type RegistoPresenca } from './useRegistoPresenca';
import { EstadoPz, Mensagem, corDe, hora, usePz } from './ui';

/** Ecrã Registar: novo registo (vindo do início, dos registos em falta ou de um rascunho). */
export function Registar() {
  const { acesso } = useAuth();
  const { comunidades, comunidade, lotes, recarregar, aCarregar, erro } = usePz();
  const [params] = useSearchParams();
  const rascunho = params.get('rascunho');
  const doRascunho = rascunho ? lerRascunhos(armazemLocal(), acesso?.email ?? '').find((r) => r.id === rascunho)?.entrada : undefined;
  const doLink = Object.fromEntries(Object.entries({ data: params.get('data'), comunidadeId: params.get('comunidade'), evento: params.get('evento') }).filter(([, v]) => v)) as Partial<EntradaPresenca>;
  const inicial: Partial<EntradaPresenca> = doRascunho ?? (Object.keys(doLink).length ? doLink : comunidade !== 'todas' ? { comunidadeId: comunidade } : {});
  if (aCarregar && !lotes.length) return <EstadoPz aCarregar erro={erro} />;
  return <FormularioPz key={params.toString()} comunidades={comunidades} lotes={lotes} inicial={inicial} aposGravar={recarregar} />;
}

/** Formulário da app (novo registo ou correção), com o contador em ecrã inteiro e a confirmação depois de gravar. */
export function FormularioPz({ comunidades, lotes, inicial, aposGravar, edicao, aoFechar }: {
  comunidades: Comunidade[]; lotes: Lote[]; inicial?: Partial<EntradaPresenca>; aposGravar: () => Promise<void>;
  edicao?: { lote: Lote; registoId: string }; aoFechar?: () => void;
}) {
  const ir = useNavigate();
  const f = useRegistoPresenca({ comunidades, lotes, aposGravar, edicao, aoFechar, inicial });
  const { e, setE, config, recolhe, nomes, opcoesNomes, opcoes, evSel, eOutra, raiz, campoErro, erroEm, msg, aGuardar, guardar, sucesso, setSucesso, contador, setContador, comRascunho, guardadoEm, valorDe, mudar, total, limpar, unica, original } = f;
  const pronto = !!e.data && !!e.evento && !!e.comunidadeId;
  // Erro no evento ou na comunidade (botões, não campos): o foco vai para a primeira opção.
  useEffect(() => {
    if (campoErro !== 'evento' && campoErro !== 'comunidade') return;
    raiz.current?.querySelector<HTMLElement>('.pz-chips.pz-com-erro .pz-chip')?.focus();
  }, [msg, campoErro, raiz]);
  const cls = (campo: string, base = 'pz-campo') => [base, erroEm(campo) ? 'pz-com-erro' : ''].filter(Boolean).join(' ');

  if (config.aCarregar) return <EstadoPz aCarregar erro={null} />;
  if (sucesso) {
    const t = sucesso.contagens.reduce((s, c) => { const v = c.id in sucesso.entrada ? (sucesso.entrada as unknown as Record<string, number>)[c.id] : sucesso.entrada.outras?.[c.id]; return s + (v == null || Number.isNaN(v) ? 0 : v); }, 0);
    return (
      <div className="pz-sucesso" role="status">
        <div className="pz-sucesso-ico"><Check size={40} strokeWidth={3} aria-hidden /></div>
        <h1>Registo guardado!</h1>
        <b className="pz-grande">{num(t)}</b>
        <p className="pz-muted">Pessoas presentes</p>
        <p style={{ fontWeight: 600 }}>{dataPT(sucesso.entrada.data)} · {sucesso.comunidade}</p>
        <p className="pz-muted">{sucesso.entrada.evento}{sucesso.entrada.descricao?.trim() ? ` · ${sucesso.entrada.descricao.trim()}` : ''}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: 16 }}>
          <button className="pz-btn prim bloco" onClick={() => setSucesso(null)}>Novo registo</button>
          <button className="pz-btn claro bloco" onClick={() => ir('/presencas')}>Voltar ao início</button>
        </div>
      </div>
    );
  }

  return (
    <div ref={raiz} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1>{edicao ? 'Corrigir registo' : 'Novo registo'}</h1>
      {msg && <Mensagem tipo={msg.tipo === 'ok' ? 'ok' : 'erro'}>{msg.texto}</Mensagem>}
      {original?.extra?.alteradoEm && <p className="pz-meta">Última alteração: {dataPT(String(original.extra.alteradoEm).slice(0, 10))} · {String(original.extra.alteradoPor ?? '')}</p>}

      <label className={cls('data')}>Data do evento{edicao ? ' (no mesmo mês)' : ''}
        <input type="date" value={e.data} max={hoje()} aria-invalid={campoErro === 'data' || undefined} onChange={(ev) => setE({ ...e, data: ev.target.value })} />
      </label>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="pz-campo">
        <legend style={{ padding: 0, marginBottom: 6 }}>Evento</legend>
        {opcoesNomes.length > 0
          ? <div className={['pz-chips', erroEm('evento') ? 'pz-com-erro' : ''].join(' ')} data-campo="evento">
            {opcoesNomes.map((x) => <button type="button" key={x} className="pz-chip" aria-pressed={e.evento === x} onClick={() => setE({ ...e, evento: x })}>{x}</button>)}
          </div>
          : <p className="pz-ajuda">{e.data ? 'Nenhum evento ocorre neste dia da semana. Escolha outra data.' : 'Escolha primeiro a data.'}</p>}
        {evSel && <span className="pz-ajuda">{evSel.descricao ? `${evSel.descricao} · ` : ''}{descreverQuando(evSel)}</span>}
        {!opcoes.length && e.evento && <span className="pz-ajuda">Evento que já não está na configuração: mantém-se.</span>}
      </fieldset>

      {eOutra && <label className={cls('descricao')}>Descrição<input value={e.descricao ?? ''} aria-invalid={campoErro === 'descricao' || undefined} onChange={(ev) => setE({ ...e, descricao: ev.target.value })} /></label>}

      {unica || edicao
        ? <p className="pz-muted">Comunidade: <b style={{ color: 'var(--pz-texto)' }}>{nomes.get(e.comunidadeId) ?? e.comunidadeId}</b></p>
        : (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="pz-campo">
            <legend style={{ padding: 0, marginBottom: 6 }}>Comunidade</legend>
            <div className={['pz-chips', erroEm('comunidade') ? 'pz-com-erro' : ''].join(' ')}>
              {comunidades.map((c) => <button type="button" key={c.id} className="pz-chip" aria-pressed={e.comunidadeId === c.id} onClick={() => setE({ ...e, comunidadeId: c.id })}>{c.nome}</button>)}
            </div>
          </fieldset>
        )}

      <div className="pz-secao">
        <h2>Presenças</h2>
        <button type="button" className="pz-btn claro" style={{ minHeight: 44 }} disabled={!pronto} onClick={() => setContador(true)} title={pronto ? undefined : 'Escolha a data, o evento e a comunidade'}>
          <Grid2x2 size={18} aria-hidden /> Abrir contador
        </button>
      </div>
      {!pronto && <p className="pz-ajuda pz-muted pz-peq" style={{ marginTop: -8 }}>Para abrir o contador, escolha a data, o evento e a comunidade.</p>}
      <div className="pz-contagens">
        {recolhe.map((c) => (
          <div key={c.id} className={`pz-contagem pz-cor-${corDe(c.id)}${erroEm(c.id) ? ' pz-com-erro' : ''}`}>
            <label htmlFor={`pz-n-${c.id}`}>{c.nome}</label>
            <input id={`pz-n-${c.id}`} type="number" inputMode="numeric" min={0} step={1} placeholder="0" aria-invalid={campoErro === c.id || undefined}
              value={Number.isNaN(valorDe(c.id)) ? '' : valorDe(c.id)} onChange={(ev) => mudar(c.id, ev.target.value)} />
          </div>
        ))}
      </div>

      <label className="pz-campo">Observações (opcional)<textarea value={e.observacoes ?? ''} onChange={(ev) => setE({ ...e, observacoes: ev.target.value })} /></label>
      <div className="pz-total"><span>Total</span><b aria-live="polite">{num(total)} pessoas</b></div>
      {comRascunho && <p className="pz-meta">Rascunho guardado neste dispositivo{guardadoEm ? ` às ${hora(guardadoEm)}` : ''}. Só fica registado ao guardar.</p>}
      <p className="pz-meta">As contagens em branco gravam-se como 0.{edicao ? ' A correção fica registada na auditoria (o quê, quem e quando). O Jotform não é alterado.' : ''}</p>

      <div className="pz-acoes-fixas">
        <button className="pz-btn escuro bloco" disabled={aGuardar} onClick={() => void guardar()}>{aGuardar ? 'A guardar…' : edicao ? 'Guardar correção' : 'Guardar registo'}</button>
        {edicao && <button className="pz-btn claro bloco" onClick={aoFechar}>Cancelar</button>}
      </div>
      {!edicao && comRascunho && <button className="pz-link" style={{ alignSelf: 'center', color: 'var(--pz-erro)' }} onClick={limpar}>Limpar e descartar o rascunho</button>}

      {contador && <ContadorPz f={f} contexto={`${dataPT(e.data)} · ${e.evento} · ${nomes.get(e.comunidadeId) ?? ''}`} />}
    </div>
  );
}

/** Contador em quadrantes: tocar no cartão soma 1; − e + explícitos; o rascunho grava-se a cada toque. */
function ContadorPz({ f, contexto }: { f: RegistoPresenca; contexto: string }) {
  const { recolhe, valorDe, somar, setContador, total, comRascunho, guardadoEm, edicao } = { ...f, edicao: !!f.original };
  const v = (id: string) => { const x = valorDe(id); return Number.isNaN(x) ? 0 : x; };
  const toque = (c: Contagem, d: number) => {
    if (d < 0 && v(c.id) <= 0) return;
    somar(c.id, d);
    try { navigator.vibrate?.(d > 0 ? 12 : [8, 30, 8]); } catch { /* sem vibração */ }
  };
  const zerar = () => {
    if (!confirm('Pôr todas as contagens a zero?')) return;
    for (const c of recolhe) f.mudar(c.id, '');
  };
  return (
    <div className="pz-contador" role="dialog" aria-modal="true" aria-label="Contador">
      <div className="pz-contador-topo">
        <button className="pz-link" onClick={() => setContador(false)} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}><ChevronLeft size={22} aria-hidden /> Registo</button>
        <h2>Contador</h2>
        <button className="pz-link" onClick={zerar} disabled={!total}>Limpar</button>
      </div>
      <p className="pz-meta">{contexto}</p>
      <div className="pz-contador-total"><span className="pz-muted">Total de pessoas</span><b aria-live="polite">{num(total)}</b></div>
      <div className={`pz-grelha n${Math.min(recolhe.length, 6)}`}>
        {recolhe.map((c) => (
          <div key={c.id} className={`pz-tile pz-cor-${corDe(c.id)}`}>
            <button type="button" className="pz-tile-toque" aria-label={`${c.nome}: ${v(c.id)}. Tocar no cartão para somar 1`} onClick={() => toque(c, 1)} />
            <span className="pz-tile-nome" aria-hidden>{c.nome}</span>
            <span className="pz-tile-valor" aria-hidden>{num(v(c.id))}</span>
            <span className="pz-tile-dica" aria-hidden>Toque para +1</span>
            <div className="pz-tile-botoes">
              <button type="button" aria-label={`Menos 1 em ${c.nome}`} disabled={v(c.id) <= 0} onClick={() => toque(c, -1)}>−</button>
              <button type="button" aria-label={`Mais 1 em ${c.nome}`} onClick={() => toque(c, 1)}>+</button>
            </div>
          </div>
        ))}
      </div>
      <div className="pz-contador-fundo">
        <p className="pz-meta" role="status">{edicao ? 'Correção: só fica gravada ao guardar.' : comRascunho ? `Rascunho guardado neste dispositivo${guardadoEm ? ` às ${hora(guardadoEm)}` : ''}` : 'O rascunho guarda-se a cada toque.'}</p>
        <button className="pz-btn escuro bloco" onClick={() => setContador(false)}>Rever e guardar</button>
      </div>
    </div>
  );
}
