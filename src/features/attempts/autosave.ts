/**
 * Autosave queue for exam answers.
 *
 * - Each change bumps a per-question revision; the server ignores stale revisions,
 *   so out-of-order or retried requests can never overwrite a newer answer.
 * - At most one request per question is in flight; changes made meanwhile are
 *   coalesced into a single follow-up save.
 * - Failed saves are retried with exponential backoff and immediately when the
 *   browser comes back online.
 */
export type AnswerValue = { selectedOptionId: string | null; textAnswer: string | null; marked: boolean };

export type SaveResult =
  | { status: "saved" | "stale"; revision: number; savedAt: string | null }
  | { status: "deadline_passed" | "finalized" };

export type SaveFn = (questionId: string, value: AnswerValue, revision: number) => Promise<SaveResult>;

export type QuestionSaveState = "saved" | "pending" | "saving" | "error";

type Entry = {
  value: AnswerValue;
  revision: number;
  savedRevision: number;
  inFlight: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  retryDelay: number;
  error: boolean;
};

export type AutosaveListener = (questionId: string, state: QuestionSaveState) => void;

export class AutosaveQueue {
  private entries = new Map<string, Entry>();
  private closed = false;

  constructor(
    private readonly save: SaveFn,
    private readonly options: {
      onState?: AutosaveListener;
      onClosed?: (reason: "deadline_passed" | "finalized") => void;
      persist?: (questionId: string, value: AnswerValue, revision: number) => void;
      baseRetryMs?: number;
      maxRetryMs?: number;
    } = {},
  ) {}

  /** Seed with the server's saved state. */
  seed(questionId: string, value: AnswerValue, revision: number) {
    this.entries.set(questionId, { value, revision, savedRevision: revision, inFlight: false, timer: null, retryDelay: 0, error: false });
  }

  get isClosed() {
    return this.closed;
  }

  state(questionId: string): QuestionSaveState {
    const e = this.entries.get(questionId);
    if (!e) return "saved";
    if (e.inFlight) return "saving";
    if (e.error) return "error";
    return e.revision > e.savedRevision ? "pending" : "saved";
  }

  hasUnsaved(): boolean {
    for (const e of this.entries.values()) if (e.revision > e.savedRevision) return true;
    return false;
  }

  unsavedCount(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.revision > e.savedRevision) n++;
    return n;
  }

  /** Record a change. `delayMs` debounces typing; choices save immediately. */
  update(questionId: string, value: AnswerValue, delayMs = 0, minRevision = 0): number {
    if (this.closed) return -1;
    const e = this.entries.get(questionId) ?? { value, revision: 0, savedRevision: 0, inFlight: false, timer: null, retryDelay: 0, error: false };
    e.value = value;
    e.revision = Math.max(e.revision, minRevision) + 1;
    e.error = false;
    e.retryDelay = 0;
    this.entries.set(questionId, e);
    this.options.persist?.(questionId, value, e.revision);
    this.schedule(questionId, delayMs);
    this.emit(questionId);
    return e.revision;
  }

  /** Save everything now. Resolves when nothing is pending or saving fails. */
  async flush(): Promise<boolean> {
    const ids = [...this.entries.keys()];
    await Promise.all(ids.map((id) => this.run(id)));
    return !this.hasUnsaved();
  }

  /** Retry all failed/pending questions immediately (e.g. on `online`). */
  retryNow() {
    for (const id of this.entries.keys()) {
      const e = this.entries.get(id)!;
      if (e.revision > e.savedRevision && !e.inFlight) this.schedule(id, 0);
    }
  }

  close() {
    this.closed = true;
    for (const e of this.entries.values()) if (e.timer) clearTimeout(e.timer);
  }

  private schedule(questionId: string, delayMs: number) {
    const e = this.entries.get(questionId)!;
    if (e.timer) clearTimeout(e.timer);
    e.timer = setTimeout(() => {
      e.timer = null;
      void this.run(questionId);
    }, delayMs);
  }

  private emit(questionId: string) {
    this.options.onState?.(questionId, this.state(questionId));
  }

  private async run(questionId: string): Promise<void> {
    const e = this.entries.get(questionId);
    if (!e || this.closed || e.inFlight || e.revision <= e.savedRevision) return;
    if (e.timer) {
      clearTimeout(e.timer);
      e.timer = null;
    }
    e.inFlight = true;
    const revision = e.revision;
    const value = e.value;
    this.emit(questionId);
    try {
      const result = await this.save(questionId, value, revision);
      e.inFlight = false;
      if (!("revision" in result)) {
        this.close();
        this.emit(questionId);
        this.options.onClosed?.(result.status);
        return;
      }
      // "stale" means the server already holds a newer revision (e.g. another tab).
      e.savedRevision = Math.max(e.savedRevision, result.status === "saved" ? revision : result.revision);
      if (result.status === "stale" && result.revision >= e.revision) e.revision = result.revision;
      e.error = false;
      e.retryDelay = 0;
      this.emit(questionId);
      if (e.revision > e.savedRevision) await this.run(questionId);
    } catch {
      e.inFlight = false;
      e.error = true;
      const base = this.options.baseRetryMs ?? 2000;
      e.retryDelay = Math.min(e.retryDelay ? e.retryDelay * 2 : base, this.options.maxRetryMs ?? 30000);
      this.emit(questionId);
      this.schedule(questionId, e.retryDelay);
    }
  }
}
