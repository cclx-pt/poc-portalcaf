import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { dataPT, num } from '../lib/format';
import { apagarRascunho, armazemLocal, lerRascunhos } from '../lib/rascunhos';
import { resumoInicio } from '../lib/presencasHistorico';
import { EstadoPz, hora, usePz } from './ui';

/** Início: saudação, ação principal, registos em falta e efetuados do ano, e contagens por acabar neste telemóvel. */
export function Inicio() {
  const { acesso } = useAuth();
  const { comunidades, faltas, aCarregar, erro } = usePz();
  const ir = useNavigate();
  const [rascunhos, setRascunhos] = useState(() => lerRascunhos(armazemLocal(), acesso?.email ?? ''));
  const nomes = new Map(comunidades.map((c) => [c.id, c.nome]));
  const meus = rascunhos.filter((r) => nomes.has(r.entrada.comunidadeId));
  const r = faltas ? resumoInicio(faltas) : null;
  const primeiro = acesso?.nome?.trim().split(/\s+/)[0];

  return (
    <>
      <div className="pz-saudacao"><h1>{primeiro ? `Olá, ${primeiro}!` : 'Olá!'}</h1><p>Cada pessoa conta.</p></div>
      <section className="pz-herói" aria-labelledby="pz-vamos">
        <h2 id="pz-vamos">Vamos contar?</h2>
        <p>Regista as presenças da comunidade.</p>
        <button className="pz-btn bloco" onClick={() => ir('/presencas/registar')}>Novo registo <ArrowRight size={20} aria-hidden /></button>
      </section>
      <EstadoPz aCarregar={aCarregar} erro={erro} />
      {r && (
        <div className="pz-stats">
          <button className="pz-stat falta" onClick={() => ir('/presencas/em-falta')}><b>{num(r.emFalta)}</b><span>Em falta</span></button>
          <button className="pz-stat feitos" onClick={() => ir('/presencas/historico')}><b>{num(r.efetuados)}</b><span>Efetuados{r.esperados ? ` de ${num(r.esperados)}` : ''}</span></button>
        </div>
      )}
      {meus.map((x) => (
        <section key={x.id} className="pz-cartao pz-rascunho" aria-label="Contagem por acabar">
          <RotateCcw size={22} aria-hidden />
          <div>
            <h3>Retomar contagem</h3>
            <p className="pz-muted pz-peq">{dataPT(x.entrada.data)} · {x.entrada.evento} · {nomes.get(x.entrada.comunidadeId)}</p>
            <p className="pz-muted pz-peq">Rascunho neste dispositivo, guardado às {hora(x.atualizadoEm)}</p>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="pz-link" onClick={() => ir(`/presencas/registar?rascunho=${encodeURIComponent(x.id)}`)}>Retomar</button>
              <button className="pz-link" onClick={() => {
                if (!confirm('Descartar esta contagem? As contagens perdem-se.')) return;
                apagarRascunho(armazemLocal(), acesso!.email, x.id);
                setRascunhos(lerRascunhos(armazemLocal(), acesso!.email));
              }}>Descartar</button>
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
