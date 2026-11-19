import { useNavigate } from 'react-router-dom';
import { Estado, useFiltros } from '../components/ui';
import { hoje } from '../lib/format';
import { RegistosEmFaltaLista, useComunidadesDoUtilizador, useLotesPresencas } from './RegistarPresencas';

/** Página "Registos em falta": eventos com contagem obrigatória sem registo. Tocar num abre o Registar presenças já preenchido. */
export default function RegistosEmFalta() {
  const { ano, comunidade } = useFiltros();
  const coms = useComunidadesDoUtilizador();
  const lotes = useLotesPresencas(ano);
  const navegar = useNavigate();
  const comunidades = (coms.dados ?? []).filter((c) => comunidade === 'todas' || c.id === comunidade);
  return (
    <>
      <h1>Registos em falta {ano}</h1>
      <p className="muted">Eventos com contagem obrigatória (Configuração → Assistência) sem registo, por comunidade, no ano e comunidade do filtro do topo. Toque num registo em falta para o registar.</p>
      <Estado aCarregar={coms.aCarregar || lotes.aCarregar} erro={coms.erro || lotes.erro} />
      {!coms.aCarregar && !lotes.aCarregar && (
        <RegistosEmFaltaLista ano={ano} hoje={hoje()} comunidades={comunidades} lotes={lotes.dados ?? []}
          aoEscolher={(data, comunidadeId, evento) => navegar(`/registos/presencas/novo?${new URLSearchParams({ data, comunidade: comunidadeId, evento })}`)} />
      )}
    </>
  );
}
