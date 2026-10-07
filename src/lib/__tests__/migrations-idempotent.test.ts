import { describe, expect, it } from 'vitest'

/**
 * Every migration from 00012 on must survive being run twice.
 *
 * Not a nicety: a migration pasted into the Supabase SQL Editor creates its
 * objects but leaves no row in the migration history, so the next `db push`
 * runs it again. 00012 used bare `create policy` statements and that re-run
 * stopped at the first one — "policy already exists" — which blocked every
 * migration queued behind it, including a security fix.
 *
 * The rules below are the house conventions the later migrations already
 * follow. Older files are exempt: they are recorded as applied everywhere and
 * will not run again.
 */

const FIRST_CHECKED = 12

const migrations = import.meta.glob('../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const checked = Object.entries(migrations)
  .map(([path, sql]) => ({ name: path.split('/').pop()!, sql }))
  .filter(({ name }) => Number(name.slice(0, 5)) >= FIRST_CHECKED)
  .sort((a, b) => a.name.localeCompare(b.name))

/**
 * What a migration executes when it runs. Comments mention statements in prose
 * ("bare `create policy`"), and a function body's statements run when the
 * function is *called*, not when the migration is applied — an `insert` in a
 * function is the function's business, not a re-run hazard. `do $$ … $$`
 * blocks do run at migration time, so they are kept.
 */
const code = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, '')
    .replace(/(create\s+or\s+replace\s+function[\s\S]*?\bas\s+)\$\$[\s\S]*?\$\$/gi, '$1$$$$')

/** Text before `index`, lower-cased with whitespace collapsed, for "was it dropped first?". */
const before = (sql: string, index: number) => sql.slice(0, index).replace(/\s+/g, ' ').toLowerCase()

function problems(raw: string): string[] {
  const sql = code(raw)
  const found: string[] = []

  for (const match of sql.matchAll(/\bcreate\s+policy\s+"([^"]+)"\s+on\s+([\w.]+)/gi)) {
    const [, name, table] = match
    if (!before(sql, match.index).includes(`drop policy if exists "${name!.toLowerCase()}" on ${table!.toLowerCase()}`)) {
      found.push(`create policy "${name}" on ${table} — not preceded by \`drop policy if exists\``)
    }
  }

  for (const match of sql.matchAll(/\bcreate\s+trigger\s+(\w+)[\s\S]*?\bon\s+([\w.]+)/gi)) {
    const [, name, table] = match
    if (!before(sql, match.index).includes(`drop trigger if exists ${name!.toLowerCase()} on ${table!.toLowerCase()}`)) {
      found.push(`create trigger ${name} on ${table} — not preceded by \`drop trigger if exists\``)
    }
  }

  for (const match of sql.matchAll(/\bcreate\s+(or\s+replace\s+)?view\s+([\w.]+)/gi)) {
    const [, orReplace, name] = match
    if (!orReplace && !before(sql, match.index).includes(`drop view if exists ${name!.toLowerCase()}`)) {
      found.push(`create view ${name} — neither \`or replace\` nor preceded by \`drop view if exists\``)
    }
  }

  if (/\bcreate\s+table\s+(?!if\s+not\s+exists)/i.test(sql)) found.push('create table without `if not exists`')
  if (/\bcreate\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists)/i.test(sql)) found.push('create index without `if not exists`')
  if (/\bcreate\s+function\b/i.test(sql)) found.push('create function without `or replace`')
  if (/\badd\s+column\s+(?!if\s+not\s+exists)/i.test(sql)) found.push('add column without `if not exists`')
  if (/\bcreate\s+extension\s+(?!if\s+not\s+exists)/i.test(sql)) found.push('create extension without `if not exists`')

  for (const match of sql.matchAll(/\binsert\s+into\b[^;]*;/gi)) {
    if (!/\bon\s+conflict\b/i.test(match[0])) found.push(`insert without \`on conflict\`: ${match[0].slice(0, 60)}…`)
  }

  return found
}

describe('migrations can be run twice', () => {
  it('finds the migrations to check', () => {
    // A glob that silently matched nothing would make every case below vacuous.
    expect(checked.map(({ name }) => name)).toContain('00012_note_images.sql')
    expect(checked.length).toBeGreaterThanOrEqual(4)
  })

  it.each(checked.map(({ name, sql }) => [name, sql] as const))('%s is idempotent', (name, sql) => {
    expect(problems(sql), `${name} would fail if run a second time`).toEqual([])
  })

  it('catches the statement that broke db push', () => {
    // The original 00012, verbatim: a bare policy.
    const original = `create policy "note_images_owner_select" on storage.objects
  for select using (bucket_id = 'note-images');`
    expect(problems(original)).toHaveLength(1)
  })

  it('does not mistake prose in a comment for a statement', () => {
    expect(problems(`-- the original used a bare create policy "x" on t\nselect 1;`)).toEqual([])
  })

  it("leaves a function body's statements to the function", () => {
    const fn = `create or replace function public.f() returns void language plpgsql as $$
begin
  insert into public.t (a) values (1);
end;
$$;`
    expect(problems(fn)).toEqual([])
  })

  it('still checks a do block, which runs with the migration', () => {
    expect(problems(`do $$ begin insert into public.t (a) values (1); end; $$;`)).toHaveLength(1)
  })
})
