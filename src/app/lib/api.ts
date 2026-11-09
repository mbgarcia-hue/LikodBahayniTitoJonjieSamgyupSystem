export async function api(path: string, body?: unknown, method = 'POST', token?: string) {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Visit-Token': token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const responseText = await response.text();
  let data: unknown = {};
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      if (response.ok) throw new Error('The server returned an invalid response. Please try again.');
    }
  } else if (response.ok) {
    throw new Error('The server returned an empty response. Please try again.');
  }
  if (!response.ok) {
    const fallback = response.status === 401 && path.includes('/login')
      ? 'Invalid username or password. Please try again.'
      : `Request failed (HTTP ${response.status})`;
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error
      : fallback;
    const error = new Error(message) as Error & { status: number };
    error.status = response.status;
    if (response.status === 401 && !path.includes('/login') && !path.includes('/password') && !token) window.dispatchEvent(new Event('staff-session-expired'));
    throw error;
  }
  return data;
}
