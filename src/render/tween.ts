/** Tiny promise-based tween runner driven by the render loop. */

export type Ease = (t: number) => number;
export const easeOutCubic: Ease = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutSine: Ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack: Ease = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

interface Task {
  elapsed: number;
  duration: number;
  update: (t: number) => void;
  ease: Ease;
  resolve: () => void;
}

export class Tweens {
  /** 1 = normal speed, 2 = twice as fast, 0 = everything completes instantly. */
  speed = 1;
  private tasks: Task[] = [];

  /** Calls `update(progress)` every frame for `seconds`, resolving when done. */
  run(seconds: number, update: (t: number) => void, ease: Ease = easeOutCubic): Promise<void> {
    return new Promise((resolve) => {
      if (this.speed === 0 || seconds <= 0) {
        update(1);
        resolve();
        return;
      }
      this.tasks.push({ elapsed: 0, duration: seconds, update, ease, resolve });
    });
  }

  wait(seconds: number): Promise<void> {
    return this.run(seconds, () => {});
  }

  tick(dt: number) {
    if (this.tasks.length === 0) return;
    const step = dt * (this.speed || 1000);
    const done: Task[] = [];
    for (const task of this.tasks) {
      task.elapsed += step;
      const t = Math.min(1, task.elapsed / task.duration);
      task.update(task.ease(t));
      if (t >= 1) done.push(task);
    }
    if (done.length) {
      this.tasks = this.tasks.filter((t) => !done.includes(t));
      for (const t of done) t.resolve();
    }
  }

  /** Finish everything immediately (e.g. when switching scenes). */
  flush() {
    const tasks = this.tasks;
    this.tasks = [];
    for (const t of tasks) {
      t.update(1);
      t.resolve();
    }
  }
}
