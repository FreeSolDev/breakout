export class ECS {
  constructor() {
    this.nextId = 0;
    this.entities = new Set();
    this.components = {}; // componentName -> Map(entityId -> data)
    this.tags = {};       // tag -> Set(entityId)
    this._emptySet = new Set(); // reusable empty set for queryTag
  }

  create() {
    const id = this.nextId++;
    this.entities.add(id);
    return id;
  }

  destroy(id) {
    this.entities.delete(id);
    for (const store of Object.values(this.components)) {
      store.delete(id);
    }
    for (const set of Object.values(this.tags)) {
      set.delete(id);
    }
  }

  add(id, name, data) {
    if (!this.components[name]) this.components[name] = new Map();
    this.components[name].set(id, data);
    return this;
  }

  get(id, name) {
    return this.components[name]?.get(id);
  }

  has(id, name) {
    return this.components[name]?.has(id) ?? false;
  }

  remove(id, name) {
    this.components[name]?.delete(id);
  }

  tag(id, tagName) {
    if (!this.tags[tagName]) this.tags[tagName] = new Set();
    this.tags[tagName].add(id);
  }

  hasTag(id, tagName) {
    return this.tags[tagName]?.has(id) ?? false;
  }

  // Query: get all entities with ALL listed components
  query(...names) {
    // Use smallest component set as base for faster iteration
    let smallest = null;
    let smallestSize = Infinity;
    for (const n of names) {
      const store = this.components[n];
      if (!store) return [];
      if (store.size < smallestSize) {
        smallest = store;
        smallestSize = store.size;
      }
    }
    const results = [];
    for (const id of smallest.keys()) {
      if (this.entities.has(id) && names.every(n => this.has(id, n))) {
        results.push(id);
      }
    }
    return results;
  }

  // Query by tag — returns the Set directly (do not mutate!)
  queryTag(tagName) {
    return this.tags[tagName] || this._emptySet;
  }
}
