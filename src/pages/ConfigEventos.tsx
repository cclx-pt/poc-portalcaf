import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, Modal, mensagemErro, useCarregar } from '../components/ui';
import { auditar, gravarConfigAssistencia, lerConfigAssistencia } from '../lib/db';
import { DIAS_SEMANA, IDS_BASE, catalogoContagens, descreverQuando, eventosEfetivos, validarEvento, type Contagem, type EventoConfig } from '../lib/eventos';
import { norm, slug } from '../lib/format';

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
      contagens: catalogo.map((c) => c.id).filter((id) => edit.contagens.includes(id)),
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

  const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  return (
    <div className="sec card">
      <h2>Eventos do registo de presenças</h2>
      <p className="small">Para cada evento: o que se recolhe, em que dias da semana ocorre e o horário. O formulário de registo só mostra os eventos que ocorrem no dia escolhido e só as contagens desse evento. Mudar o nome de um evento não altera os registos já feitos.</p>
      {msg && <p className="small">{msg}</p>}
      <div className="tabela"><table>
        <thead><tr><th>Evento</th><th>Quando</th><th>Contagens</th><th>Estado</th>{master && <th />}</tr></thead>
        <tbody>{eventos.map((e) => (
          <tr key={e.id}>
            <td><b>{e.nome}</b>{e.descricao && <div className="small muted">{e.descricao}</div>}</td>
            <td>{descreverQuando(e)}</td>
            <td className="small">{e.contagens.map(nomeContagem).join(', ')}</td>
            <td className="small">{e.ativo ? 'Ativo' : 'Inativo'}{cfg.eventoCelebracao && norm(cfg.eventoCelebracao) === norm(e.nome) ? ' · celebração' : ''}{e.pedeDescricao ? ' · pede descrição' : ''}</td>
            {master && <td><button className="link" onClick={() => { setErro(null); setEdit({ ...e, descricao: e.descricao ?? '' }); }}>Editar</button></td>}
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
            <label className="campo">Nome *<input value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></label>
            <label className="campo">Descrição<input value={edit.descricao ?? ''} onChange={(e) => setEdit({ ...edit, descricao: e.target.value })} /></label>
          </div>
          <fieldset className="grupo-campos">
            <legend>O que se recolhe *</legend>
            {catalogo.map((c) => (
              <label key={c.id} className="opcao"><input type="checkbox" checked={edit.contagens.includes(c.id)} onChange={() => setEdit({ ...edit, contagens: alternar(edit.contagens, c.id) })} /> {c.nome}</label>
            ))}
          </fieldset>
          <fieldset className="grupo-campos">
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
                <label className="campo">Início (hh:mm) *<input inputMode="numeric" placeholder="10:30" maxLength={5} value={edit.horario.inicio} onChange={(e) => setEdit({ ...edit, horario: { ...(edit.horario as { diaTodo: false; inicio: string; fim?: string }), inicio: horaMascara(e.target.value) } })} style={{ width: 100 }} /></label>
                <label className="campo">Fim (opcional)<input inputMode="numeric" placeholder="12:30" maxLength={5} value={edit.horario.fim ?? ''} onChange={(e) => { const h = edit.horario as { diaTodo: false; inicio: string; fim?: string }; const fim = horaMascara(e.target.value); setEdit({ ...edit, horario: fim ? { ...h, fim } : { diaTodo: false, inicio: h.inicio } }); }} style={{ width: 100 }} /></label>
              </div>
            )}
          </fieldset>
          <div className="linha" style={{ marginTop: 10 }}>
            <label className="opcao"><input type="checkbox" checked={!!edit.pedeDescricao} onChange={(e) => setEdit({ ...edit, pedeDescricao: e.target.checked })} /> O registo pede uma descrição (ex.: "Outra")</label>
            <label className="opcao"><input type="checkbox" checked={edit.ativo} onChange={(e) => setEdit({ ...edit, ativo: e.target.checked })} /> Ativo (aparece no formulário)</label>
          </div>
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
