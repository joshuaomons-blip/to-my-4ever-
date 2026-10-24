import { expect, test } from '@playwright/test';
import { totp } from './totp';

const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3001';
const shots = process.env.SCREENSHOT_DIR;

test('staff can sign in with MFA and see work queues', async ({ page }) => {
  test.skip(!process.env.ADMIN_TOTP_SECRET, 'ADMIN_TOTP_SECRET not provided');
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel('Work email').fill(process.env.ADMIN_EMAIL ?? 'admin@aureon.local');
  await page.getByLabel('Password').fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Authenticator code').fill(totp(process.env.ADMIN_TOTP_SECRET!, 0));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/10-admin-overview.png`, fullPage: true });
  await page.getByRole('link', { name: 'Controls & jurisdictions' }).click();
  await expect(page.getByRole('heading', { name: 'Platform controls' })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/11-admin-controls.png`, fullPage: true });
  await page.getByRole('link', { name: 'Reconciliation' }).click();
  await page.getByRole('button', { name: 'Run now' }).click();
  await expect(page.getByText('Trial balance: balanced')).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/12-admin-recon.png`, fullPage: true });
  await page.getByRole('link', { name: 'Audit log' }).click();
  await page.getByRole('button', { name: 'Verify chain' }).click();
  await expect(page.getByText('Chain intact')).toBeVisible();
});
