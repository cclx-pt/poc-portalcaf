import { describe, expect, it } from 'vitest';
import { dataPT, lerDataPT, mascaraDataPT } from '../../src/lib/format';

describe('datas no formato português dd/mm/aaaa', () => {
  it('mostra AAAA-MM-DD como dd/mm/aaaa', () => {
    expect(dataPT('2026-11-15')).toBe('15/11/2026');
    expect(dataPT('')).toBe('');
    expect(dataPT(null)).toBe('');
  });
  it('lê dd/mm/aaaa (e d/m/aaaa) para AAAA-MM-DD, recusa datas impossíveis', () => {
    expect(lerDataPT('15/11/2026')).toBe('2026-11-15');
    expect(lerDataPT('5/3/2026')).toBe('2026-03-05');
    expect(lerDataPT('31/02/2026')).toBeNull();
    expect(lerDataPT('11/15/2026')).toBeNull();
    expect(lerDataPT('2026-11-15')).toBeNull();
    expect(lerDataPT('15/11')).toBeNull();
  });
  it('insere as barras enquanto se escreve', () => {
    expect(mascaraDataPT('15')).toBe('15');
    expect(mascaraDataPT('151')).toBe('15/1');
    expect(mascaraDataPT('15112026')).toBe('15/11/2026');
    expect(mascaraDataPT('15/11/2026x9')).toBe('15/11/2026');
  });
});
