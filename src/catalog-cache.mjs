// Cache catalog metadata only. This never fetches or samples a video stream.
export class CatalogCache {
  constructor({ ttl = 300000, limit = 40 } = {}) {
    this.ttl = ttl;
    this.limit = limit;
    this.entries = new Map();
    this.pending = new Map();
  }
  peek(key) {
    return this.entries.get(key)?.items;
  }
  async get(key, load, force = false) {
    const hit = this.entries.get(key);
    if (!force && hit && Date.now() - hit.at < this.ttl) return hit.items;
    if (this.pending.has(key)) return this.pending.get(key);
    const job = Promise.resolve()
      .then(load)
      .then((items) => {
        this.entries.delete(key);
        this.entries.set(key, { items, at: Date.now() });
        while (this.entries.size > this.limit)
          this.entries.delete(this.entries.keys().next().value);
        return items;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, job);
    return job;
  }
}
