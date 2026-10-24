export async function api(path: string, body?: unknown, method = 'POST', token?: string) {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Visit-Token': token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed') as Error & { status: number };
    error.status = response.status;
    if (response.status === 401 && !path.includes('/login') && !path.includes('/password') && !token) window.dispatchEvent(new Event('staff-session-expired'));
    throw error;
  }
  return data;
}
