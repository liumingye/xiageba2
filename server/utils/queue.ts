import { EventEmitter } from "events";

class RequestQueue {
  private maxConcurrent: number;
  private activeCount: number = 0;
  private waitingQueue: Array<{
    id: string;
    resolve: () => void;
    onProgress: (position: number) => void;
  }> = [];

  constructor(maxConcurrent = 10) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * 进入队列
   * @param id 用户会话标识或请求ID
   * @param onProgress 队列位置发生变化时的回调
   */
  async enter(
    id: string,
    onProgress: (position: number) => void,
  ): Promise<() => void> {
    // 如果当前并发数还没满，直接通行
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount++;
      return () => this.release();
    }

    // 满了，包成一个 Promise 挂起
    return new Promise<() => void>((resolve) => {
      this.waitingQueue.push({
        id,
        resolve: () => {
          this.activeCount++;
          resolve(() => this.release());
        },
        onProgress,
      });

      // 进来的时候先通知一下当前排在第几位
      onProgress(this.waitingQueue.length);
    });
  }

  /**
   * 释放当前车位，并唤醒下一个排队的人
   */
  private release() {
    this.activeCount--;
    if (this.waitingQueue.length > 0) {
      const next = this.waitingQueue.shift();
      if (next) {
        // 唤醒下一个
        next.resolve();
        // 通知剩下排队的人，他们的位置往前移了
        this.notifyQueuePositions();
      }
    }
  }

  /**
   * 广播通知所有人位置更新
   */
  private notifyQueuePositions() {
    this.waitingQueue.forEach((item, index) => {
      item.onProgress(index + 1);
    });
  }
}

// 导出全局单例，所有人共享这 10 个并发坑位
export const aiRequestQueue = new RequestQueue(10);
