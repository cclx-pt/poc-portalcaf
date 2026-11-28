import { useEffect, useState } from 'react';
import { isSignInWithEmailLink, sendSignInLinkToEmail, signInWithEmailLink } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { Rodape } from '../components/ui';
import { ECRA_LOGIN } from '../lib/ecras';
import { verificarAcesso } from '../lib/acessos';
import { destinoDoLink, urlComDestino } from '../lib/linkLogin';

const BASE = import.meta.env.BASE_URL;
const CHAVE_EMAIL = 'caf-portal:email-login';
/** Página onde a pessoa estava ao pedir o link (ex.: #/registar), para voltar lá depois do login. */
const CHAVE_DESTINO = 'caf-portal:destino-login';

/** Mensagem em português para um erro do login por link. */
export function traduzir(e: unknown) {
  const c = (e as { code?: string }).code ?? '';
  if (c.includes('unauthorized-domain') || c.includes('unauthorized-continue-uri')) return 'Este endereço não está autorizado no Firebase.';
  if (c.includes('operation-not-allowed')) return 'O login por link de email ainda não está ativo no Firebase (Authentication → Email/senha → Link do email).';
  if (c.includes('invalid-action-code') || c.includes('expired-action-code')) return 'Este link já foi usado ou expirou. Peça um novo.';
  if (c.includes('invalid-email')) return 'Email inválido.';
  return (e as Error).message;
}

/** Endereço de regresso do link: a raiz do portal, sem parâmetros. */
export const urlRegresso = () => `${window.location.origin}${BASE}`;

/**
 * Envia o link de acesso (sem senha) e guarda o email e a página atual para voltar a ela depois do login.
 * Não envia a quem não está registado (nem ativo).
 */
export async function enviarLinkAcesso(email: string): Promise<'enviado' | 'nao-registado'> {
  const endereco = email.trim().toLowerCase();
  if (await verificarAcesso(endereco) === 'nao-registado') return 'nao-registado';
  // O link volta à página de onde foi pedido (ex.: #/presencas), mesmo que o email se abra noutro browser.
  await sendSignInLinkToEmail(auth, endereco, { url: urlComDestino(urlRegresso(), window.location.hash), handleCodeInApp: true });
  window.localStorage.setItem(CHAVE_EMAIL, endereco);
  window.localStorage.setItem(CHAVE_DESTINO, window.location.hash);
  return 'enviado';
}

export default function Login() {
  const { user, motivo, sair } = useAuth();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [pedirEmail, setPedirEmail] = useState(false);

  async function correr(f: () => Promise<unknown>) {
    setOcupado(true); setMsg(null);
    try { await f(); } catch (e) { setMsg(traduzir(e)); } finally { setOcupado(false); }
  }

  async function concluirLink(endereco: string) {
    const destino = destinoDoLink(window.location.href, window.localStorage.getItem(CHAVE_DESTINO));
    await signInWithEmailLink(auth, endereco, window.location.href);
    window.localStorage.removeItem(CHAVE_EMAIL);
    window.localStorage.removeItem(CHAVE_DESTINO);
    // Tira o código do link do endereço e vai para a página pedida. O HashRouter só muda de página com o evento
    // popstate (o replaceState sozinho deixava-o na raiz, por isso o link abria sempre o portal).
    window.history.replaceState(null, '', `${urlRegresso()}${destino}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  // Ao abrir o link recebido por email, conclui o login.
  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    const guardado = window.localStorage.getItem(CHAVE_EMAIL);
    if (guardado) void correr(() => concluirLink(guardado));
    else setPedirEmail(true); // link aberto noutro dispositivo
  }, []);

  if (user && motivo) {
    return (
      <div className="login">
        <div className="caixa">
          <img src={`${BASE}caf-logo.png`} alt="CAF, Conselho Administrativo e Financeiro, CCLX" />
          <h2>Utilizador não está registado</h2>
          <p>A conta <b>{user.email}</b> não tem um perfil ativo no portal. Peça ao Master (tesouraria@cclx.pt) para lhe dar acesso.</p>
          {msg && <div className="nota">{msg}</div>}
          <button onClick={() => void sair()}>Terminar sessão</button>
          <a href={`${BASE}#/publico`}>Ver a página pública</a>
          <Rodape ecra={ECRA_LOGIN} />
        </div>
      </div>
    );
  }

  return (
    <div className="login">
      <div className="caixa">
        <img src={`${BASE}caf-logo.png`} alt="CAF, Conselho Administrativo e Financeiro, CCLX" />
        <h1>Portal CAF</h1>
        <p className="muted">Gestão financeira da CCLX. Acesso reservado a utilizadores autorizados.</p>

        {pedirEmail ? <>
          <p className="small">Abriu o link noutro dispositivo. Confirme o email para entrar.</p>
          <label className="campo">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <button disabled={ocupado || !email} onClick={() => correr(() => concluirLink(email.trim()))}>Entrar</button>
        </> : enviado ? <>
          <div className="nota">Enviámos um link de acesso para <b>{email}</b>. Abra o email neste dispositivo e carregue no link para entrar. O link é válido uma vez.</div>
          <button className="sec" onClick={() => setEnviado(false)}>Usar outro email</button>
        </> : <>
          <div className="muted" style={{ textAlign: 'center' }}>Receba um link de acesso por email (sem senha).</div>
          <label className="campo">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <button disabled={ocupado || !email.includes('@')} onClick={() => correr(async () => {
            const endereco = email.trim().toLowerCase();
            if (await enviarLinkAcesso(endereco) === 'nao-registado') {
              setMsg(`Utilizador não está registado: ${endereco} não tem acesso ao portal. Peça ao Master (tesouraria@cclx.pt) para lhe dar acesso.`);
              return;
            }
            setEnviado(true);
          })}>Enviar link de acesso</button>
        </>}

        {msg && <div className="aviso">{msg}</div>}
        <a href={`${BASE}#/publico`}>Ver a página pública</a>
        <Rodape ecra={ECRA_LOGIN} />
      </div>
    </div>
  );
}
