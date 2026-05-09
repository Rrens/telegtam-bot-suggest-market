import { Queue, Job } from 'bullmq';
import { redis } from '../cache/redis';
import { log } from '../utils/logger';

export interface JobStatus {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  nextRun?: string;
}

class JobOrchestrator {
  private queues: Map<string, Queue> = new Map();

  /**
   * Register a queue to be orchestrated
   */
  register(name: string): Queue {
    if (this.queues.has(name)) return this.queues.get(name)!;
    
    const queue = new Queue(name, { connection: redis });
    this.queues.set(name, queue);
    log.info(`JobOrchestrator: Registered queue [${name}]`);
    return queue;
  }

  /**
   * Get all registered queues
   */
  getQueues(): Map<string, Queue> {
    return this.queues;
  }

  /**
   * Get statuses of all registered jobs
   */
  async getAllStatuses(): Promise<JobStatus[]> {
    const statuses: JobStatus[] = [];
    
    for (const [name, queue] of this.queues) {
      const counts = await queue.getJobCounts();
      
      // Try to find the next repeat run
      const repeatableJobs = await queue.getRepeatableJobs();
      const nextRun = (repeatableJobs.length > 0 && repeatableJobs[0].next !== undefined)
        ? new Date(repeatableJobs[0].next).toLocaleString('id-ID')
        : 'Manual Only';

      statuses.push({
        name,
        waiting: counts.waiting,
        active: counts.active,
        completed: counts.completed,
        failed: counts.failed,
        delayed: counts.delayed,
        nextRun,
      });
    }
    
    return statuses;
  }

  /**
   * Manually trigger a job in a queue
   */
  async triggerJob(name: string, data: any = {}): Promise<Job | null> { 
    const queue = this.queues.get(name);
    if (!queue) {
      log.warn(`JobOrchestrator: Trigger failed, queue [${name}] not found`);
      return null;
    }
    
    log.info(`JobOrchestrator: Manually triggering job in [${name}]`);
    return await queue.add(`manual-${Date.now()}`, data);
  }

  /**
   * Clear all jobs in a queue
   */
  async clearQueue(name: string): Promise<void> {
    const queue = this.queues.get(name);
    if (!queue) return;
    
    await queue.drain();
    log.info(`JobOrchestrator: Drained queue [${name}]`);
  }
}

export const jobOrchestrator = new JobOrchestrator();
