import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { getLocalRows } from './localData';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isSupabaseEnabled = import.meta.env.VITE_USE_SUPABASE === 'true';

// Runtime debug: confirm whether Supabase is enabled and which URL is configured.
// This intentionally does not log the anon key.
try {
  console.info('[supabase] enabled=%s url=%s', String(isSupabaseEnabled), String(supabaseUrl));
} catch {
  // ignore logging errors in non-browser environments
}

console.log('Supabase configuration:', {
  enabled: isSupabaseEnabled,
  hasUrl: Boolean(supabaseUrl),
  hasAnonKey: Boolean(supabaseAnonKey),
});

type QueryResult = {
  data: unknown;
  error: null;
  count?: number;
};

type Filter = {
  kind: 'eq' | 'in';
  column: string;
  value: unknown;
};

type LocalRow = Record<string, unknown>;
type LocalTables = Record<string, LocalRow[]>;
type Operation = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

const LOCAL_DATA_KEY = 'manabi-local-data';
const LOCAL_AUTH_KEY = 'manabi-local-auth';

function readStoredTables(): LocalTables {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_DATA_KEY) ?? '{}') as LocalTables;
  } catch {
    localStorage.removeItem(LOCAL_DATA_KEY);
    return {};
  }
}

function readLocalTable(table: string): LocalRow[] {
  if (table === 'subjects' || table === 'questions') {
    return getLocalRows(table) as unknown as LocalRow[];
  }
  if (table === 'profiles') {
    try {
      const auth = JSON.parse(localStorage.getItem(LOCAL_AUTH_KEY) ?? 'null') as { profile?: LocalRow } | null;
      return auth?.profile ? [auth.profile] : [];
    } catch {
      return [];
    }
  }
  return readStoredTables()[table] ?? [];
}

function getCurrentLocalUserId() {
  try {
    const auth = JSON.parse(localStorage.getItem(LOCAL_AUTH_KEY) ?? 'null') as { profile?: { id?: string } } | null;
    return auth?.profile?.id ?? null;
  } catch {
    return null;
  }
}

function scopeLocalRows(table: string, rows: LocalRow[]) {
  const userId = getCurrentLocalUserId();
  if (!userId) return rows;
  if (['practice_sessions', 'exam_sessions', 'exam_targets', 'ai_chat_messages'].includes(table)) {
    return rows.filter(row => row.user_id === userId);
  }
  if (table === 'session_answers') {
    const ownSessions = new Set(readStoredTables().practice_sessions
      ?.filter(row => row.user_id === userId)
      .map(row => row.id) ?? []);
    return rows.filter(row => ownSessions.has(row.session_id));
  }
  if (table === 'exam_answers') {
    const ownSessions = new Set(readStoredTables().exam_sessions
      ?.filter(row => row.user_id === userId)
      .map(row => row.id) ?? []);
    return rows.filter(row => ownSessions.has(row.exam_session_id));
  }
  return rows;
}

function writeLocalTable(table: string, rows: LocalRow[]) {
  if (table === 'profiles') {
    const raw = localStorage.getItem(LOCAL_AUTH_KEY);
    if (!raw || rows.length === 0) return;
    const auth = JSON.parse(raw) as { email: string; profile: LocalRow };
    localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify({ ...auth, profile: rows[0] }));
    return;
  }
  const tables = readStoredTables();
  tables[table] = rows;
  localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(tables));
}

function createLocalId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeLocalRow(table: string, value: unknown): LocalRow {
  const row = value && typeof value === 'object' ? { ...(value as LocalRow) } : {};
  const now = new Date().toISOString();
  if (!row.id) row.id = createLocalId();
  if (table === 'session_answers' || table === 'exam_answers') {
    row.answered_at ??= now;
  } else {
    row.created_at ??= now;
  }
  if (table === 'practice_sessions' || table === 'exam_sessions') {
    row.correct_answers ??= 0;
    row.completed_at ??= null;
  }
  return row;
}

class LocalQuery {
  private filters: Filter[] = [];
  private singleResult = false;
  private headOnly = false;
  private operation: Operation = 'select';
  private writePayload: unknown = null;
  private conflictColumn: string | null = null;
  private orderBy: { column: string; ascending: boolean } | null = null;
  private rowLimit: number | null = null;
  private rowRange: { from: number; to: number } | null = null;

