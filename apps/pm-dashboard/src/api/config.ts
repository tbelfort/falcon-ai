type RuntimeConfig = {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
};

const runtimeConfig = globalThis as typeof globalThis & {
  __PM_DASHBOARD_CONFIG__?: RuntimeConfig;
};

export function getApiBaseUrl(): string {
  if (runtimeConfig.__PM_DASHBOARD_CONFIG__?.apiBaseUrl !== undefined) {
    return runtimeConfig.__PM_DASHBOARD_CONFIG__?.apiBaseUrl ?? '';
  }
  return import.meta.env.VITE_API_BASE_URL ?? '';
}

export function getWsBaseUrl(): string {
  if (runtimeConfig.__PM_DASHBOARD_CONFIG__?.wsBaseUrl !== undefined) {
    return runtimeConfig.__PM_DASHBOARD_CONFIG__?.wsBaseUrl ?? '';
  }
  return import.meta.env.VITE_WS_BASE_URL ?? '';
}

export function isMockedMode(): boolean {
  return !getApiBaseUrl();
}

export function getWsUrl(): string {
  const wsBase = getWsBaseUrl();
  if (wsBase) {
    return wsBase;
  }

  const apiBase = getApiBaseUrl();
  if (!apiBase) {
    return '';
  }

  if (apiBase.startsWith('http')) {
    try {
      const url = new URL(apiBase);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = '/ws';
      url.search = '';
      return url.toString();
    } catch {
      return '/ws';
    }
  }

  return '/ws';
}
