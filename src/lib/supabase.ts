import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { getLocalRows } from './localData';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isSupabaseEnabled = import.meta.env.VITE_USE_SUPABASE === 'true';

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

class LocalQuery {
  private filters: Filter[] = [];
  private singleResult = false;
  private headOnly = false;
  private writePayload: unknown = null;

  constructor(private table: string) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    this.headOnly = options?.head === true;
    return this;
  }

  insert(payload: unknown) {
    this.writePayload = payload;
    return this;
  }

  update(payload: unknown) {
    this.writePayload = payload;
    return this;
  }

  upsert(payload: unknown) {
    this.writePayload = payload;
    return this;
  }

  delete() {
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

  order() {
    return this;
  }

  limit() {
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
    const rows = this.writePayload ? [this.writePayload] : this.applyFilters(getLocalRows(this.table));
    const data = this.headOnly ? null : this.singleResult ? rows[0] ?? null : rows;
    return { data, error: null, count: rows.length };
  }

  private applyFilters(rows: unknown[]) {
    return rows.filter((row) => {
      if (!row || typeof row !== 'object') return false;
      const item = row as Record<string, unknown>;
      return this.filters.every((filter) => {
        if (filter.kind === 'eq') return item[filter.column] === filter.value;
        return Array.isArray(filter.value) && filter.value.includes(item[filter.column]);
      });
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
    async signUp() {
      return { data: { user: null, session: null }, error: null };
    },
    async signOut() {
      return { error: null };
    },
    async updateUser() {
      return { data: { user: null }, error: null };
    },
  },
};

export const supabase = isSupabaseEnabled && supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : localSupabase as unknown as SupabaseClient;
