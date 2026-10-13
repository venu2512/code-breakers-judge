import { JUDGE_CONCURRENCY } from "./config";
import { ensureConfig } from "./bootstrap";

ensureConfig();

/**
 * A tiny promise queue. Submitted code is judged 2-3 at a time so a burst of
 * submissions cannot freeze the server PC.
 */
class Queue {
  private active = 0;
  private waiting: (() => void)[] = [];

  constructor(private concurrency: number) {}

  get pending(): number {
    return this.waiting.length + this.active;
  }

  add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.active += 1;
        task()
          .then(resolve, reject)
          .finally(() => {
            this.active -= 1;
            this.next();
          });
      };
      if (this.active < this.concurrency) run();
      else this.waiting.push(run);
    });
  }

  private next(): void {
    const fn = this.waiting.shift();
    if (fn) fn();
  }
}

const globalForQueue = globalThis as unknown as { __cbQueue?: Queue };
export const judgeQueue = (globalForQueue.__cbQueue ??= new Queue(
  JUDGE_CONCURRENCY
));
