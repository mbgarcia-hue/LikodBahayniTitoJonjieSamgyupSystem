export function formatStock(quantity: number, unit: string) {
  return quantity.toLocaleString('en-US', { minimumFractionDigits: unit === 'kg' ? 3 : 0, maximumFractionDigits: 4 });
}
