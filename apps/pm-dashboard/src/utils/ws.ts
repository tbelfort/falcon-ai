export function buildWsUrl(apiBaseUrl?: string, explicitWsUrl?: string) {
  if (explicitWsUrl) {
    return explicitWsUrl.replace(/\/$/, '');
  }
  if (!apiBaseUrl) {
    return null;
  }
  const trimmed = apiBaseUrl.replace(/\/$/, '');
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return `${trimmed}/ws`;
  }
  if (trimmed.startsWith('http://')) {
    return `ws://${trimmed.slice('http://'.length)}/ws`;
  }
  if (trimmed.startsWith('https://')) {
    return `wss://${trimmed.slice('https://'.length)}/ws`;
  }
  return `ws://${trimmed}/ws`;
}
