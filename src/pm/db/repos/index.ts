import type { PmRepos } from '../../core/repos/index.js';

function notImplemented(): never {
  throw new Error('DB repos not implemented in Phase 1');
}

export function createDbRepos(): PmRepos {
  return {
    projects: {
      list: async () => notImplemented(),
      getById: async () => notImplemented(),
      getBySlug: async () => notImplemented(),
      create: async () => notImplemented(),
      update: async () => notImplemented(),
      delete: async () => notImplemented(),
    },
    issues: {
      listByProject: async () => notImplemented(),
      getById: async () => notImplemented(),
      create: async () => notImplemented(),
      update: async () => notImplemented(),
      delete: async () => notImplemented(),
      getNextNumber: async () => notImplemented(),
    },
    labels: {
      listByProject: async () => notImplemented(),
      getById: async () => notImplemented(),
      getByIds: async () => notImplemented(),
      create: async () => notImplemented(),
    },
    comments: {
      listByIssue: async () => notImplemented(),
      create: async () => notImplemented(),
    },
    documents: {
      listByIssue: async () => notImplemented(),
      create: async () => notImplemented(),
    },
  };
}
