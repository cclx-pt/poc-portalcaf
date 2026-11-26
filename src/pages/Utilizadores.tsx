import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Estado, mensagemErro, useCarregar } from '../components/ui';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { apagarPerfil, auditar, gravarPerfil, listarComunidades, listarPerfis } from '../lib/db';
import { urlRegresso } from './Login';
import { erroPerfil } from '../lib/perfis';
import { MASTER_EMAILS, NIVEIS, NIVEL_LABEL, PAPEL_LABEL, type Nivel, type Papel, type Perfil } from '../lib/types';

const NIVEL_DEFEITO: Record<Papel, Nivel> = { master: 'confidencial', caf: 'confidencial', tesoureiro: 'privado', leitura: 'publico', registos: 'publico' };
const novo = (): Perfil => ({ email: '', nome: '', papel: 'leitura', nivel: 'publico', comunidades: ['*'], ativo: true });

export default function Utilizadores() {
  const { acesso } = useAuth();
  const perfis = useCarregar(listarPerfis, []);
  const coms = useCarregar(listarComunidades, []);
  const [edit, setEdit] = useState<Perfil | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [enviarEmail, setEnviarEmail] = useState(true);
  /** Envia ao utilizador o email de acesso do portal (link de entrada, em português). Não guarda nada neste dispositivo. */
  async function enviarAcesso(email: string) {
    await sendSignInLinkToEmail(auth, email, { url: urlRegresso(), handleCodeInApp: true });
    await auditar(acesso!.email, 'email de acesso enviado', email);
  }
  async function reenviar(email: string) {
    try { await enviarAcesso(email); setMsg(`Email de acesso enviado para ${email}.`); } catch (e) { setMsg(mensagemErro(e)); }
  }
  const nomes = new Map((coms.dados ?? []).map((c) => [c.id, c.nome]));

  async function guardar() {
    if (!edit) return;
    try {
      const p = { ...edit, nome: edit.nome?.trim(), email: edit.email.trim().toLowerCase(), comunidades: edit.papel === 'caf' ? ['*'] : edit.comunidades };
      const erro = erroPerfil(p);
      if (erro) { setMsg(erro); return; }
      const eNovo = !(perfis.dados ?? []).some((x) => x.email === p.email);
      await gravarPerfil(p);
      await auditar(acesso!.email, 'utilizador', `${p.nome} <${p.email}>: ${p.papel}, ${p.nivel}, ${p.comunidades.join(',')}, ${p.ativo ? 'ativo' : 'inativo'}`);
      let enviado = '';
      if (eNovo && p.ativo && enviarEmail) {
        try { await enviarAcesso(p.email); enviado = ` Enviámos o email de acesso para ${p.email}.`; }
        catch (e) { enviado = ` Não foi possível enviar o email de acesso (${mensagemErro(e)}); use "Enviar email de acesso" na lista.`; }
      }
      setMsg(`Utilizador ${p.email} guardado.${enviado}`);
      setEdit(null); await perfis.recarregar();
    } catch (e) { setMsg(mensagemErro(e)); }
  }
  async function remover(email: string) {
    if (!confirm(`Remover o acesso de ${email}?`)) return;
    try { await apagarPerfil(email); await auditar(acesso!.email, 'remover utilizador', email); await perfis.recarregar(); } catch (e) { setMsg(mensagemErro(e)); }
  }

  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1>Utilizadores</h1>
          <p className="muted">Master (fixos): {MASTER_EMAILS.join(', ')}. O CAF vê toda a organização; o tesoureiro e a leitura veem tudo ou só as comunidades escolhidas; a leitura só consulta, até ao nível definido. O perfil Registos só regista e consulta presenças das suas comunidades, sem dados financeiros; entra pelo link direto <b>portalcaf.cclx.pt/#/registar</b> (telemóvel ou computador).</p>
        </div>
        <button onClick={() => { setEnviarEmail(true); setEdit(novo()); }}>Novo utilizador</button>
      </div>
      {msg && <div className="aviso">{msg}</div>}
      <Estado aCarregar={perfis.aCarregar} erro={perfis.erro} />
      <div className="tabela"><table>
        <thead><tr><th>Nome</th><th>Email</th><th>Perfil</th><th>Nível</th><th>Comunidades</th><th>Estado</th><th /></tr></thead>
        <tbody>
          {(perfis.dados ?? []).map((p) => (
            <tr key={p.email}>
              <td>{p.nome?.trim() || <b>Sem nome</b>}</td><td>{p.email}</td><td>{PAPEL_LABEL[p.papel]}</td><td>{NIVEL_LABEL[p.nivel]}</td>
              <td>{p.comunidades.includes('*') ? 'Todas' : p.comunidades.map((c) => nomes.get(c) ?? c).join(', ')}</td>
              <td>{p.ativo ? 'Ativo' : 'Inativo'}</td>
              <td><button className="link" onClick={() => { setEnviarEmail(false); setEdit(p); }}>Editar</button> · {p.ativo && <><button className="link" onClick={() => void reenviar(p.email)} title="Envia o link de entrada no portal para este email">Enviar email de acesso</button> · </>}<button className="link" onClick={() => remover(p.email)}>Remover</button></td>
            </tr>
          ))}
          {!perfis.dados?.length && !perfis.aCarregar && <tr><td colSpan={7} className="muted">Ainda não há utilizadores além dos Master.</td></tr>}
        </tbody>
      </table></div>
      {edit && (
        <div className="modal-fundo" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{edit.nome?.trim() || edit.email || 'Novo utilizador'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <label className="campo">Nome *<input value={edit.nome ?? ''} autoComplete="name" onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></label>
              <label className="campo">Email *<input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
              <label className="campo">Perfil
                <select value={edit.papel} onChange={(e) => { const papel = e.target.value as Papel; setEdit({ ...edit, papel, nivel: NIVEL_DEFEITO[papel], comunidades: papel === 'caf' ? ['*'] : edit.comunidades }); }}>
                  {(['caf', 'tesoureiro', 'leitura', 'registos'] as Papel[]).map((p) => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}
                </select>
              </label>
              {edit.papel !== 'registos' && <label className="campo">Nível máximo de privacidade
                <select value={edit.nivel} onChange={(e) => setEdit({ ...edit, nivel: e.target.value as Nivel })}>{NIVEIS.map((n) => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}</select>
              </label>}
              <label className="campo">Estado
                <select value={edit.ativo ? '1' : '0'} onChange={(e) => setEdit({ ...edit, ativo: e.target.value === '1' })}><option value="1">Ativo</option><option value="0">Inativo</option></select>
              </label>
            </div>
            {edit.papel !== 'caf' && (
              <fieldset style={{ marginTop: 12, border: '1px solid #e6e6e6' }}>
                <legend className="small">{edit.papel === 'registos' ? 'Comunidades onde pode registar e consultar presenças' : 'Comunidades cujos dados pode ver'}</legend>
                <label className="small" style={{ marginRight: 12 }}><input type="checkbox" checked={edit.comunidades.includes('*')} onChange={(e) => setEdit({ ...edit, comunidades: e.target.checked ? ['*'] : [] })} /> <b>Ver tudo (todas as comunidades)</b></label>
                {!edit.comunidades.includes('*') && (coms.dados ?? []).filter((c) => !c.especial && (c.ativo !== false || edit.comunidades.includes(c.id))).map((c) => (
                  <label key={c.id} className="small" style={{ marginRight: 12, whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={edit.comunidades.includes(c.id)}
                      onChange={(e) => setEdit({ ...edit, comunidades: e.target.checked ? [...edit.comunidades, c.id] : edit.comunidades.filter((x) => x !== c.id) })} /> {c.nome}
                  </label>
                ))}
                <p className="muted" style={{ margin: '6px 0 0' }}>Vale para tudo o que o utilizador vê no portal, dentro do seu nível de privacidade. É imposto nas regras da base de dados, não só no ecrã.</p>
              </fieldset>
            )}
            {!(perfis.dados ?? []).some((x) => x.email === edit.email.trim().toLowerCase()) && (
              <label className="opcao" style={{ marginTop: 10 }}><input type="checkbox" checked={enviarEmail} onChange={(e) => setEnviarEmail(e.target.checked)} /> Enviar o email de acesso ao portal (link de entrada, sem senha)</label>
            )}
            <div className="acoes" style={{ marginTop: 14 }}>
              <button disabled={!edit.email.includes('@') || !edit.nome?.trim()} onClick={guardar}>Guardar</button>
              <button className="sec" onClick={() => setEdit(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
