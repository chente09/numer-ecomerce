/**
 * Product search used by the header magnifier. Pure functions (no Angular) so they can be unit tested.
 *
 * Matching is accent/case insensitive, understands simple Spanish plurals, accepts a word that is still being
 * typed (prefix) and tolerates small typos. Every word of the query must match somewhere in the product
 * (AND), and fields are weighted so a hit in the name outranks one in the description.
 */

export interface SearchableProduct {
  id: string;
  name: string;
  category?: string;
  categories?: string[];
  tags?: string[];
  searchKeywords?: string[];
  colors?: { name: string }[];
  description?: string;
  model?: string;
  sku?: string;
  gender?: string;
  totalStock?: number;
}

export interface SearchableCategory {
  id: string;
  name: string;
}

export interface SearchHit<T extends SearchableProduct = SearchableProduct> {
  product: T;
  score: number;
}

export interface CategoryHit<C extends SearchableCategory = SearchableCategory> {
  category: C;
  score: number;
}

export interface Segment {
  text: string;
  match: boolean;
}

interface Field {
  words: string[];
  stems: string[];
  weight: number;
  /** Typo tolerance only on short, meaningful fields (not on long descriptions). */
  fuzzy: boolean;
}

export interface IndexedProduct<T extends SearchableProduct = SearchableProduct> {
  product: T;
  name: string;
  fields: Field[];
  inStock: boolean;
}

interface Token {
  text: string;
  stem: string;
  maxEdits: number;
}

const GENDER_WORDS: Record<string, string> = {
  man: 'hombre hombres caballero',
  woman: 'mujer mujeres dama',
  boy: 'nino ninos',
  girl: 'nina ninas',
  unisex: 'unisex'
};

const WEIGHTS = { name: 100, category: 45, tags: 40, colors: 35, code: 35, gender: 30, description: 12 };

