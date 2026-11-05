import type { MenuItem } from '../data/restaurantData';

export const fallbackFoodImage = '/menu/food-fallback.svg';

export function defaultMenuImage(item: Pick<MenuItem, 'name' | 'category'>) {
  const name = item.name.toLowerCase();
  if (/\b(coke|sprite|royal|iced tea|drink)\b/.test(name)) return '/menu/drink.webp';
  if (/\brice\b/.test(name)) return '/menu/salad.webp';
  if (/\b(pork|bulgogi)\b/.test(name)) return '/menu/grill.webp';
  if (/\b(gochujang|ssamjang|sauce)\b/.test(name)) return '/menu/grill.webp';
  if (/\b(enoki|mushroom)\b/.test(name)) return '/menu/vegetables.webp';
  if (item.category === 'Meat') return '/menu/grill.webp';
  return '/menu/salad.webp';
}

export function menuImage(item: MenuItem) {
  return item.image || defaultMenuImage(item);
}
