import { test, expect } from '@playwright/test';

test('an outdated API shows restart instructions and retry recovers', async ({ page }) => {
  await page.route('**/api/dining/state', route => route.fulfill({ status: 404, json: { error: 'Old API' } }));
  await page.route('**/api/staff/me', route => route.fulfill({ status: 404, json: { error: 'Old API' } }));
  await page.goto('/owner');
  await expect(page.getByRole('status')).toContainText('An older restaurant API is running');
  await page.unroute('**/api/staff/me');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page).toHaveURL(/\/owner\/login$/);
});

test('an unavailable API shows a retry action and recovers after startup', async ({ page }) => {
  await page.route('**/api/dining/state', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.route('**/api/staff/me', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.goto('/cashier/orders');
  await expect(page.getByRole('status')).toContainText('Make sure npm run dev is running');
  await page.unroute('**/api/staff/me');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page).toHaveURL(/\/cashier\/login$/);
});
