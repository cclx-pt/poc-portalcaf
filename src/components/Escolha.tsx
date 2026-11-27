import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { filtrarOpcoes, podeCriarOpcao, type OpcaoEscolha } from '../lib/escolha';

export interface CriarOpcao {
  /** Nome do tipo de valor, para a pergunta: "centro de custo", "projeto ou evento", "fornecedor". */
  rotulo: string;
  /** Grava o valor novo e devolve o valor a escolher (ou null se não gravou). */
  fazer: (texto: string) => Promise<string | null>;
}

interface Props {
  valor: string;
  onChange: (valor: string) => void;
  opcoes: OpcaoEscolha[];
  /** Texto da opção vazia ("—", "Escolha…"); sem ela, não há opção vazia. */
  vazio?: string;
  /** Permite escrever um valor novo: o sistema pergunta se o quer gravar. */
  criar?: CriarOpcao;
  /** Aceita o texto escrito como valor, mesmo sem o gravar na lista (ex.: fornecedor). */
  textoLivre?: boolean;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
  placeholder?: string;
}

type Item = { tipo: 'vazio' } | { tipo: 'opcao'; o: OpcaoEscolha } | { tipo: 'criar'; texto: string };

/**
 * Lista com procura: escreve-se para filtrar (sem maiúsculas nem acentos) e escolhe-se com o rato ou com as setas e Enter.
 * Com `criar`, um texto que não está na lista pode ser gravado como valor novo (pergunta antes de gravar).
 */
export function Escolha({ valor, onChange, opcoes, vazio, criar, textoLivre, disabled, style, placeholder, ...aria }: Props) {
  const id = useId();
  const atual = opcoes.find((o) => o.valor === valor);
  const rotuloAtual = atual?.rotulo ?? valor ?? '';
  const [aberto, setAberto] = useState(false);
  // Texto da procura: começa vazio ao abrir (a lista mostra tudo); o valor atual fica como sugestão na caixa.
  const [texto, setTexto] = useState('');
  const [ativo, setAtivo] = useState(0);
  const [aGravar, setAGravar] = useState(false);
  const caixa = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const procura = aberto ? texto : '';
  // A lista abre por cima de tudo (posição fixa), para não ficar cortada dentro de tabelas com scroll.
  const [pos, setPos] = useState<CSSProperties>({});
  useEffect(() => {
    if (!aberto) return;
    const medir = () => {
      const r = caixa.current?.getBoundingClientRect();
      if (!r) return;
      const abaixo = window.innerHeight - r.bottom;
      setPos(abaixo < 200 && r.top > abaixo
        ? { position: 'fixed', left: r.left, bottom: window.innerHeight - r.top + 4, top: 'auto', width: Math.max(r.width, 240) }
        : { position: 'fixed', left: r.left, top: r.bottom + 4, width: Math.max(r.width, 240) });
    };
    medir();
    window.addEventListener('scroll', medir, true); window.addEventListener('resize', medir);
    return () => { window.removeEventListener('scroll', medir, true); window.removeEventListener('resize', medir); };
  }, [aberto]);


  const itens: Item[] = useMemo(() => {
    const out: Item[] = [];
    if (vazio != null && !procura.trim()) out.push({ tipo: 'vazio' });
    for (const o of filtrarOpcoes(opcoes, procura)) out.push({ tipo: 'opcao', o });
    if ((criar || textoLivre) && podeCriarOpcao(opcoes, procura)) out.push({ tipo: 'criar', texto: procura.trim().replace(/\s+/g, ' ') });
    return out;
  }, [opcoes, procura, vazio, criar, textoLivre]);

  // Ao abrir, fica destacada a opção escolhida; ao procurar, a primeira que aparece.
  useEffect(() => { setAtivo(procura ? 0 : Math.max(0, itens.findIndex((it) => (it.tipo === 'opcao' ? it.o.valor === valor : it.tipo === 'vazio' && !valor)))); }, [procura, aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!aberto) return;
    lista.current?.querySelector(`[data-i="${ativo}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [ativo, aberto]);

  const abrir = () => { if (!aberto) { setTexto(''); setAberto(true); } };
  const fechar = () => { setAberto(false); setTexto(''); };
  async function escolher(it: Item | undefined) {
    if (!it) return;
    if (it.tipo === 'vazio') { onChange(''); fechar(); return; }
    if (it.tipo === 'opcao') { onChange(it.o.valor); fechar(); return; }
    if (criar && confirm(`Gravar o novo ${criar.rotulo} "${it.texto}"?`)) {
      setAGravar(true);
      try { const v = await criar.fazer(it.texto); if (v != null) { onChange(v); fechar(); return; } } finally { setAGravar(false); }
    }
    if (textoLivre) { onChange(it.texto); fechar(); return; }
    caixa.current?.focus();
  }

  const idAtivo = aberto && itens[ativo] ? `${id}-${ativo}` : undefined;
  return (
    <div className="escolha" style={style}>
      <input
        ref={caixa} role="combobox" aria-expanded={aberto} aria-controls={`${id}-lista`} aria-autocomplete="list" aria-activedescendant={idAtivo}
        aria-label={aria['aria-label']} aria-invalid={aria['aria-invalid']} disabled={disabled || aGravar} autoComplete="off"
        placeholder={aberto && rotuloAtual ? rotuloAtual : placeholder ?? (vazio && vazio !== '—' ? vazio : 'Escreva para procurar…')}
        value={aberto ? texto : rotuloAtual}
        onFocus={abrir} onMouseDown={abrir}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); }}
        onBlur={() => setTimeout(fechar, 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); if (!aberto) abrir(); else setAtivo((a) => Math.min(itens.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(0, a - 1)); }
          else if (e.key === 'Enter') { if (aberto) { e.preventDefault(); void escolher(itens[ativo]); } }
          else if (e.key === 'Escape') { if (aberto) { e.preventDefault(); fechar(); } }
          else if (e.key === 'Tab') fechar();
        }}
      />
      <span className="escolha-seta" aria-hidden="true">▾</span>
      {aberto && (
        <ul ref={lista} id={`${id}-lista`} role="listbox" className="escolha-lista" style={pos} aria-label={aria['aria-label']}>
          {itens.length === 0 && <li className="escolha-nada" role="presentation">Sem resultados</li>}
          {itens.map((it, i) => (
            <li key={it.tipo === 'opcao' ? `o-${it.o.valor}` : it.tipo} id={`${id}-${i}`} data-i={i} role="option"
              aria-selected={it.tipo === 'opcao' ? it.o.valor === valor : it.tipo === 'vazio' ? !valor : false}
              className={`${i === ativo ? 'ativo' : ''}${it.tipo === 'criar' ? ' escolha-criar' : ''}`}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAtivo(i)} onClick={() => void escolher(it)}>
              {it.tipo === 'vazio' ? <span className="muted">{vazio}</span>
                : it.tipo === 'opcao' ? <>{it.o.rotulo}{it.o.detalhe && <span className="muted small"> · {it.o.detalhe}</span>}</>
                : <>{criar ? `+ Novo ${criar.rotulo}: ` : 'Usar: '}<b>{it.texto}</b></>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
