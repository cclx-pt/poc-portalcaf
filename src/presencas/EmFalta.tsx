import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, PartyPopper } from 'lucide-react';
import { dataPT, hoje, num } from '../lib/format';
import { useFaltasPresencas, useLotesPresencas } from '../pages/RegistarPresencas';
import { resumoInicio } from '../lib/presencasHistorico';
import { EstadoPz, diaSemana, usePz } from './ui';

/** Registos em falta: eventos obrigatórios até ontem sem registo (sem as exceções). Tocar abre o registo já preenchido. */
export function EmFalta() {
  const pz = usePz();
  const anoAtual = Number(hoje().slice(0, 4));
  const [ano, setAno] = useState(anoAtual);
  const outros = useLotesPresencas(ano === anoAtual ? 0 : ano);
  const lotes = ano === anoAtual ? pz.lotes : outros.dados ?? [];
  const aCarregar = ano === anoAtual ? pz.aCarregar : outros.aCarregar;
  const calc = useFaltasPresencas({ ano, hoje: hoje(), comunidades: pz.doContexto, lotes });
  const faltas = aCarregar ? null : calc?.falta ?? null;
  const ir = useNavigate();
  const nomes = new Map(pz.comunidades.map((c) => [c.id, c.nome]));
  const r = faltas ? resumoInicio(faltas) : null;
  const varias = pz.doContexto.length > 1;

  return (
    <>
      <h1>Registos em falta</h1>
      <div className="pz-segmentos" role="group" aria-label="Ano">
        {[anoAtual, anoAtual - 1].map((a) => <button key={a} aria-pressed={ano === a} onClick={() => setAno(a)}>{a}</button>)}
      </div>
      <EstadoPz aCarregar={aCarregar || !faltas} erro={ano === anoAtual ? pz.erro : outros.erro} />
      {r && <div><h2>{num(r.emFalta)} por preencher</h2><p className="pz-muted">{num(r.efetuados)} de {num(r.esperados)} registos</p></div>}
      {faltas && r?.emFalta === 0 && (
        <div className="pz-vazio"><PartyPopper size={40} aria-hidden /><h2>Tudo registado.</h2><p>Não há eventos obrigatórios por registar em {ano}.</p></div>
      )}
      {faltas?.filter((f) => f.emFalta.length).map((f) => (
        <section key={f.comunidadeId} className="pz-lista" aria-label={nomes.get(f.comunidadeId)}>
          {varias && <h3 className="pz-mes">{nomes.get(f.comunidadeId)} · {num(f.emFalta.length)}</h3>}
          {[...f.emFalta].reverse().map((x) => (
            <button key={`${x.data}|${x.evento}`} className="pz-item" onClick={() => ir(`/presencas/registar?${new URLSearchParams({ data: x.data, comunidade: f.comunidadeId, evento: x.evento })}`)}>
              <div><b>{dataPT(x.data)}</b> <span className="pz-muted pz-peq">{diaSemana(x.data)}</span><div className="pz-muted pz-peq">{x.evento}{varias ? '' : ` · ${nomes.get(f.comunidadeId)}`}</div></div>
              <span className="pz-item-acao">Registar <ChevronRight size={18} aria-hidden /></span>
            </button>
          ))}
        </section>
      ))}
      {faltas && !faltas.length && <p className="pz-muted">Sem eventos obrigatórios neste período.</p>}
    </>
  );
}