  constructor(private table: string) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    this.headOnly = options?.head === true;
    return this;
  }

  insert(payload: unknown) {
    this.operation = 'insert';
    this.writePayload = payload;
    return this;
  }

  update(payload: unknown) {
    this.operation = 'update';
    this.writePayload = payload;
    return this;
  }

  upsert(payload: unknown, options?: { onConflict?: string }) {
    this.operation = 'upsert';
    this.writePayload = payload;
    this.conflictColumn = options?.onConflict ?? 'id';
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: 'eq', column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ kind: 'in', column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number) {
    this.rowLimit = count;
    return this;
  }

  range(from: number, to: number) {
    this.rowRange = { from, to };
    return this;
  }

  single() {
    this.singleResult = true;
    return this;
  }

  maybeSingle() {
    this.singleResult = true;
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
  }

  private resolve(): QueryResult {
    const existing = readLocalTable(this.table);
    let result: LocalRow[];

    if (this.operation === 'insert') {
      const values = Array.isArray(this.writePayload) ? this.writePayload : [this.writePayload];
      result = values.map(value => normalizeLocalRow(this.table, value));
      writeLocalTable(this.table, [...existing, ...result]);
    } else if (this.operation === 'update') {
      const patch = this.writePayload && typeof this.writePayload === 'object'
        ? this.writePayload as LocalRow
        : {};
      result = [];
      const next = existing.map(row => {
        if (!this.matches(row)) return row;
        const updated = { ...row, ...patch };
        result.push(updated);
        return updated;
      });
      writeLocalTable(this.table, next);
    } else if (this.operation === 'upsert') {
      const values = Array.isArray(this.writePayload) ? this.writePayload : [this.writePayload];
      const next = [...existing];
      result = values.map(value => {
        const candidate = normalizeLocalRow(this.table, value);
        const conflictIndex = next.findIndex(row => row[this.conflictColumn ?? 'id'] === candidate[this.conflictColumn ?? 'id']);
        if (conflictIndex >= 0) {
          next[conflictIndex] = { ...next[conflictIndex], ...candidate, id: next[conflictIndex].id };
          return next[conflictIndex];
        }
        next.push(candidate);
        return candidate;
      });
      writeLocalTable(this.table, next);
    } else if (this.operation === 'delete') {
      result = existing.filter(row => this.matches(row));
      writeLocalTable(this.table, existing.filter(row => !this.matches(row)));
    } else {
      result = this.applyFilters(scopeLocalRows(this.table, existing));
      if (this.orderBy) {
        const { column, ascending } = this.orderBy;
        result = [...result].sort((a, b) => {
          const left = a[column];
          const right = b[column];
          const comparison = typeof left === 'number' && typeof right === 'number'
            ? left - right
            : String(left ?? '').localeCompare(String(right ?? ''));
          return ascending ? comparison : -comparison;
        });
      }
      if (this.rowRange !== null) {
        result = result.slice(this.rowRange.from, this.rowRange.to + 1);
      }
      if (this.rowLimit !== null) result = result.slice(0, this.rowLimit);
    }

    const data = this.headOnly ? null : this.singleResult ? result[0] ?? null : result;
    return { data, error: null, count: result.length };
  }

  private applyFilters(rows: unknown[]) {
    return rows.filter((row): row is LocalRow => Boolean(row) && typeof row === 'object' && this.matches(row as LocalRow));
  }

  private matches(item: LocalRow) {
    return this.filters.every((filter) => {
      if (filter.kind === 'eq') return item[filter.column] === filter.value;
      return Array.isArray(filter.value) && filter.value.includes(item[filter.column]);
    });
  }
}

const localSupabase = {
  from(table: string) {
    return new LocalQuery(table);
  },
  auth: {
    async getSession() {
      return { data: { session: null }, error: null };
    },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async signInWithPassword() {
      return { data: { user: null, session: null }, error: null };
    },
    async signInWithOAuth() {
      return {
        data: { provider: null, url: null },
        error: new Error('Google login requires Supabase to be enabled.'),
      };
    },
    async signUp() {
      return { data: { user: null, session: null }, error: null };
    },
    async signOut() {
      return { error: null };
    },
    async updateUser() {
      return { data: { user: null }, error: new Error('Password changes require Supabase to be enabled.') };
    },
  },
  async rpc() {
    return { data: null, error: new Error('Admin operations require Supabase to be enabled.') };
  },
};

export const supabase = isSupabaseEnabled && supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : localSupabase as unknown as SupabaseClient;
