import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Estado } from '../components/ui';
import { PAPEL_LABEL } from '../lib/types';
import { hoje } from '../lib/format';
import { filtrarLotesPresenca, type EntradaPresenca, type FiltroPresencas } from '../lib/presencas';
import { RegistosEmFaltaLista, FiltrosListaPresencas, FormularioPresencas, ListaPresencas, useComunidadesDoUtilizador, useLotesPresencas } from './RegistarPresencas';

const BASE = import.meta.env.BASE_URL;

/**
 * Link direto para registar e consultar presenças (portalcaf.cclx.pt/#/registar).
 * Layout mínimo, sem menu, pensado para telemóvel e computador. Só mostra as comunidades do utilizador.
 */
export default function RegistoRapido() {
  const { acesso, sair } = useAuth();
  const [aba, setAba] = useState<'novo' | 'domingos' | 'consultar'>('novo');
  const [filtro, setFiltro] = useState<FiltroPresencas>({});
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [comunidade, setComunidade] = useState('todas');
  const [inicial, setInicial] = useState<{ chave: number; v: Partial<EntradaPresenca> }>({ chave: 0, v: {} });
  const coms = useComunidadesDoUtilizador();
  const lotes = useLotesPresencas(aba === 'novo' ? anoAtual : ano);
  const comunidades = coms.dados ?? [];
  const filtradas = comunidade === 'todas' ? comunidades : comunidades.filter((c) => c.id === comunidade);

  return (
    <div className="registo-rapido">
      <header className="rr-topo">
        <img src={`${BASE}caf-logo.png`} alt="CAF, CCLX" />
        <div className="rr-utilizador">
          <div className="small">{acesso?.email}</div>
          <div className="muted">{acesso && PAPEL_LABEL[acesso.papel]}</div>
          <div className="rr-ligacoes">
            {acesso?.papel !== 'registos' && <Link to="/">Portal</Link>}
            <button className="link" onClick={() => void sair()}>Sair</button>
          </div>
        </div>
      </header>
      <h1>Registo de presenças</h1>
      <div className="abas" role="tablist">
        <button role="tab" aria-selected={aba === 'novo'} className={aba === 'novo' ? 'ativa' : ''} onClick={() => setAba('novo')}>Novo registo</button>
        <button role="tab" aria-selected={aba === 'domingos'} className={aba === 'domingos' ? 'ativa' : ''} onClick={() => setAba('domingos')}>Registos em falta</button>
        <button role="tab" aria-selected={aba === 'consultar'} className={aba === 'consultar' ? 'ativa' : ''} onClick={() => setAba('consultar')}>Consultar</button>
      </div>
      <Estado aCarregar={coms.aCarregar} erro={coms.erro} />
      {!coms.aCarregar && aba === 'novo' && (
        <FormularioPresencas key={inicial.chave} inicial={inicial.v} comunidades={comunidades} lotes={lotes.dados ?? []} aposGravar={lotes.recarregar} />
      )}
      {!coms.aCarregar && aba !== 'novo' && (
        <div className="linha" style={{ marginBottom: 12 }}>
          <label className="campo">Ano
            <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
              {[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          {aba === 'domingos' && comunidades.length > 1 && (
            <label className="campo">Comunidade
              <select value={comunidade} onChange={(e) => setComunidade(e.target.value)}>
                <option value="todas">Todas as minhas</option>
                {comunidades.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      {!coms.aCarregar && aba === 'domingos' && (
        <>
          <Estado aCarregar={lotes.aCarregar} erro={lotes.erro} />
          {!lotes.aCarregar && (
            <RegistosEmFaltaLista ano={ano} hoje={hoje()} comunidades={filtradas} lotes={lotes.dados ?? []}
              aoEscolher={(data, comunidadeId, evento) => { setInicial({ chave: Date.now(), v: { data, comunidadeId, evento } }); setAba('novo'); window.scrollTo?.(0, 0); }} />
          )}
        </>
      )}
      {!coms.aCarregar && aba === 'consultar' && (
        <>
          <FiltrosListaPresencas comunidades={comunidades} lotes={lotes.dados ?? []} filtro={{ ...filtro, comunidadeId: comunidade }}
            aoMudar={({ comunidadeId, ...f }) => { setFiltro(f); setComunidade(comunidadeId ?? 'todas'); }} />
          <Estado aCarregar={lotes.aCarregar} erro={lotes.erro} />
          {!lotes.aCarregar && <ListaPresencas lotes={filtrarLotesPresenca(lotes.dados ?? [], { ...filtro, comunidadeId: comunidade })} comunidades={comunidades} soPortal={false} aposApagar={lotes.recarregar} />}
          <p className="muted small" style={{ marginTop: 8 }}>Inclui os registos do Jotform e os feitos no portal. Só pode apagar os registos que fez no portal.</p>
        </>
      )}
    </div>
  );
}
