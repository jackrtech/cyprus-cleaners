import { vi } from 'vitest'

type QueryResult<T = unknown> = { data: T; error: { message: string; code?: string } | null }

// A minimal, chainable stand-in for the Supabase query builder used throughout
// the app's API routes. Every chain method returns the same mock so calls can
// be composed in whatever order a route happens to use (`.select().eq()`,
// `.eq().select()`, etc.) — the terminal await (`single`, `maybeSingle`, or
// awaiting the builder itself, since the real builder is a thenable) resolves
// to whatever `result` holds.
function createQueryBuilderMock<T = unknown>(result: QueryResult<T>) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: QueryResult<T>) => unknown) => Promise.resolve(result).then(resolve),
  }
  return builder
}

const DEFAULT_STORAGE_BUCKET = {
  createSignedUrl: vi.fn(() => Promise.resolve({ data: null, error: null })),
  createSignedUrls: vi.fn(() => Promise.resolve({ data: [], error: null })),
  createSignedUploadUrl: vi.fn(() => Promise.resolve({ data: null, error: null })),
  remove: vi.fn(() => Promise.resolve({ data: null, error: null })),
}

// createAdminClient()/createClient() both return an object shaped like this
// (a subset of SupabaseClient covering what API routes actually call).
export function createMockSupabaseClient() {
  const fromResults = new Map<string, QueryResult[]>()
  const storageBuckets = new Map<string, Record<string, unknown>>()

  const client = {
    from: vi.fn((table: string) => {
      const queue = fromResults.get(table)
      const result: QueryResult = !queue || queue.length === 0
        ? { data: null, error: null }
        : queue.length > 1 ? queue.shift()! : queue[0]
      return createQueryBuilderMock(result)
    }),
    storage: {
      from: vi.fn((bucket: string) => storageBuckets.get(bucket) ?? DEFAULT_STORAGE_BUCKET),
    },
  }

  // Sets what every `.from(table)` call resolves to from here on — replaces
  // any previous queue for that table, so it's safe to call once per test
  // without needing a reset between tests. Covers the common case: a route
  // that only touches this table once, or touches it several times but
  // always expects the same thing back.
  function setFromResult<T>(table: string, result: QueryResult<T>) {
    fromResults.set(table, [result as QueryResult])
  }

  // For a route that queries the same table more than once for *different*
  // reasons within a single request (e.g. an existence check that should
  // come back empty, then an insert that should come back with a row) —
  // each `.from(table)` call consumes the next result in order; the last one
  // is reused for any further calls past the end of the list.
  function queueFromResults<T>(table: string, ...results: QueryResult<T>[]) {
    fromResults.set(table, results as QueryResult[])
  }

  function setStorageBucket(bucket: string, impl: Record<string, unknown>) {
    storageBuckets.set(bucket, impl)
  }

  return { client, setFromResult, queueFromResults, setStorageBucket }
}
