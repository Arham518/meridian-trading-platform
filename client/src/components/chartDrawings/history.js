// Undo / redo over whole-drawing-list snapshots (JSON strings: cheap, immutable, easy to persist).
export class History {
  constructor(limit = 100) { this.limit = limit; this.reset('[]'); }
  reset(snapshot) { this.past = []; this.future = []; this.current = snapshot; }
  /** Records a new state; returns false if nothing changed. */
  push(snapshot) {
    if (snapshot === this.current) return false;
    this.past.push(this.current); if (this.past.length > this.limit) this.past.shift();
    this.current = snapshot; this.future = []; return true;
  }
  undo() { if (!this.past.length) return null; this.future.push(this.current); this.current = this.past.pop(); return this.current; }
  redo() { if (!this.future.length) return null; this.past.push(this.current); this.current = this.future.pop(); return this.current; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}
