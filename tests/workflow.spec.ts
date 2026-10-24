import { test, expect } from '@playwright/test';
async function login(page, role: string) {
  await page.goto(`/${role}/login`); await page.getByLabel('Username', { exact: true }).fill(role);
  await page.getByLabel('Password', { exact: true }).fill(role[0].toUpperCase()+role.slice(1)+'@123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(role === 'cashier' ? /\/cashier\/billing$/ : new RegExp(`/${role}$`));
}
test('cashier approves the first batch once, follow-ups reach kitchen directly, and closure requires service', async ({ browser }) => {
  test.setTimeout(90000);
  const contexts = await Promise.all(Array.from({length:4}, () => browser.newContext()));
  const [staff,kitchen,phoneA,phoneB] = contexts; const errors: string[] = [];
  for (const c of contexts) c.on('page', page => page.on('pageerror', e => errors.push(e.message)));
  try {
    const cashier = await staff.newPage(); await login(cashier,'cashier');
    const table = cashier.locator('article').filter({ has: cashier.getByRole('heading', { name: 'Table 1', exact: true }) });
    await table.getByRole('button', { name: 'Open dining session' }).click();
    await expect(table.getByText('Visit code:')).toBeVisible(); const code = (await table.locator('strong.success').innerText()).trim();
    for (const context of [phoneA,phoneB]) { const page = await context.newPage(); await page.goto('/customer/1'); await page.getByLabel('Visit code').fill(code); await page.getByRole('button', { name: 'Open menu' }).click(); await expect(page.getByRole('button', { name: 'Table orders & bill' })).toBeVisible(); }
    const a=phoneA.pages()[0], b=phoneB.pages()[0];
    async function submit(page, item: string, notes: string) {
      const before = (await (await staff.request.get('/api/dining/state')).json()).orders.length;
      const menuItem = page.locator('article').filter({ has: page.getByRole('heading', { name: item, exact: true }) });
      await expect(menuItem.getByRole('button', { name: `Add ${item} to batch`, exact: true })).toHaveText('Add to Batch');
      await expect(menuItem.getByRole('button')).toHaveCount(1);
      await menuItem.getByRole('button', { name: `Add ${item} to batch`, exact: true }).click();
      await menuItem.getByRole('button', { name: `Add ${item} to batch`, exact: true }).click();
      await page.getByRole('button', { name: 'Your cart (2)', exact: true }).click();
      await expect(page.getByText(`${item} × 2`, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: `Decrease ${item} in cart`, exact: true }).click();
      await page.getByRole('button', { name: `Increase ${item} in cart`, exact: true }).click();
      await page.getByRole('button', { name: `Decrease ${item} in cart`, exact: true }).click();
      await expect(page.getByText(`${item} × 1`, { exact: true })).toBeVisible();
      await page.getByLabel('Special instructions').fill(notes); await page.reload(); await expect(page.getByLabel('Special instructions')).toHaveValue(notes);
      await expect(page.getByText(`${item} × 1`, { exact: true })).toBeVisible();
      expect((await (await staff.request.get('/api/dining/state')).json()).orders).toHaveLength(before);
      const response = page.waitForResponse(r => r.url().endsWith('/orders') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Submit batch' }).click(); const batch=await (await response).json();
      await expect(page.getByRole('heading', { name: 'Shared order history' })).toBeVisible(); return batch;
    }
    const first=await submit(a,'Coke','No ice');
    const k=await kitchen.newPage(); await login(k,'kitchen'); await expect(k.getByRole('heading', { name: 'APPROVED BATCHES' })).toBeVisible();
    await expect(k.locator(`[data-batch-id="${first.id}"]`)).toHaveCount(0);
    const firstReview=table.locator(`[data-batch-id="${first.id}"]`); await expect(firstReview.getByText('Awaiting first batch approval', {exact:true})).toBeVisible();
    await expect(firstReview.getByText('Instructions: No ice')).toBeVisible(); await firstReview.getByRole('button', { name:'Approve & send to kitchen' }).click();
    const firstKitchen=k.locator(`[data-batch-id="${first.id}"]`); await expect(firstKitchen).toBeVisible();
    await firstKitchen.getByRole('button', { name:/Accept & Start Preparing/ }).click();
    await expect(a.getByText('Preparing', {exact:true}).first()).toBeVisible();
    const second=await submit(b,'Sprite','Second batch');
    expect(second.approvalType).toBe('automatic'); expect(second.status).toBe('approved');
    expect(second.initialApprovalOrderId).toBe(first.id);
    await expect(k.locator(`[data-batch-id="${second.id}"]`)).toBeVisible();
    await a.getByRole('button', { name:'Finish ordering & request bill' }).click();
    await expect(table.getByText('Bill requested', {exact:true})).toBeVisible();
    await expect(table.getByRole('button', { name:'Confirm payment & close visit' })).toBeDisabled();
    const blocked=await staff.request.post(`/api/dining/visits/${first.sessionId}/pay`, {data:{paymentMethod:'cash',amountReceived:300,expectedTotal:290}}); expect(blocked.status()).toBe(409);
    const secondReview=table.locator(`[data-batch-id="${second.id}"]`);
    await expect(secondReview.getByText('Sent directly to kitchen · Read-only record', { exact: true })).toBeVisible();
    await expect(secondReview.getByRole('button')).toHaveCount(0);
    const secondKitchen=k.locator(`[data-batch-id="${second.id}"]`); await expect(secondKitchen).toBeVisible();
    await secondKitchen.getByRole('button', { name:/Accept & Start Preparing/ }).click();
    await firstKitchen.getByRole('button', { name:/Mark as Ready to Serve/ }).click();
    await expect(table.getByRole('button', { name:'Confirm payment & close visit' })).toBeDisabled();
    await firstReview.getByRole('button', { name:'Confirm delivered & mark served' }).click();
    await secondKitchen.getByRole('button', { name:/Mark as Ready to Serve/ }).click();
    await expect(secondReview.getByText('Ready to serve', { exact: true })).toBeVisible();
    await expect(secondReview.getByRole('button')).toHaveCount(0);
    await secondKitchen.getByRole('button', { name:/Confirm Served/ }).click();
    await expect(table.getByRole('button', { name:'Confirm payment & close visit' })).toBeEnabled();
    await table.getByLabel('Cash received').fill('300'); await table.getByRole('button', { name:'Confirm payment & close visit' }).click();
    await expect(a.getByRole('heading', { name:'Thank you for dining with us' })).toBeVisible();
    const state=await (await staff.request.get('/api/dining/state')).json();
    expect(state.orders.filter(o => o.sessionId === first.sessionId).map(o => o.status)).toEqual(['served','served']);
    expect(state.transactions.find(t => t.sessionId === first.sessionId).totalBill).toBe(290);
    const audit=await (await staff.request.get(`/api/dining/visits/${first.sessionId}/audit`)).json(); expect(audit.filter(e=>e.event_type==='batch_approved')).toHaveLength(2);
    expect(audit.filter(e=>e.event_type==='batch_approved' && e.actor_role==='cashier')).toHaveLength(1);
    expect(audit.filter(e=>e.event_type==='batch_approved' && e.actor_role==='system')).toHaveLength(1);
    await table.getByRole('button', { name:'Open dining session' }).click(); const nextCode=(await table.locator('strong.success').innerText()).trim(); expect(nextCode).not.toBe(code);
    await a.getByRole('button', { name:'Join a new visit' }).click(); await a.getByLabel('Visit code').fill(nextCode); await a.getByRole('button', { name:'Open menu' }).click();
    await a.getByRole('button', { name:'Table orders & bill' }).click(); await expect(a.getByText('No orders yet.', {exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(c=>c.close())); }
});

test('cashier review can cancel an unapproved batch with a recorded reason', async ({ browser }) => {
  const staff=await browser.newContext(), phone=await browser.newContext();
  try {
    const cashier=await staff.newPage(); await login(cashier,'cashier');
    const table=cashier.locator('article').filter({has:cashier.getByRole('heading',{name:'Table 3',exact:true})});
    await table.getByRole('button',{name:'Open dining session'}).click(); const code=(await table.locator('strong.success').innerText()).trim();
    const customer=await phone.newPage(); await customer.goto('/customer/3'); await customer.getByLabel('Visit code').fill(code); await customer.getByRole('button',{name:'Open menu'}).click();
    await customer.getByRole('button',{name:'Add Coke to batch',exact:true}).click(); await customer.getByRole('button',{name:'Your cart (1)',exact:true}).click(); await customer.getByRole('button',{name:'Submit batch'}).click();
    await cashier.goto('/cashier/orders'); const batch=cashier.locator('.batch-card').filter({has:cashier.getByRole('heading',{name:'Table 3 · Batch 1',exact:true})});
    await batch.getByRole('button',{name:'Cancel batch',exact:true}).click(); await batch.getByLabel('Cancellation reason').fill('Customer changed their selection'); await batch.getByRole('button',{name:'Confirm cancellation'}).click();
    await expect(customer.getByText('Cancelled',{exact:true}).first()).toBeVisible(); await expect(customer.getByText('Cancelled: Customer changed their selection')).toBeVisible();
  } finally { await staff.close(); await phone.close(); }
});

test('two phones queue behind one initial approval and cashier follow-up records have no actions', async ({ browser }) => {
  test.setTimeout(60000);
  const staff = await browser.newContext(), kitchen = await browser.newContext(), phoneA = await browser.newContext(), phoneB = await browser.newContext();
  try {
    const cashier = await staff.newPage(); await login(cashier, 'cashier');
    const table = cashier.locator('.qr-print [data-table-id="4"]');
    await table.getByRole('button', { name: 'Open dining session', exact: true }).click();
    const code = (await table.locator('strong.success').innerText()).trim();
    async function queue(context, item: string) {
      const page = await context.newPage(); await page.goto('/customer/4');
      await page.getByLabel('Visit code').fill(code); await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      const card = page.locator('article').filter({ has: page.getByRole('heading', { name: item, exact: true }) });
      await card.getByRole('button', { name: `Add ${item} to batch`, exact: true }).click();
      if (item === 'Rice') await card.screenshot({ path: 'test-results/customer-add-to-batch.png' });
      await page.getByRole('button', { name: 'Your cart (1)', exact: true }).click();
      const response = page.waitForResponse(r => r.url().endsWith('/orders') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Submit batch', exact: true }).click();
      const order = await (await response).json();
      await expect(page.getByRole('heading', { name: 'Shared order history', exact: true })).toBeVisible();
      return order;
    }
    const first = await queue(phoneA, 'Rice'), second = await queue(phoneB, 'Coke');
    expect(first.status).toBe('submitted'); expect(second.status).toBe('submitted');
    const k = await kitchen.newPage(); await login(k, 'kitchen');
    await expect(k.locator(`[data-batch-id="${first.id}"]`)).toHaveCount(0);
    await expect(k.locator(`[data-batch-id="${second.id}"]`)).toHaveCount(0);
    const queued = table.locator(`[data-batch-id="${second.id}"]`);
    await expect(queued.getByText('Queued until the first batch is approved.', { exact: true })).toBeVisible();
    await expect(queued.getByRole('button')).toHaveCount(0);
    await cashier.getByRole('link', { name: 'Orders', exact: true }).click();
    const firstRecord = cashier.locator(`[data-batch-id="${first.id}"]`), secondRecord = cashier.locator(`[data-batch-id="${second.id}"]`);
    await expect(secondRecord).toBeVisible(); await expect(secondRecord.getByRole('button')).toHaveCount(0);
    await firstRecord.getByRole('button', { name: 'Approve & send to kitchen', exact: true }).click();
    await expect(k.locator(`[data-batch-id="${first.id}"]`)).toBeVisible();
    await expect(k.locator(`[data-batch-id="${second.id}"]`)).toBeVisible();
    await expect(secondRecord.getByText(/Sent directly to kitchen · Read-only record/)).toBeVisible();
    await expect(secondRecord.getByRole('button')).toHaveCount(0);
    const audit = await (await staff.request.get(`/api/dining/visits/${first.sessionId}/audit`)).json();
    expect(audit.filter(e => e.event_type === 'batch_approved' && e.actor_role === 'cashier')).toHaveLength(1);
    expect(audit.filter(e => e.event_type === 'batch_approved' && e.actor_role === 'system')).toHaveLength(1);
  } finally { await Promise.all([staff.close(), kitchen.close(), phoneA.close(), phoneB.close()]); }
});
