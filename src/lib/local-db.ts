/**
 * Local demo database.
 *
 * A tiny localStorage-backed store that mirrors the subset of query
 * capabilities the app uses against Supabase (filter / order / limit).
 * It powers "demo mode" (no backend configured) and doubles as the offline
 * experience baseline. Every row carries id / created_at / updated_at,
 * matching the PostgreSQL schema.
 */

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like' | 'is'

export interface Filter {
  column: string
  op: FilterOp
  value: unknown
}

export interface OrderBy {
  column: string
  ascending?: boolean
}

export interface ListOptions {
  filters?: Filter[]
  orderBy?: OrderBy
  limit?: number
  offset?: number
}

interface RowShape {
  id: string
  created_at: string
  updated_at: string
  [key: string]: unknown
}

const PREFIX = 'studentos.local.'
const CHANGE_EVENT = 'studentos:local-db-change'

function storageKey(tableName: string): string {
  return `${PREFIX}${tableName}`
}

function readAll<T extends RowShape>(tableName: string): T[] {
  try {
    const raw = localStorage.getItem(storageKey(tableName))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function writeAll<T extends RowShape>(tableName: string, rows: T[]): void {
  localStorage.setItem(storageKey(tableName), JSON.stringify(rows))
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { table: tableName } }))
}

function matches(row: RowShape, filter: Filter): boolean {
  const value = row[filter.column]
  switch (filter.op) {
    case 'eq':
      return value === filter.value
    case 'neq':
      return value !== filter.value
    case 'gt':
      return typeof value === typeof filter.value && (value as never) > (filter.value as never)
    case 'gte':
      return typeof value === typeof filter.value && (value as never) >= (filter.value as never)
    case 'lt':
      return typeof value === typeof filter.value && (value as never) < (filter.value as never)
    case 'lte':
      return typeof value === typeof filter.value && (value as never) <= (filter.value as never)
    case 'in':
      return Array.isArray(filter.value) && filter.value.includes(value)
    case 'like':
      return (
        typeof value === 'string' &&
        typeof filter.value === 'string' &&
        value.toLowerCase().includes(filter.value.toLowerCase().replaceAll('%', ''))
      )
    case 'is':
      return filter.value === null ? value === null || value === undefined : value === filter.value
  }
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

export const localDb = {
  list<T extends RowShape>(tableName: string, options: ListOptions = {}): T[] {
    let rows = readAll<T>(tableName)
    if (options.filters) {
      rows = rows.filter((row) => options.filters!.every((f) => matches(row, f)))
    }
    if (options.orderBy) {
      const { column, ascending = true } = options.orderBy
      rows = [...rows].sort((a, b) => {
        const result = compare(a[column], b[column])
        return ascending ? result : -result
      })
    }
    if (options.offset) rows = rows.slice(options.offset)
    if (options.limit !== undefined) rows = rows.slice(0, options.limit)
    return rows
  },

  get<T extends RowShape>(tableName: string, id: string): T | null {
    return readAll<T>(tableName).find((row) => row.id === id) ?? null
  },

  insert<T extends RowShape>(tableName: string, values: Record<string, unknown>): T {
    const now = new Date().toISOString()
    const row = {
      id: (values.id as string | undefined) ?? crypto.randomUUID(),
      ...values,
      created_at: now,
      updated_at: now,
    } as T
    const rows = readAll<T>(tableName)
    rows.push(row)
    writeAll(tableName, rows)
    return row
  },

  update<T extends RowShape>(tableName: string, id: string, patch: Record<string, unknown>): T {
    const rows = readAll<T>(tableName)
    const index = rows.findIndex((row) => row.id === id)
    if (index === -1) throw new Error(`Row ${id} not found in ${tableName}`)
    const updated = { ...rows[index], ...patch, updated_at: new Date().toISOString() } as T
    rows[index] = updated
    writeAll(tableName, rows)
    return updated
  },

  upsert<T extends RowShape>(tableName: string, values: Record<string, unknown> & { id: string }): T {
    const existing = localDb.get<T>(tableName, values.id)
    return existing
      ? localDb.update<T>(tableName, values.id, values)
      : localDb.insert<T>(tableName, values)
  },

  remove(tableName: string, id: string): void {
    const rows = readAll(tableName)
    writeAll(
      tableName,
      rows.filter((row) => row.id !== id),
    )
  },

  count(tableName: string, filters?: Filter[]): number {
    return localDb.list(tableName, { filters }).length
  },

  /** Subscribe to changes on a table (fired after any local mutation). */
  subscribe(tableName: string, callback: () => void): () => void {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ table: string }>).detail
      if (detail.table === tableName) callback()
    }
    window.addEventListener(CHANGE_EVENT, handler)
    return () => window.removeEventListener(CHANGE_EVENT, handler)
  },
}
