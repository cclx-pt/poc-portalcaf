import { describe, expect, it } from 'vitest';
import { apagarRascunho, deveGuardarRascunho, guardarRascunho, idRascunho, lerRascunhos, type Armazem } from '../../src/lib/rascunhos';

const mem = (): Armazem & { dados: Map<string, string> } => {
  const dados = new Map<string, string>();
  return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v), removeItem: (k) => void dados.delete(k) };
};
const e = { data: '2026-11-15', evento: 'Celebração Domingo', comunidadeId: 'almada', adultos: 37, jump: NaN, criancas: 12, connects: NaN };

describe('rascunhos de registos de presenças (no dispositivo)', () => {
  it('só guarda quando há data, evento, comunidade e alguma contagem ou observação', () => {
    expect(deveGuardarRascunho(e)).toBe(true);
    expect(deveGuardarRascunho({ ...e, evento: '' })).toBe(false);
    expect(deveGuardarRascunho({ ...e, adultos: NaN, criancas: NaN })).toBe(false);
    expect(deveGuardarRascunho({ ...e, adultos: NaN, criancas: NaN, outras: { online: 3 } })).toBe(true);
  });
  it('guarda, lê (mais recente primeiro), atualiza o mesmo rascunho e apaga; por utilizador', () => {
    const s = mem();
    guardarRascunho(s, 'ana@x.pt', e, '2026-11-15T10:00:00Z');
    guardarRascunho(s, 'ana@x.pt', { ...e, evento: 'ATOS' }, '2026-11-15T11:00:00Z');
    guardarRascunho(s, 'ana@x.pt', { ...e, adultos: 40 }, '2026-11-15T12:00:00Z');
    const r = lerRascunhos(s, 'ana@x.pt');
    expect(r.map((x) => x.entrada.evento)).toEqual(['Celebração Domingo', 'ATOS']);
    expect(r[0].entrada.adultos).toBe(40);
    expect(r[0].entrada.jump).toBeNaN(); // os campos vazios continuam vazios
    expect(lerRascunhos(s, 'rui@x.pt')).toEqual([]);
    apagarRascunho(s, 'ana@x.pt', idRascunho(e));
    expect(lerRascunhos(s, 'ana@x.pt').map((x) => x.entrada.evento)).toEqual(['ATOS']);
  });
  it('ignora dados estragados', () => {
    const s = mem();
    s.setItem('caf-portal:rascunhos-presencas:ana@x.pt', '{isto não é json');
    expect(lerRascunhos(s, 'ana@x.pt')).toEqual([]);
  });
});
