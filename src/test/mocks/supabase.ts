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
// `setFromResult(table, result)` controls what the *next* `.from(table)`
// call resolves to — call it again mid-test to change the response between
// assertions (e.g. "not found" then "found" after an insert).
export function createMockSupabaseClient() {
  const fromResults = new Map<string, QueryResult>()
  const storageBuckets = new Map<string, Record<string, unknown>>()

  const client = {
    from: vi.fn((table: string) => {
      const result = fromResults.get(table) ?? { data: null, error: null }
      return createQueryBuilderMock(result)
    }),
    storage: {
      from: vi.fn((bucket: string) => storageBuckets.get(bucket) ?? DEFAULT_STORAGE_BUCKET),
    },
  }

  function setFromResult<T>(table: string, result: QueryResult<T>) {
    fromResults.set(table, result as QueryResult)
  }

  function setStorageBucket(bucket: string, impl: Record<string, unknown>) {
    storageBuckets.set(bucket, impl)
  }

  return { client, setFromResult, setStorageBucket }
}
