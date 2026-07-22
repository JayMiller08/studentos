import { type Filter, type ListOptions, localDb } from '@/lib/local-db'
import { supabase } from '@/lib/supabase'

export type { Filter, FilterOp, ListOptions, OrderBy } from '@/lib/local-db'

/**
 * Unified table access.
 *
 * Every feature service goes through `table<Row>(name)`, which talks to
 * Supabase (PostgREST + RLS) when configured and to the local demo store
 * otherwise. This keeps feature code identical across both modes and gives
 * the app a real offline/demo story.
 */

export class DbError extends Error {
  readonly table: string
  readonly operation: string

  constructor(tableName: string, operation: string, cause: string) {
    super(`${operation} on "${tableName}" failed: ${cause}`)
    this.name = 'DbError'
    this.table = tableName
    this.operation = operation
  }
}

export interface Identifiable {
  id: string
}

export interface TableClient<Row extends Identifiable> {
  list(options?: ListOptions): Promise<Row[]>
  get(id: string): Promise<Row | null>
  insert(values: Record<string, unknown>): Promise<Row>
  upsert(values: Record<string, unknown> & { id: string }): Promise<Row>
  update(id: string, patch: Record<string, unknown>): Promise<Row>
  remove(id: string): Promise<void>
  count(filters?: Filter[]): Promise<number>
}

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST builder is
   dynamically typed without generated schema types; rows are cast at this
   single boundary. */

function applyFilters(query: any, filters: Filter[] | undefined): any {
  if (!filters) return query
  let q = query
  for (const f of filters) {
    switch (f.op) {
      case 'eq':
        q = q.eq(f.column, f.value)
        break
      case 'neq':
        q = q.neq(f.column, f.value)
        break
      case 'gt':
        q = q.gt(f.column, f.value)
        break
      case 'gte':
        q = q.gte(f.column, f.value)
        break
      case 'lt':
        q = q.lt(f.column, f.value)
        break
      case 'lte':
        q = q.lte(f.column, f.value)
        break
      case 'in':
        q = q.in(f.column, f.value as unknown[])
        break
      case 'like':
        q = q.ilike(f.column, `%${String(f.value)}%`)
        break
      case 'is':
        q = q.is(f.column, f.value)
        break
    }
  }
  return q
}

function supabaseTable<Row extends Identifiable>(tableName: string): TableClient<Row> {
  const client = supabase!
  return {
    async list(options: ListOptions = {}) {
      let query: any = client.from(tableName).select('*')
      query = applyFilters(query, options.filters)
      if (options.orderBy) {
        query = query.order(options.orderBy.column, {
          ascending: options.orderBy.ascending ?? true,
        })
      }
      if (options.offset !== undefined) {
        query = query.range(options.offset, options.offset + (options.limit ?? 1000) - 1)
      } else if (options.limit !== undefined) {
        query = query.limit(options.limit)
      }
      const { data, error } = await query
      if (error) throw new DbError(tableName, 'list', error.message)
      return (data ?? []) as Row[]
    },

    async get(id: string) {
      const { data, error } = await client.from(tableName).select('*').eq('id', id).maybeSingle()
      if (error) throw new DbError(tableName, 'get', error.message)
      return (data as Row | null) ?? null
    },

    async insert(values) {
      const { data, error } = await client.from(tableName).insert(values).select().single()
      if (error) throw new DbError(tableName, 'insert', error.message)
      return data as Row
    },

    async upsert(values) {
      const { data, error } = await client.from(tableName).upsert(values).select().single()
      if (error) throw new DbError(tableName, 'upsert', error.message)
      return data as Row
    },

    async update(id, patch) {
      const { data, error } = await client
        .from(tableName)
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new DbError(tableName, 'update', error.message)
      return data as Row
    },

    async remove(id) {
      const { error } = await client.from(tableName).delete().eq('id', id)
      if (error) throw new DbError(tableName, 'remove', error.message)
    },

    async count(filters) {
      let query: any = client.from(tableName).select('id', { count: 'exact', head: true })
      query = applyFilters(query, filters)
      const { count, error } = await query
      if (error) throw new DbError(tableName, 'count', error.message)
      return count ?? 0
    },
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

function localTable<Row extends Identifiable>(tableName: string): TableClient<Row> {
  type LocalRow = Row & { created_at: string; updated_at: string; [key: string]: unknown }
  return {
    list: async (options) => localDb.list<LocalRow>(tableName, options),
    get: async (id) => localDb.get<LocalRow>(tableName, id),
    insert: async (values) => localDb.insert<LocalRow>(tableName, values),
    upsert: async (values) => localDb.upsert<LocalRow>(tableName, values),
    update: async (id, patch) => localDb.update<LocalRow>(tableName, id, patch),
    remove: async (id) => {
      localDb.remove(tableName, id)
    },
    count: async (filters) => localDb.count(tableName, filters),
  }
}

export function table<Row extends Identifiable>(tableName: string): TableClient<Row> {
  return supabase ? supabaseTable<Row>(tableName) : localTable<Row>(tableName)
}

/** Convenience: filter rows to the signed-in user. Supabase RLS enforces this
 * server-side regardless; the explicit filter keeps demo mode identical and
 * lets PostgREST use the user_id index. */
export function byUser(userId: string, extra: Filter[] = []): Filter[] {
  return [{ column: 'user_id', op: 'eq', value: userId }, ...extra]
}
