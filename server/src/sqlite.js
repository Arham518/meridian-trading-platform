// Minimal better-sqlite3-compatible wrapper over Node's built-in node:sqlite
// (no native build step needed).
import { DatabaseSync } from 'node:sqlite';

export default class Database {
  constructor(path) {
    this._db = new DatabaseSync(path);
    this._depth = 0;
  }
  exec(sql) { return this._db.exec(sql); }
  pragma(str) {
    const rows = this._db.prepare(`PRAGMA ${str}`).all();
    return rows;
  }
  prepare(sql) {
    const st = this._db.prepare(sql);
    const clean = (a) => a.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
    const row = (r) => (r ? { ...r } : r);
    return {
      run: (...a) => { const r = st.run(...clean(a)); return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }; },
      get: (...a) => row(st.get(...clean(a))),
      all: (...a) => st.all(...clean(a)).map(row),
    };
  }
  transaction(fn) {
    return (...args) => {
      const outer = this._depth === 0;
      const sp = `sp_${this._depth}`;
      this._db.exec(outer ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
      this._depth++;
      try {
        const r = fn(...args);
        this._depth--;
        this._db.exec(outer ? 'COMMIT' : `RELEASE ${sp}`);
        return r;
      } catch (e) {
        this._depth--;
        this._db.exec(outer ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
        throw e;
      }
    };
  }
  close() { this._db.close(); }
}
