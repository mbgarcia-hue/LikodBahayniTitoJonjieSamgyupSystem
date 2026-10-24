import { test as base, expect } from '@playwright/test';
const test = base.extend<{ errors: void }>({ errors: [async ({ page }, use) => { const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await use(); expect(errors).toEqual([]); }, { auto: true }] });
async function login(page, role: string) {
  await page.goto(`/${role}/login`);
  await page.getByLabel('Username', { exact: true }).fill(role);
  await page.getByLabel('Password', { exact: true }).fill(`${role[0].toUpperCase()}${role.slice(1)}@123`);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
for (const role of ['cashier', 'kitchen', 'owner']) test(`${role}: branded login, visibility toggle and correct destination`, async ({ page }) => {
  await page.goto(`/${role}/login`);
  await expect(page.getByRole('heading', { name: `${role[0].toUpperCase()}${role.slice(1)} Login` })).toBeVisible();
  await expect(page.locator('.auth-page')).toHaveCSS('background-color', 'rgb(26, 18, 16)');
  await page.getByLabel('Password', { exact: true }).fill('sample'); await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await page.screenshot({ path: `test-results/${role}-login.png`, fullPage: true });
  await login(page, role);
  await expect(page).toHaveURL(role === 'cashier' ? /\/cashier\/billing$/ : new RegExp(`/${role}$`));
});
test('wrong credentials and cross-role login stay on the login form', async ({ page }) => {
  await page.goto('/owner/login'); await page.getByLabel('Username', { exact: true }).fill('cashier'); await page.getByLabel('Password', { exact: true }).fill('Cashier@123'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Incorrect username or password'); await expect(page).toHaveURL(/owner\/login$/);
});
test('route guards redirect signed-out and wrong-role users; logout invalidates access', async ({ page }) => {
  await page.goto('/owner'); await expect(page).toHaveURL(/owner\/login$/);
  await login(page, 'cashier'); await expect(page).toHaveURL(/cashier\/billing$/);
  await expect(page.getByRole('link', { name: 'Tables & Billing', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /^(Tables & QR codes|Billing \/ POS)$/ })).toHaveCount(0);
  await page.goto('/cashier/qr-tables'); await expect(page).toHaveURL(/cashier\/billing$/);
  await expect(page.getByRole('heading', { name: 'Tables, QR codes & billing', exact: true })).toBeVisible();
  await page.goto('/owner'); await expect(page).toHaveURL(/cashier\/billing$/);
  await page.getByRole('button', { name: 'Logout' }).click(); await expect(page).toHaveURL(/cashier\/login$/);
  await page.goto('/cashier/orders'); await expect(page).toHaveURL(/cashier\/login$/);
  await login(page, 'owner'); await expect(page).toHaveURL(/\/owner$/);
  await page.goto('/admin/qr-tables'); await expect(page).toHaveURL(/admin\/billing$/);
  await expect(page.getByRole('link', { name: 'Tables & Billing', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /^(QR Tables|Billing)$/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Tables, QR codes & billing', exact: true })).toBeVisible();
});
test('mobile login fits screen and role links show the matching form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/cashier/login');
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Kitchen', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Kitchen Login' })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-login.png', fullPage: true });
});
test('profile saves to the signed-in account and survives reload', async ({ page }) => {
  await login(page, 'owner'); await page.goto('/owner/profile');
  await page.getByLabel('Full name', { exact: true }).fill('Restaurant Owner'); await page.getByLabel('Email address', { exact: true }).fill('owner@example.com');
  await page.getByRole('button', { name: 'Save changes' }).click(); await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Restaurant Owner');
});
test('owner sales renders empty data without invalid chart coordinates', async ({ page }) => {
  await login(page, 'owner'); await page.goto('/owner/sales');
  await expect(page.getByRole('heading', { name: 'Sales Monitoring' })).toBeVisible();
  expect(await page.locator('svg').evaluateAll(nodes => nodes.every(node => !/NaN|Infinity/.test(node.outerHTML)))).toBe(true);
});
