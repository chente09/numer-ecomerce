// Reads public collections through the Firestore REST API (the same public rules the web app uses), so the build
// can generate pages without credentials. Values come back in Firestore's typed format; this decodes them.

type FirestoreValue = Record<string, any>;

export function decodeValue(value: FirestoreValue | null | undefined): unknown {
  if (!value) return null;
  if ('stringValue' in value) return value['stringValue'];
  if ('integerValue' in value) return Number(value['integerValue']);
  if ('doubleValue' in value) return Number(value['doubleValue']);
  if ('booleanValue' in value) return value['booleanValue'];
  if ('timestampValue' in value) return new Date(value['timestampValue']);
  if ('arrayValue' in value) return (value['arrayValue'].values ?? []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value['mapValue'].fields ?? {});
  if ('referenceValue' in value) return value['referenceValue'];
  return null;
}

export function decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields ?? {})) out[key] = decodeValue(value);
  return out;
}

/** A REST document as a plain object, with its id (last segment of the path) and update time. */
export function decodeDocument(doc: { name: string; fields?: Record<string, FirestoreValue>; updateTime?: string }): Record<string, any> {
  const id = doc.name.split('/').pop() as string;
  return {
    ...decodeFields(doc.fields ?? {}),
    id,
    _updateTime: doc.updateTime ? new Date(doc.updateTime) : null
  };
}

export interface FetchCollectionOptions {
  project: string;
  apiKey: string;
  collection: string;
  fetchImpl?: typeof fetch;
  pageSize?: number;
}

/** Every document of a collection, following the pagination. Throws on any HTTP error. */
export async function fetchCollection(options: FetchCollectionOptions): Promise<Record<string, any>[]> {
  const { project, apiKey, collection, fetchImpl = fetch, pageSize = 300 } = options;
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${collection}`;
  const documents: Record<string, any>[] = [];
  let pageToken = '';
  do {
    const url = `${base}?pageSize=${pageSize}&key=${encodeURIComponent(apiKey)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Firestore ${collection}: HTTP ${response.status}`);
    }
    const page = await response.json() as { documents?: any[]; nextPageToken?: string };
    for (const doc of page.documents ?? []) documents.push(decodeDocument(doc));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return documents;
}
