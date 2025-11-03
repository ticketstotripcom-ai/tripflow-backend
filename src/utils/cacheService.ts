import localforage from "localforage";

const CACHE_KEY = "crmData";
const SYNC_KEY = "lastSync";
const QUEUE_KEY = "pendingChanges";

export const cacheService = {
  async getData() {
    return await localforage.getItem(CACHE_KEY);
  },
  async setData(data: any) {
    await localforage.setItem(CACHE_KEY, data);
  },
  async getLastSync() {
    return (await localforage.getItem(SYNC_KEY)) || 0;
  },
  async setLastSync(ts: number) {
    await localforage.setItem(SYNC_KEY, ts);
  }
};

export const changeQueue = {
  async add(change: any) {
    const list = (await localforage.getItem(QUEUE_KEY)) || [];
    list.push({ ...change, timestamp: Date.now() });
    await localforage.setItem(QUEUE_KEY, list);
  },
  async getAll() {
    return (await localforage.getItem(QUEUE_KEY)) || [];
  },
  async clear() {
    await localforage.setItem(QUEUE_KEY, []);
  }
};