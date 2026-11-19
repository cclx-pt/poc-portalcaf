import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { CampoData, Estado, Modal, mensagemErro, useCarregar, useFiltros } from '../components/ui';
import { auditar, gravarConfigAssistencia, lerConfigAssistencia, listarLotes } from '../lib/db';
import { auditoriaEventos } from '../lib/presencas';
import { eventoObrigatorio } from '../lib/domingos';
import { DIAS_SEMANA, IDS_BASE, catalogoContagens, descreverQuando, eventosEfetivos, validarEvento, type Contagem, type EventoConfig } from '../lib/eventos';
import { dataPT, norm, num, slug } from '../lib/format';

const novoEvento = (): EventoConfig => ({ id: '', nome: '', descricao: '', ativo: true, contagens: ['adultos'], dias: [], horario: { diaTodo: true } });

/**
 * Configuração dos eventos do registo de presenças (Configuração → Assistência), ao estilo Church Metrics:
 * nome, descrição, contagens a recolher, dias da semana e horário. Só o Master altera.
 */
export default function ConfigEventos() {
  const { acesso } = useAuth();
  const config = useCarregar(lerConfigAssistencia, []);
  const [edit, setEdit] = useState<EventoConfig | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [novaContagem, setNovaContagem] = useState('');
  const master = acesso?.papel === 'master';
  const { ano } = useFiltros();
  // Auditoria: registos de cada evento no ano do filtro (todas as comunidades a que tem acesso).
  const lotes = useCarregar(() => listarLotes(acesso!, 'assistencia', ano, false), [ano, acesso?.email]);

  if (config.aCarregar || config.erro) return <Estado aCarregar={config.aCarregar} erro={config.erro} />;
  const cfg = config.dados ?? { eventoCelebracao: null };
  const eventos = eventosEfetivos(cfg);
  const catalogo = catalogoContagens(cfg);
  const nomeContagem = (id: string) => catalogo.find((c) => c.id === id)?.nome ?? id;
  const extra = catalogo.filter((c) => !IDS_BASE.includes(c.id));

  async function gravar(lista: EventoConfig[], contagens: Contagem[], detalhe: string, celebracao = cfg.eventoCelebracao) {
    await gravarConfigAssistencia({
      ...cfg, eventoCelebracao: celebracao, eventosConfig: lista, contagens,
      eventos: lista.filter((x) => x.ativo).map((x) => x.nome), // compatibilidade com a lista antiga
      atualizadoPor: acesso!.email, atualizadoEm: new Date().toISOString(),
    });
    await auditar(acesso!.email, 'eventos de presenças', detalhe);
    await config.recarregar();
  }

  async function guardarEvento() {
    if (!edit) return;
    setErro(null);
    const ev: EventoConfig = {
      ...edit, nome: edit.nome.trim(), descricao: edit.descricao?.trim() || undefined,
      id: edit.id || slug(edit.nome) || `evento-${Date.now().toString(36)}`,
      dias: [...edit.dias].sort((a, b) => a - b),
      // A ordem das contagens é a ordem das perguntas no formulário de registo.
      contagens: edit.contagens.filter((id) => catalogo.some((c) => c.id === id)),
    };
    if (!ev.descricao) delete ev.descricao;
    const e = validarEvento(ev, eventos);
    if (e) { setErro(e); return; }
    const antigo = eventos.find((x) => x.id === edit.id);
    const lista = antigo ? eventos.map((x) => (x.id === antigo.id ? ev : x)) : [...eventos, ev];
    // Renomear o evento da celebração mantém-no como celebração.
    const celebracao = antigo && cfg.eventoCelebracao && norm(antigo.nome) === norm(cfg.eventoCelebracao) ? ev.nome : cfg.eventoCelebracao;
    try {
      await gravar(lista, extra, `${antigo ? 'alterado' : 'novo'}: ${ev.nome}${antigo && antigo.nome !== ev.nome ? ` (antes "${antigo.nome}")` : ''} · ${descreverQuando(ev)} · ${ev.contagens.map(nomeContagem).join(', ')}${ev.ativo ? '' : ' · inativo'}`, celebracao);
      setEdit(null);
      setMsg(`Evento "${ev.nome}" guardado.`);
    } catch (err) { setErro(mensagemErro(err)); }
  }

  async function acrescentarContagem() {
    const nome = novaContagem.trim();
    const id = slug(nome);
    if (!nome || !id) return;
    if (catalogo.some((c) => c.id === id || norm(c.nome) === norm(nome))) { setMsg(`Já existe a contagem "${nome}".`); return; }
    try { await gravar(eventos, [...extra, { id, nome }], `nova contagem: ${nome}`); setNovaContagem(''); setMsg(`Contagem "${nome}" acrescentada. Escolha em que eventos se recolhe.`); }
    catch (err) { setMsg(mensagemErro(err)); }
  }

  async function removerContagem(c: Contagem) {
    const usados = eventos.filter((e) => e.contagens.includes(c.id)).map((e) => e.nome);
    if (usados.length) { setMsg(`"${c.nome}" está em uso em: ${usados.join(', ')}. Retire-a primeiro desses eventos.`); return; }
    if (!confirm(`Remover a contagem "${c.nome}"? Os registos já feitos não mudam.`)) return;
    try { await gravar(eventos, extra.filter((x) => x.id !== c.id), `contagem removida: ${c.nome}`); }
    catch (err) { setMsg(mensagemErro(err)); }
  }

  async function apagarEvento(e: EventoConfig) {
    const a = auditoria[e.id];
    if (cfg.eventoCelebracao && norm(cfg.eventoCelebracao) === norm(e.nome)) { setMsg(`"${e.nome}" é o evento da celebração de domingo: escolha outro na Assistência antes de o apagar.`); return; }
    if (!confirm(`Apagar o evento "${e.nome}"?${a?.registos ? ` Há ${a.registos} registos com este evento em ${ano}: continuam guardados e nos mapas, mas o evento deixa de aparecer no formulário.` : ''} Pode, em alternativa, desativá-lo.`)) return;
    try { await gravar(eventos.filter((x) => x.id !== e.id), extra, `apagado: ${e.nome}${a?.registos ? ` (${a.registos} registos em ${ano} mantidos)` : ''}`); setMsg(`Evento "${e.nome}" apagado.`); }
    catch (err) { setMsg(mensagemErro(err)); }
  }
  const auditoria = auditoriaEventos(eventos, lotes.dados ?? []);
  const mover = (i: number, d: -1 | 1) => {
    if (!edit) return;
    const c = [...edit.contagens]; const j = i + d;
    if (j < 0 || j >= c.length) return;
    [c[i], c[j]] = [c[j], c[i]];
    setEdit({ ...edit, contagens: c });
  };

  // Campo com erro (validarEvento): destacado a amarelo; a janela põe lá o cursor.
  const erroEm = (c: 'nome' | 'contagens' | 'dias' | 'inicio' | 'fim') => {
    const t = norm(erro ?? '');
    const k = /nome|ja existe/.test(t) ? 'nome' : /contagem/.test(t) ? 'contagens' : /dias/.test(t) ? 'dias' : /fim/.test(t) ? 'fim' : /inicio/.test(t) ? 'inicio' : null;
    return k === c ? 'com-erro' : '';
  };
  const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  return (
    <div className="sec card">
      <h2>Eventos do registo de presenças</h2>
      <p className="small">{`A coluna "Registos em ${ano}" audita se o evento tem contagens introduzidas (ano do filtro do topo, Jotform e portal) e quantos registos têm cada contagem preenchida.`} Para cada evento: o que se recolhe, em que dias da semana ocorre e o horário. O formulário de registo só mostra os eventos que ocorrem no dia escolhido e só as contagens desse evento. Mudar o nome de um evento não altera os registos já feitos.</p>
      {msg && <p className="small">{msg}</p>}
      <div className="tabela"><table>
        <thead><tr><th>Evento</th><th>Quando</th><th>Contagens (pela ordem do formulário)</th><th>{`Registos em ${ano}`}</th><th>Estado</th>{master && <th />}</tr></thead>
        <tbody>{eventos.map((e) => (
          <tr key={e.id}>
            <td><b>{e.nome}</b>{e.descricao && <div className="small muted">{e.descricao}</div>}</td>
            <td>{descreverQuando(e)}</td>
            <td className="small">{e.contagens.map(nomeContagem).join(', ')}</td>
            <td className="small">{lotes.aCarregar ? '…' : (() => {
              const a = auditoria[e.id];
              if (!a?.registos) return <span className="neg">Sem contagens introduzidas</span>;
              const vazias = e.contagens.filter((id) => !a.porContagem[id]);
              return <>
                <b>{num(a.registos)}</b> registos · último {dataPT(a.ultimo!)}
                <div className="muted">{e.contagens.map((id) => `${nomeContagem(id)}: ${num(a.porContagem[id] ?? 0)}`).join(' · ')}</div>
                {!!vazias.length && <div className="neg">Nunca preenchido: {vazias.map(nomeContagem).join(', ')}</div>}
              </>;
            })()}</td>
            <td className="small">{e.ativo ? 'Ativo' : 'Inativo'}{cfg.eventoCelebracao && norm(cfg.eventoCelebracao) === norm(e.nome) ? ' · celebração' : ''}{e.pedeDescricao ? ' · pede descrição' : ''}{eventoObrigatorio(e, cfg.eventoCelebracao) ? <b>{` · contagem obrigatória${e.obrigatorioDesde ? ` desde ${dataPT(e.obrigatorioDesde)}` : ''}`}</b> : ''}</td>
            {master && <td style={{ whiteSpace: 'nowrap' }}><button className="link" onClick={() => { setErro(null); setEdit({ ...e, descricao: e.descricao ?? '' }); }}>Editar</button> · <button className="link" onClick={() => void apagarEvento(e)}>Apagar</button></td>}
          </tr>
        ))}</tbody>
      </table></div>
      {master ? <div className="acoes" style={{ marginTop: 10 }}><button onClick={() => { setErro(null); setEdit(novoEvento()); }}>Novo evento</button></div>
        : <p className="muted small">Só o Master altera.</p>}

      <h3 style={{ marginTop: 18 }}>Contagens</h3>
      <p className="small">O que se pode contar num registo (como as categorias do Church Metrics). As quatro primeiras são as do Jotform; "Jovens e adultos" é a base das médias e da repartição dos gerais.</p>
      <div className="linha" style={{ alignItems: 'center' }}>
        {catalogo.map((c) => (
          <span key={c.id} className="etiqueta" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 0, padding: '4px 8px' }}>
            {c.nome}{master && !IDS_BASE.includes(c.id) && <button className="link" style={{ marginLeft: 8 }} aria-label={`Remover ${c.nome}`} onClick={() => void removerContagem(c)}>×</button>}
          </span>
        ))}
      </div>
      {master && (
        <div className="linha" style={{ marginTop: 10 }}>
          <label className="campo">Nova contagem<input value={novaContagem} placeholder="ex.: Online, Voluntários" onChange={(e) => setNovaContagem(e.target.value)} style={{ width: 240 }} /></label>
          <button className="sec" disabled={!novaContagem.trim()} onClick={() => void acrescentarContagem()}>Acrescentar</button>
        </div>
      )}

      {edit && (
        <Modal titulo={edit.id ? `Editar evento: ${edit.nome}` : 'Novo evento'} onFechar={() => setEdit(null)}>
          {erro && <div className="aviso">{erro}</div>}
          <div className="grelha-form">
            <label className={`campo ${erroEm('nome')}`}>Nome *<input value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></label>
            <label className="campo">Descrição<input value={edit.descricao ?? ''} onChange={(e) => setEdit({ ...edit, descricao: e.target.value })} /></label>
          </div>
          <fieldset className={`grupo-campos ${erroEm('contagens')}`}>
            <legend>O que se recolhe *</legend>
            {catalogo.map((c) => (
              <label key={c.id} className="opcao"><input type="checkbox" checked={edit.contagens.includes(c.id)} onChange={() => setEdit({ ...edit, contagens: alternar(edit.contagens, c.id) })} /> {c.nome}</label>
            ))}
          </fieldset>
          {edit.contagens.length > 1 && (
            <fieldset className="grupo-campos">
              <legend>Ordem das perguntas no formulário</legend>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {edit.contagens.map((id, i) => (
                  <li key={id} style={{ margin: '2px 0' }}>
                    {nomeContagem(id)}{' '}
                    <button type="button" className="link" disabled={i === 0} aria-label={`Subir ${nomeContagem(id)}`} onClick={() => mover(i, -1)}>↑</button>{' '}
                    <button type="button" className="link" disabled={i === edit.contagens.length - 1} aria-label={`Descer ${nomeContagem(id)}`} onClick={() => mover(i, 1)}>↓</button>
                  </li>
                ))}
              </ol>
            </fieldset>
          )}
          <fieldset className={`grupo-campos ${erroEm('dias')}`}>
            <legend>Dias da semana</legend>
            <label className="opcao"><input type="radio" name="dias" checked={!edit.dias.length} onChange={() => setEdit({ ...edit, dias: [] })} /> Qualquer dia</label>
            <label className="opcao"><input type="radio" name="dias" checked={!!edit.dias.length} onChange={() => setEdit({ ...edit, dias: edit.dias.length ? edit.dias : [0] })} /> Dias específicos</label>
            {!!edit.dias.length && (
              <div className="linha" style={{ marginTop: 6 }}>
                {DIAS_SEMANA.map((d, i) => (
                  <label key={d} className="opcao"><input type="checkbox" checked={edit.dias.includes(i)} onChange={() => { const dias = alternar(edit.dias, i); if (dias.length) setEdit({ ...edit, dias }); }} /> {d}</label>
                ))}
              </div>
            )}
          </fieldset>
          <fieldset className="grupo-campos">
            <legend>Horário</legend>
            <label className="opcao"><input type="radio" name="horario" checked={edit.horario.diaTodo} onChange={() => setEdit({ ...edit, horario: { diaTodo: true } })} /> Dia todo</label>
            <label className="opcao"><input type="radio" name="horario" checked={!edit.horario.diaTodo} onChange={() => setEdit({ ...edit, horario: { diaTodo: false, inicio: '10:00' } })} /> Horário específico</label>
            {!edit.horario.diaTodo && (
              <div className="linha" style={{ marginTop: 6 }}>
                <label className={`campo ${erroEm('inicio')}`}>Início (hh:mm) *<input inputMode="numeric" placeholder="10:30" maxLength={5} value={edit.horario.inicio} onChange={(e) => setEdit({ ...edit, horario: { ...(edit.horario as { diaTodo: false; inicio: string; fim?: string }), inicio: horaMascara(e.target.value) } })} style={{ width: 100 }} /></label>
                <label className={`campo ${erroEm('fim')}`}>Fim (opcional)<input inputMode="numeric" placeholder="12:30" maxLength={5} value={edit.horario.fim ?? ''} onChange={(e) => { const h = edit.horario as { diaTodo: false; inicio: string; fim?: string }; const fim = horaMascara(e.target.value); setEdit({ ...edit, horario: fim ? { ...h, fim } : { diaTodo: false, inicio: h.inicio } }); }} style={{ width: 100 }} /></label>
              </div>
            )}
          </fieldset>
          <div className="linha" style={{ marginTop: 10 }}>
            <label className="opcao"><input type="checkbox" checked={!!edit.pedeDescricao} onChange={(e) => setEdit({ ...edit, pedeDescricao: e.target.checked })} /> O registo pede uma descrição (ex.: "Outra")</label>
            <label className="opcao"><input type="checkbox" checked={edit.ativo} onChange={(e) => setEdit({ ...edit, ativo: e.target.checked })} /> Ativo (aparece no formulário)</label>
          </div>
          <fieldset className="grupo-campos">
            <legend>Contagem obrigatória</legend>
            <label className="opcao"><input type="checkbox" checked={eventoObrigatorio({ ...edit, ativo: true, dias: edit.dias.length ? edit.dias : [0] }, cfg.eventoCelebracao)}
              onChange={(e) => setEdit({ ...edit, obrigatorio: e.target.checked, obrigatorioDesde: e.target.checked ? (edit.obrigatorioDesde ?? new Date().toISOString().slice(0, 10)) : undefined })} />
              {' '}A introdução da contagem é obrigatória: cada dia em que o evento ocorre aparece nos <b>registos em falta</b> até ser registado</label>
            {eventoObrigatorio({ ...edit, ativo: true, dias: edit.dias.length ? edit.dias : [0] }, cfg.eventoCelebracao) && <>
              <div style={{ maxWidth: 220, marginTop: 6 }}><CampoData rotulo="Obrigatório desde" valor={edit.obrigatorioDesde ?? ''} onChange={(d) => setEdit({ ...edit, obrigatorioDesde: d || undefined })} /></div>
              <p className="small muted">Precisa de dias da semana específicos. Sem data, conta desde 1 de janeiro.</p>
            </>}
          </fieldset>
          <p className="muted small">Pré-visualização: {descreverQuando(edit)}</p>
          <div className="acoes" style={{ marginTop: 12 }}>
            <button onClick={() => void guardarEvento()}>Guardar evento</button>
            <button className="sec" onClick={() => setEdit(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Formata hh:mm enquanto se escreve. */
function horaMascara(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
}
