// Mock for pg-boss job queue

type JobHandler = (jobs: { id: string; data: unknown }[]) => Promise<void>;

export class MockPgBoss {
  private handlers = new Map<string, JobHandler>();
  private jobs: { id: string; queue: string; data: unknown }[] = [];
  private jobCounter = 0;

  async start() {
    return this;
  }

  async stop() {
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createQueue(name: string, options?: unknown) {
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateQueue(name: string, options?: unknown) {
    return true;
  }

  async work(
    queue: string,
    _opts: unknown,
    handler: JobHandler,
  ): Promise<string> {
    this.handlers.set(queue, handler);
    return `worker-${queue}`;
  }

  async send(
    queue: string,
    data: unknown,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options?: unknown,
  ): Promise<string> {
    const id = `mock-job-${++this.jobCounter}`;
    this.jobs.push({ id, queue, data });
    return id;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  on(event: string, handler: (...args: unknown[]) => void) {
    // No-op for event handlers
  }

  // Test helper: get all enqueued jobs
  getJobs(queue?: string) {
    if (queue) {
      return this.jobs.filter((j) => j.queue === queue);
    }
    return this.jobs;
  }

  // Test helper: process jobs synchronously for a queue
  async processJobs(queue: string) {
    const handler = this.handlers.get(queue);
    if (!handler) return;

    const queueJobs = this.jobs.filter((j) => j.queue === queue);
    if (queueJobs.length > 0) {
      await handler(queueJobs.map((j) => ({ id: j.id, data: j.data })));
      this.jobs = this.jobs.filter((j) => j.queue !== queue);
    }
  }

  // Test helper: clear all jobs
  clearJobs() {
    this.jobs = [];
  }
}

// Factory to create mock boss instance
export function createMockPgBoss() {
  return new MockPgBoss();
}
