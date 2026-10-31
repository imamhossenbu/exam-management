import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutosaveQueue, type AnswerValue, type SaveResult } from "./autosave";

const v = (opt: string | null): AnswerValue => ({ selectedOptionId: opt, textAnswer: null, marked: false });

describe("AutosaveQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves immediately and reports saved state", async () => {
    const save = vi.fn(async (_q: string, _v: AnswerValue, rev: number): Promise<SaveResult> => ({ status: "saved", revision: rev, savedAt: "now" }));
    const q = new AutosaveQueue(save);
    q.update("q1", v("a"));
    expect(q.state("q1")).toBe("pending");
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledWith("q1", v("a"), 1);
    expect(q.state("q1")).toBe("saved");
    expect(q.hasUnsaved()).toBe(false);
  });

  it("debounces typing into a single request with the latest value", async () => {
    const save = vi.fn(async (_q: string, _v: AnswerValue, rev: number): Promise<SaveResult> => ({ status: "saved", revision: rev, savedAt: null }));
    const q = new AutosaveQueue(save);
    q.update("q1", { ...v(null), textAnswer: "H" }, 500);
    q.update("q1", { ...v(null), textAnswer: "He" }, 500);
    q.update("q1", { ...v(null), textAnswer: "Hello" }, 500);
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1].textAnswer).toBe("Hello");
    expect(save.mock.calls[0][2]).toBe(3);
  });

  it("never runs two saves for the same question at once and follows up with the newest value", async () => {
    let release!: () => void;
    const calls: number[] = [];
    const save = vi.fn((_q: string, _v: AnswerValue, rev: number) => {
      calls.push(rev);
      return new Promise<SaveResult>((resolve) => {
        release = () => resolve({ status: "saved", revision: rev, savedAt: null });
      });
    });
    const q = new AutosaveQueue(save);
    q.update("q1", v("a"));
    await vi.advanceTimersByTimeAsync(0);
    q.update("q1", v("b"));
    q.update("q1", v("c"));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([1, 3]);
    expect(save.mock.calls[1][1]).toEqual(v("c"));
    release();
    await vi.runAllTimersAsync();
    expect(q.hasUnsaved()).toBe(false);
  });

  it("retries failed saves with backoff and recovers when the network returns", async () => {
    let online = false;
    const save = vi.fn(async (_q: string, _v: AnswerValue, rev: number): Promise<SaveResult> => {
      if (!online) throw new Error("offline");
      return { status: "saved", revision: rev, savedAt: null };
    });
    const states: string[] = [];
    const q = new AutosaveQueue(save, { onState: (_id, s) => states.push(s), baseRetryMs: 1000 });
    q.update("q1", v("a"));
    await vi.advanceTimersByTimeAsync(0);
    expect(q.state("q1")).toBe("error");
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
    online = true;
    q.retryNow();
    await vi.runAllTimersAsync();
    expect(q.state("q1")).toBe("saved");
    expect(states).toContain("error");
  });

  it("stops and reports when the server says the deadline passed", async () => {
    const onClosed = vi.fn();
    const q = new AutosaveQueue(async () => ({ status: "deadline_passed" }), { onClosed });
    q.update("q1", v("a"));
    await vi.runAllTimersAsync();
    expect(onClosed).toHaveBeenCalledWith("deadline_passed");
    expect(q.isClosed).toBe(true);
    expect(q.update("q1", v("b"))).toBe(-1);
  });

  it("accepts a newer server revision without overwriting it", async () => {
    const q = new AutosaveQueue(async () => ({ status: "stale", revision: 9, savedAt: null }));
    q.seed("q1", v("a"), 2);
    q.update("q1", v("b"));
    await vi.runAllTimersAsync();
    expect(q.hasUnsaved()).toBe(false);
    expect(q.update("q1", v("c"))).toBe(10);
  });

  it("persists every change for crash/reload recovery", () => {
    const persist = vi.fn();
    const q = new AutosaveQueue(async (_q, _v, rev) => ({ status: "saved", revision: rev, savedAt: null }), { persist });
    q.update("q1", v("a"), 0, 4);
    expect(persist).toHaveBeenCalledWith("q1", v("a"), 5);
  });

  it("drops a change refused because its section closed, reverts to the saved value and keeps the queue open", async () => {
    const refused = vi.fn();
    const closed = vi.fn();
    const save = vi.fn(async (q: string, _v: AnswerValue, rev: number): Promise<SaveResult> =>
      q === "mcq" ? { status: "section_closed" } : { status: "saved", revision: rev, savedAt: null },
    );
    const q = new AutosaveQueue(save, { onRefused: refused, onClosed: closed });
    q.seed("mcq", v("a"), 1);
    q.update("mcq", v("b"));
    await vi.runAllTimersAsync();
    expect(refused).toHaveBeenCalledWith("mcq", v("a"));
    expect(q.state("mcq")).toBe("saved");
    expect(q.hasUnsaved()).toBe(false);
    expect(save).toHaveBeenCalledTimes(1); // no retries

    q.update("cq", { ...v(null), textAnswer: "still open" });
    await vi.runAllTimersAsync();
    expect(q.isClosed).toBe(false);
    expect(closed).not.toHaveBeenCalled();
    expect(q.state("cq")).toBe("saved");
  });
});
