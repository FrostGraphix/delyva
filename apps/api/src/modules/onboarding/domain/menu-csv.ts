/** Header row of the menu import template. */
export const MENU_CSV_COLUMNS = [
  'category',
  'name',
  'description',
  'price_naira',
  'available',
] as const;
/** Max data rows per import. */
export const MAX_MENU_ROWS = 500;
/** Max price in kobo (₦10,000,000). */
export const MAX_PRICE_MINOR = 1_000_000_000;

/** A problem on a 1-based CSV line. */
export interface CsvLineError {
  readonly line: number;
  readonly message: string;
}

/** Parsed draft menu (kobo prices). */
export interface ParsedMenu {
  readonly categories: {
    name: string;
    items: { name: string; description: string | null; priceMinor: number; available: boolean }[];
  }[];
}

/** RFC 4180 tokenizer; returns rows with the 1-based line each row starts on. */
export function parseCsv(text: string): { line: number; cells: string[] }[] {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src.charAt(i);
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else {
        if (ch === '\n') line += 1;
        cell += ch;
      }
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      cells.push(cell);
      rows.push({ line: rowLine, cells });
      cells = [];
      cell = '';
      line += 1;
      rowLine = line;
    } else cell += ch;
  }
  if (cell !== '' || cells.length > 0) {
    cells.push(cell);
    rows.push({ line: rowLine, cells });
  }
  return rows.filter((r) => r.cells.some((c) => c.trim() !== ''));
}

/** Naira string ("1500" or "1500.50") → integer kobo without floats; null when invalid. */
export function nairaToKobo(value: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  const kobo = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return kobo <= MAX_PRICE_MINOR ? kobo : null;
}

function parseAvailable(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (s === '' || s === 'yes' || s === 'true' || s === '1') return true;
  if (s === 'no' || s === 'false' || s === '0') return false;
  return null;
}

function rowErrors(cells: string[]): string[] {
  const errs: string[] = [];
  if (cells.length !== MENU_CSV_COLUMNS.length) {
    return [`expected ${String(MENU_CSV_COLUMNS.length)} columns, found ${String(cells.length)}`];
  }
  const [category = '', name = '', description = '', price = '', available = ''] = cells;
  if (category.trim().length < 1 || category.trim().length > 60)
    errs.push('category is required (≤ 60 chars)');
  if (name.trim().length < 1 || name.trim().length > 120)
    errs.push('name is required (≤ 120 chars)');
  if (description.length > 500) errs.push('description is too long (≤ 500 chars)');
  if (nairaToKobo(price) === null)
    errs.push('price_naira must be a positive amount like 1500 or 1500.50');
  if (parseAvailable(available) === null) errs.push('available must be yes or no');
  return errs;
}

/** Parses and validates a menu CSV. Every bad row is reported with its line number. */
export function parseMenuCsv(text: string): { menu: ParsedMenu; errors: CsvLineError[] } {
  const rows = parseCsv(text);
  const errors: CsvLineError[] = [];
  const header = rows[0]?.cells.map((c) => c.trim().toLowerCase()) ?? [];
  if (header.join(',') !== MENU_CSV_COLUMNS.join(',')) {
    return {
      menu: { categories: [] },
      errors: [{ line: 1, message: `header must be ${MENU_CSV_COLUMNS.join(',')}` }],
    };
  }
  const data = rows.slice(1);
  if (data.length === 0) errors.push({ line: 2, message: 'the file has no menu items' });
  if (data.length > MAX_MENU_ROWS)
    errors.push({ line: 1, message: `at most ${String(MAX_MENU_ROWS)} items per import` });
  const byCategory = new Map<string, ParsedMenu['categories'][number]>();
  const seen = new Set<string>();
  for (const { line, cells } of data) {
    const errs = rowErrors(cells);
    const [category = '', name = '', description = '', price = '', available = ''] = cells.map(
      (c) => c.trim(),
    );
    const dupKey = `${category.toLowerCase()}\u0000${name.toLowerCase()}`;
    if (errs.length === 0 && seen.has(dupKey)) errs.push('duplicate item in the same category');
    if (errs.length > 0) {
      errors.push(...errs.map((message) => ({ line, message })));
      continue;
    }
    seen.add(dupKey);
    const cat = byCategory.get(category) ?? { name: category, items: [] };
    byCategory.set(category, cat);
    cat.items.push({
      name,
      description: description === '' ? null : description,
      priceMinor: nairaToKobo(price) ?? 0,
      available: parseAvailable(available) ?? true,
    });
  }
  return { menu: { categories: [...byCategory.values()] }, errors };
}

/** Template served to vendors. */
export function menuCsvTemplate(): string {
  return `${MENU_CSV_COLUMNS.join(',')}\nRice dishes,Jollof rice,"Smoky party jollof, with plantain",2500,yes\nSwallow,Amala and ewedu,,3000.50,yes\n`;
}
