// Formato português usado nos relatórios do CAF: 1.234,56 (ponto nos milhares, vírgula nas décimas).
function grupo(v: number, casas: number) {
  const [int, dec] = Math.abs(v).toFixed(casas).split('.');
  const milhares = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  // Sinal de menos tipográfico (U+2212): mesma largura dos algarismos, mais visível que o hífen.
  return (v < 0 && Number(Math.abs(v).toFixed(casas)) !== 0 ? '−' : '') + milhares + (dec ? ',' + dec : '');
}

/** Valores sempre em euros, com duas casas decimais. */
export const eur = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? '—' : `${grupo(v, 2)} €`);
export const eurK = (v: number) => `${grupo(v, 0)} €`;
/** Valor em euros sem símbolo, para tabelas densas com "(€)" no cabeçalho. "—" = sem dados. */
export const dec = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : grupo(v, 2));
/** Formato contabilístico: negativos entre parênteses, sem símbolo (o cabeçalho indica €). */
export const eurContab = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = grupo(Math.abs(v), 2);
  return v < 0 && Number(Math.abs(v).toFixed(2)) !== 0 ? `(${s})` : s;
};
/** Formato de número do Excel: negativos entre parênteses. */
export const XLSX_EUR = '#,##0.00 €;(#,##0.00 €)';
/** Números sem moeda (ex.: pessoas). Por defeito sem casas decimais. */
export const num = (v: number | null | undefined, casas = 0) => (v == null || !Number.isFinite(v) ? '—' : grupo(v, casas));
export const pct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${grupo(v * 100, 1)}%`;

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const periodo = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`;
export const r2 = (v: number) => Math.round(v * 100) / 100;

/** Converte "1.234,56", "1234.56", "-12,5 €", "(12,50)" em número. */
export function parseNumero(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/−/g, '-').replace(/\s|€|EUR/gi, '');
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, '');
  else if (lastComma >= 0 && lastDot < 0) s = s.replace(',', '.');
  const n = Number(s);
  return neg ? -n : n;
}

/** Converte datas comuns (dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd, "Nov 3, 2026", objeto Date, nº Excel) em AAAA-MM-DD. */
export function parseData(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const slug = (s: string) => norm(s).replace(/ /g, '-');

export const hoje = () => new Date().toISOString().slice(0, 10);
export const agoraISO = () => new Date().toISOString();

// ---------- datas no formato português (dd/mm/aaaa) ----------
/** AAAA-MM-DD → dd/mm/aaaa. */
export const dataPT = (iso: string | null | undefined) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};
/** dd/mm/aaaa → AAAA-MM-DD, ou null se não for uma data válida. */
export function lerDataPT(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(a, mes - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d) return null;
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/** Formata o que se escreve como dd/mm/aaaa, inserindo as barras. */
export function mascaraDataPT(texto: string): string {
  const dig = texto.replace(/\D/g, '').slice(0, 8);
  return [dig.slice(0, 2), dig.slice(2, 4), dig.slice(4, 8)].filter(Boolean).join('/');
}
