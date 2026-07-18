/**
 * Repository interface layer — Seaphore Build Bible §Services.
 *
 * A Repository<T> is a narrow, technology-agnostic contract for reading and
 * writing a single aggregate. Concrete implementations (Supabase, in-memory,
 * remote API) implement this interface so feature code can be swapped between
 * data sources without touching UI.
 *
 * All mutations go through TanStack Server Functions (see `src/services/*.service.ts`)
 * so that RLS, audit logging, and confidence enforcement remain server-side.
 */

export type Id = string;

export interface ListOptions {
  limit?: number;
  offset?: number;
  /** Field names to sort by, prefix with `-` for descending. */
  orderBy?: string[];
  /** Free-text search (repository-defined semantics). */
  q?: string;
}

export interface ListResult<T> {
  rows: T[];
  total: number;
}

export interface Repository<T, TCreate = Partial<T>, TUpdate = Partial<T>> {
  list(opts?: ListOptions): Promise<ListResult<T>>;
  getById(id: Id): Promise<T | null>;
  create?(input: TCreate): Promise<T>;
  update?(id: Id, patch: TUpdate): Promise<T>;
  remove?(id: Id): Promise<void>;
}
