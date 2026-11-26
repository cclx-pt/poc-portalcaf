import { useState } from 'react';
import { Mail } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { enviarLinkAcesso, traduzir } from '../pages/Login';
import { Mensagem } from './ui';

/** Entrada na app: o mesmo link de acesso por email do portal (sem senha). O link volta a esta app. */
export function LoginPresencas() {
  const { user, motivo, sair } = useAuth();
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function enviar() {
    setOcupado(true); setMsg(null);
    try {
      if (await enviarLinkAcesso(email) === 'nao-registado') setMsg('Este email não tem acesso. Peça ao Master (tesouraria@cclx.pt) para lhe dar acesso.');
      else setEnviado(true);
    } catch (e) { setMsg(traduzir(e)); } finally { setOcupado(false); }
  }

  return (
    <div className="pz-login">
      <div className="pz-marca"><b>Presenças.</b><span className="pz-muted pz-peq">CCLX</span></div>
      {user && motivo ? (
        <div className="pz-login-caixa">
          <h1>Sem acesso</h1>
          <p className="pz-muted">A conta <b>{user.email}</b> não tem um perfil ativo. Peça ao Master (tesouraria@cclx.pt) para lhe dar acesso.</p>
          <button className="pz-btn escuro bloco" onClick={() => void sair()}>Terminar sessão</button>
        </div>
      ) : enviado ? (
        <div className="pz-login-caixa">
          <div className="pz-sucesso-ico" aria-hidden><Mail size={32} /></div>
          <h1>Veja o seu email</h1>
          <p className="pz-muted">Enviámos um link de acesso para <b>{email.trim().toLowerCase()}</b>. Abra-o <b>neste telemóvel</b>. O link só funciona uma vez.</p>
          <button className="pz-btn claro bloco" onClick={() => setEnviado(false)}>Usar outro email</button>
        </div>
      ) : (
        <form className="pz-login-caixa" onSubmit={(e) => { e.preventDefault(); if (valido) void enviar(); }}>
          <div><h1>Bem-vindo!</h1><p className="pz-muted">Cada pessoa conta.</p></div>
          <label className="pz-campo">Email
            <input type="email" inputMode="email" autoComplete="email" placeholder="nome@exemplo.pt" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!msg || undefined} />
          </label>
          {msg && <Mensagem tipo="erro">{msg}</Mensagem>}
          <button type="submit" className="pz-btn prim bloco" disabled={ocupado || !valido}>{ocupado ? 'A enviar…' : 'Enviar link de acesso'}</button>
          <p className="pz-muted pz-peq">Sem palavra-passe. Abra o link no mesmo telemóvel.</p>
        </form>
      )}
    </div>
  );
}
