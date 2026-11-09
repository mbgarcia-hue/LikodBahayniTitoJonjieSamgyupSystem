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
  if (role === 'cashier') await expect(page.getByText('Hello, cashier', { exact: true })).toBeVisible();
});
test('wrong credentials and cross-role login stay on the login form', async ({ page }) => {
  await page.goto('/owner/login'); await page.getByLabel('Username', { exact: true }).fill('cashier'); await page.getByLabel('Password', { exact: true }).fill('Cashier@123'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Incorrect username or password'); await expect(page).toHaveURL(/owner\/login$/);
});
test('owner forgotten-password link explains administrator-assisted recovery', async ({ page }) => {
  await page.goto('/owner/login');
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('owner account cannot approve its own reset');
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
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
test('owner creates a staff account and resolves its forgotten-password request', async ({ page }) => {
  await login(page, 'owner');
  await page.getByRole('link', { name: 'Staff Accounts', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Staff Accounts', exact: true })).toBeVisible();
  await page.getByLabel('Account type').selectOption('cashier');
  await page.getByLabel('Full name').fill('Recovery Test Cashier');
  await page.getByLabel('Username').fill('e2e.cashier');
  await page.getByRole('textbox', { name: 'Initial password' }).fill('InitialPass@123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Staff account created');
  await expect(page.getByText('Username: e2e.cashier')).toBeVisible();

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/owner\/login$/);
  await page.goto('/cashier/login');
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('e2e.cashier');
  await page.getByRole('button', { name: 'Send recovery request' }).click();
  await expect(page.getByRole('status')).toContainText('the owner will review the request');

  await login(page, 'owner');
  await page.getByRole('link', { name: 'Staff Accounts', exact: true }).click();
  await expect(page.getByText('Recovery Test Cashier').first()).toBeVisible();
  const temporaryPassword = page.getByRole('textbox', { name: /Temporary password/ });
  await temporaryPassword.fill('TemporaryPass@123');
  await page.getByRole('button', { name: 'Show temporary password' }).click();
  await expect(temporaryPassword).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide temporary password' }).click();
  await expect(temporaryPassword).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByRole('status')).toContainText('Password reset for e2e.cashier');

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/owner\/login$/);
  await page.goto('/cashier/login');
  await page.getByLabel('Username', { exact: true }).fill('e2e.cashier');
  await page.getByLabel('Password', { exact: true }).fill('TemporaryPass@123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/cashier\/billing$/);
});
test('profile saves to the signed-in account and survives reload', async ({ page }) => {
  await login(page, 'owner'); await page.goto('/owner/profile');
  await page.getByLabel('Full name', { exact: true }).fill('Restaurant Owner'); await page.getByLabel('Email address', { exact: true }).fill('owner@example.com');
  await page.getByRole('button', { name: 'Save changes' }).click(); await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Restaurant Owner');
});
test('owner sales renders empty data without invalid chart coordinates', async ({ page }) => {
  await login(page, 'owner');
  await expect(page.getByRole('img', { name: 'Philippine peso', exact: true })).toHaveCount(1);
  await page.goto('/owner/sales');
  await expect(page.getByRole('heading', { name: 'Sales Monitoring' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Philippine peso', exact: true })).toHaveCount(3);
  expect(await page.locator('svg').evaluateAll(nodes => nodes.every(node => !/NaN|Infinity/.test(node.outerHTML)))).toBe(true);
});
