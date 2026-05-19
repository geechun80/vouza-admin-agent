// =============================================================================
// Per-chat FIFO Message Queue — Phase 1 concurrency upgrade
//
// Replaces the "processingChats" Set (which silently drops messages) with a
// proper queue so second messages wait rather than being discarded.
//
// Design
// ──────
//   MessageQueue  — one per chat; holds ≤ maxSize pending async tasks
//   ChannelQueues — factory/registry; creates and looks up MessageQueues by id
//
// Behaviour
// ─────────
//   • First message starts immediately (no queue wait)
//   • Second message while first is running → enqueued; returns "ok"
//   • Queue at capacity → enqueue() returns "full"; caller notifies user
//   • Items expire after ttlMs (default 45 s) — if an item waited too long
//     it is pruned silently (user's message is stale by then)
//   • One drain loop runs per queue; errors inside individual tasks are caught
//     and do not stop the rest of the queue from draining
// =============================================================================

export interface QueueItem {
  fn:          () => Promise<void>;
  enqueuedAt:  number;
  label:       string;  // for debug logs (e.g. "tg:123456:hello world")
}

export type EnqueueResult = "ok" | "full";

// ── MessageQueue ──────────────────────────────────────────────────────────────

export class MessageQueue {
  private _items:      QueueItem[] = [];
  private _processing: boolean     = false;

  readonly maxSize: number;  // max items including the one currently running
  readonly ttlMs:   number;  // ms before a queued item is considered too stale

  constructor(maxSize = 3, ttlMs = 45_000) {
    this.maxSize = maxSize;
    this.ttlMs   = ttlMs;
  }

  /** True while an item is actively being executed. */
  get isProcessing(): boolean { return this._processing; }

  /** Number of items pending (not counting the one currently running). */
  get depth(): number { return this._items.length; }

  /**
   * Add a task to the queue.
   * Returns "ok"   — task accepted; will run when current work finishes.
   * Returns "full" — queue is at capacity; caller should warn the user.
   */
  enqueue(fn: () => Promise<void>, label = ""): EnqueueResult {
    this._prune();

    // Total = queued items + (1 if something is currently running)
    const total = this._items.length + (this._processing ? 1 : 0);
    if (total >= this.maxSize) return "full";

    this._items.push({ fn, enqueuedAt: Date.now(), label });

    // Start draining if not already in progress
    if (!this._processing) {
      this._drain().catch(() => {});
    }

    return "ok";
  }

  /** Remove expired items from the front of the queue. */
  private _prune(): void {
    const now = Date.now();
    while (this._items.length > 0 && now - this._items[0].enqueuedAt > this.ttlMs) {
      this._items.shift();
    }
  }

  /** Execute items in FIFO order until the queue is empty. */
  private async _drain(): Promise<void> {
    this._processing = true;
    try {
      while (this._items.length > 0) {
        this._prune(); // drop anything that went stale while waiting
        const item = this._items.shift();
        if (!item) continue;

        // Already expired? Skip silently.
        if (Date.now() - item.enqueuedAt > this.ttlMs) continue;

        try {
          await item.fn();
        } catch {
          // Task-level errors are handled inside fn() — one failure must not
          // stop the rest of the queue from draining.
        }
      }
    } finally {
      this._processing = false;
    }
  }
}

// ── ChannelQueues ─────────────────────────────────────────────────────────────

/**
 * Factory and registry for per-chat MessageQueues.
 * One ChannelQueues instance is shared across a listener module.
 */
export class ChannelQueues {
  private _queues = new Map<string, MessageQueue>();

  private readonly _maxSize: number;
  private readonly _ttlMs:   number;

  constructor(maxSize = 3, ttlMs = 45_000) {
    this._maxSize = maxSize;
    this._ttlMs   = ttlMs;
  }

  /** Get the queue for a chat, creating it on first access. */
  getOrCreate(chatId: string): MessageQueue {
    let q = this._queues.get(chatId);
    if (!q) {
      q = new MessageQueue(this._maxSize, this._ttlMs);
      this._queues.set(chatId, q);
    }
    return q;
  }

  /** Remove the queue entry for a chat (e.g. after /reset clears history). */
  clear(chatId: string): void {
    this._queues.delete(chatId);
  }

  /** Total items pending across all chats (not counting the running ones). */
  totalDepth(): number {
    let n = 0;
    for (const q of this._queues.values()) n += q.depth;
    return n;
  }

  /**
   * Snapshot for dashboard status endpoint.
   * Only includes chats that currently have queued or in-progress work.
   */
  snapshot(): Record<string, { depth: number; processing: boolean }> {
    const out: Record<string, { depth: number; processing: boolean }> = {};
    for (const [id, q] of this._queues) {
      if (q.depth > 0 || q.isProcessing) {
        out[id] = { depth: q.depth, processing: q.isProcessing };
      }
    }
    return out;
  }
}
