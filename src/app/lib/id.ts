export function newRequestId() {
  // randomUUID requires HTTPS; getRandomValues also works on a restaurant LAN.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
}
