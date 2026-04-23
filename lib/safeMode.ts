export function isSafeMode(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('safe') === '1') return true;
    const stored = localStorage.getItem('SAFE_MODE');
    return stored === '1';
  } catch {
    return false;
  }
}

export function setSafeMode(on: boolean) {
  try {
    localStorage.setItem('SAFE_MODE', on ? '1' : '0');
  } catch {
    // ignore
  }
}