/** Lowercase without accents, keeping the exact length (1:1) so match positions map back to the original text. */
export function fold(text: string): string {
  return (text ?? '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Folded text where everything that is not a letter or digit becomes a single space. */
export function normalize(text: string): string {
  return fold(text).replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Light Spanish singularization: camisetas -> camiseta, pantalones -> pantalon, mujeres -> mujer. */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  if (/[nrldz]es$/.test(word) && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function toField(values: (string | undefined)[], weight: number, fuzzy: boolean): Field {
  const words = normalize(values.filter(Boolean).join(' ')).split(' ').filter(Boolean);
  return { words, stems: words.map(stem), weight, fuzzy };
}

export function buildIndex<T extends SearchableProduct>(
  products: T[],
  categories: SearchableCategory[] = []
): IndexedProduct<T>[] {
  const categoryName = new Map(categories.map(c => [c.id, c.name]));
  return products.map(product => {
    const categoryIds = [product.category, ...(product.categories ?? [])].filter((c): c is string => !!c);
    const categoryNames = categoryIds.map(id => categoryName.get(id) ?? id);
    return {
      product,
      name: normalize(product.name),
      inStock: (product.totalStock ?? 0) > 0,
      fields: [
        toField([product.name], WEIGHTS.name, true),
        toField(categoryNames, WEIGHTS.category, true),
        toField([...(product.tags ?? []), ...(product.searchKeywords ?? [])], WEIGHTS.tags, true),
        toField((product.colors ?? []).map(c => c.name), WEIGHTS.colors, true),
        toField([product.model, product.sku], WEIGHTS.code, false),
        toField([GENDER_WORDS[product.gender ?? ''] ?? ''], WEIGHTS.gender, false),
        toField([product.description], WEIGHTS.description, false)
      ]
    };
  });
}

function tokenize(query: string): Token[] {
  return normalize(query)
    .split(' ')
    .filter(t => t.length >= 2)
    .map(text => ({
      text,
      stem: stem(text),
      maxEdits: text.length >= 7 ? 2 : text.length >= 4 ? 1 : 0
    }));
}

/** Edit distance counting a swap of two letters as one edit; stops early once it exceeds `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows.push(new Array(b.length + 1).fill(0));
    rows[i][0] = i;
  }
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = d;
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > max) return max + 1;
  }
  return rows[a.length][b.length];
}

/** How well a token matches a field: 1 exact word, 0.85 word being typed, 0.5 inside a word, ~0.5 typo. */
function matchField(token: Token, field: Field): number {
  let best = 0;
  for (let i = 0; i < field.words.length; i++) {
    const word = field.words[i];
    const wordStem = field.stems[i];
    if (word === token.text || wordStem === token.stem) return 1;
    if (word.startsWith(token.text) || wordStem.startsWith(token.stem)) {
      best = Math.max(best, 0.85);
    } else if (token.text.length >= 3 && word.includes(token.text)) {
      best = Math.max(best, 0.5);
    } else if (field.fuzzy && token.maxEdits > 0) {
      const d = editDistance(token.text, word, token.maxEdits);
      if (d <= token.maxEdits) best = Math.max(best, 0.6 - 0.1 * d);
    }
  }
  return best;
}

function scoreProduct(item: IndexedProduct, tokens: Token[], phrase: string): number {
  let total = 0;
  for (const token of tokens) {
    let tokenScore = 0;
    for (const field of item.fields) {
      const m = matchField(token, field);
      if (m > 0) tokenScore = Math.max(tokenScore, field.weight * m);
    }
    if (tokenScore === 0) return 0;
    total += tokenScore;
  }
  if (item.name.startsWith(phrase)) total += 70;
  else if (item.name.includes(phrase)) total += 40;
  return total;
}

/** Products matching every word of the query, best first (in stock before out of stock on equal score). */
export function searchProducts<T extends SearchableProduct>(
  index: IndexedProduct<T>[],
  query: string,
  limit = 8
): SearchHit<T>[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const phrase = normalize(query);
  const hits: (SearchHit<T> & { inStock: boolean })[] = [];
  for (const item of index) {
    const score = scoreProduct(item, tokens, phrase);
    if (score > 0) hits.push({ product: item.product, score, inStock: item.inStock });
  }
  hits.sort((a, b) =>
    b.score - a.score ||
    Number(b.inStock) - Number(a.inStock) ||
    a.product.name.localeCompare(b.product.name)
  );
  return hits.slice(0, limit).map(({ product, score }) => ({ product, score }));
}

/** Total number of products that match, to show "see all N results". */
export function countMatches<T extends SearchableProduct>(index: IndexedProduct<T>[], query: string): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;
  const phrase = normalize(query);
  return index.reduce((n, item) => n + (scoreProduct(item, tokens, phrase) > 0 ? 1 : 0), 0);
}

export function searchCategories<C extends SearchableCategory>(
  categories: C[],
  query: string,
  limit = 3
): CategoryHit<C>[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const hits: CategoryHit<C>[] = [];
  for (const category of categories) {
    const field = toField([category.name], 100, true);
    let total = 0;
    for (const token of tokens) {
      const m = matchField(token, field);
      if (m === 0) { total = 0; break; }
      total += m * 100;
    }
    if (total > 0) hits.push({ category, score: total });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Splits `text` into plain and matched parts for highlighting what the customer typed. */
export function highlight(text: string, query: string): Segment[] {
  const folded = fold(text);
  if (folded.length !== text.length) return [{ text, match: false }];
  const marks = new Array<boolean>(text.length).fill(false);
  for (const token of tokenize(query)) {
    let found = false;
    for (const needle of [token.text, token.stem]) {
      if (needle.length < 2) continue;
      let from = 0;
      for (let i = folded.indexOf(needle, from); i >= 0; i = folded.indexOf(needle, from)) {
        found = true;
        for (let k = i; k < i + needle.length; k++) marks[k] = true;
        from = i + needle.length;
      }
      if (found) break;
    }
    // A typo ("boxre") is not in the text: mark the whole word it was matched to
    if (!found && token.maxEdits > 0) {
      for (const m of folded.matchAll(/[a-z0-9]+/g)) {
        if (editDistance(token.text, m[0], token.maxEdits) <= token.maxEdits) {
          for (let k = m.index; k < m.index + m[0].length; k++) marks[k] = true;
        }
      }
    }
  }
  const segments: Segment[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = segments[segments.length - 1];
    if (last && last.match === marks[i]) last.text += text[i];
    else segments.push({ text: text[i], match: marks[i] });
  }
  return segments;
}
