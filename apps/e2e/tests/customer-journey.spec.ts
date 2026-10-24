import { expect, test } from '@playwright/test';
import { totp } from './totp';

const API = process.env.API_URL ?? 'http://localhost:4000';
const shots = process.env.SCREENSHOT_DIR;
const snap = async (page: import('@playwright/test').Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

test('customer can register, onboard, fund and buy a stock (sandbox)', async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.test`;
  const password = 'e2e-correct-horse-battery';

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Invest with/ })).toBeVisible();
  await expect(page.getByText(/Sandbox environment/).first()).toBeVisible();
  await snap(page, '01-landing');

  await page.getByRole('link', { name: 'Open account' }).first().click();
  await page.getByLabel('Full name').fill('Grace Hopper');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Country of residence').selectOption('GB');
  await snap(page, '02-register');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

  // Sandbox: read the captured verification email.
  const mail = await (await request.get(`${API}/v1/dev/mailbox?to=${encodeURIComponent(email)}`)).json();
  const link = (mail as Array<{ body: string }>)[0]!.body.match(/https?:\/\/\S+/)![0];
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Grace/ })).toBeVisible();
  await snap(page, '03-dashboard-new');

  // Onboarding: MFA
  await page.getByRole('button', { name: /Continue setup/ }).click();
  await page.getByRole('button', { name: /Set up authenticator/ }).click();
  const secret = (await page.locator('p.num').first().textContent())!.replace(/\s/g, '');
  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify and enable' }).click();
  await expect(page.getByText('Two-factor authentication is on')).toBeVisible();
  await page.getByRole('button', { name: "I've saved my codes" }).click();

  // Profile
  await page.getByLabel('Legal first name').fill('Grace');
  await page.getByLabel('Legal last name').fill('Hopper');
  await page.getByLabel('Date of birth').fill('1985-12-09');
  await page.getByLabel('Nationality').selectOption('GB');
  await page.getByLabel('Tax identification number').fill('QQ123456C');
  await page.getByLabel('Mobile phone').fill('+447700900456');
  await page.getByLabel('Address line 1').fill('10 Downing Street');
  await page.getByLabel('City').fill('London');
  await page.getByLabel('Postal code').fill('SW1A 2AA');
  await page.getByLabel('Country of residence').selectOption('GB');
  await page.getByLabel('Employment status').selectOption('employed');
  await page.getByLabel('Main source of funds').selectOption('employment_income');
  await page.getByLabel('Annual income').selectOption('50k-100k');
  await page.getByLabel('Net worth (excluding home)').selectOption('100k-500k');
  await page.getByLabel('Investment experience').selectOption('good');
  await page.getByLabel('Risk tolerance').selectOption('moderate');
  await page.getByLabel('Politically exposed person?').selectOption('false');
  await page.getByLabel('Control person?').selectOption('false');
  await page.getByLabel('Exchange / broker affiliation?').selectOption('false');
  await snap(page, '04-onboarding-profile');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // Disclosures
  await expect(page.getByRole('heading', { name: 'Disclosures' })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(5);
  for (const cb of await page.getByRole('checkbox').all()) await cb.check();
  await page.getByRole('button', { name: 'Accept and continue' }).click();
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/brokerage account .* is open/)).toBeVisible({ timeout: 30_000 });

  // Funding: link bank (step-up) and deposit
  await page.goto('/app/funding');
  await page.getByRole('button', { name: 'Link account' }).first().click();
  await page.getByLabel('Nickname').fill('Main current account');
  await page.getByLabel('Last 4 digits of account number').fill('4321');
  await page.getByRole('button', { name: 'Link account' }).last().click();
  // Step-up may be requested depending on timing since MFA enrolment.
  const stepUp = page.getByRole('dialog', { name: "Confirm it's you" });
  if (await stepUp.isVisible().catch(() => false)) {
    await stepUp.getByLabel('Authenticator code').fill(totp(secret, 1));
    await stepUp.getByRole('button', { name: 'Confirm' }).click();
  }
  await page.getByLabel('Amount (USD)').fill('2500');
  await page.getByRole('button', { name: 'Deposit funds' }).click();
  await expect(page.getByText(/Deposit of \$2,500.00 initiated/)).toBeVisible();
  await expect(page.getByText('Settled').first()).toBeVisible({ timeout: 30_000 });
  await snap(page, '05-funding');

  // Trade
  await page.goto('/app/markets/AAPL');
  await expect(page.getByRole('heading', { name: 'Apple Inc.' })).toBeVisible();
  await page.getByLabel('Quantity (shares)').fill('3');
  await page.getByRole('button', { name: 'Review order' }).click();
  await expect(page.getByText('Estimated total')).toBeVisible();
  await snap(page, '06-order-review');
  await page.getByRole('button', { name: 'Confirm buy' }).click();
  await expect(page.getByRole('heading', { name: 'Order received' })).toBeVisible();
  await page.getByRole('button', { name: 'View order' }).click();
  await expect(page.getByText('Filled').first()).toBeVisible({ timeout: 30_000 });
  await snap(page, '07-order-detail');

  await page.goto('/app');
  await expect(page.getByRole('cell', { name: /AAPL/ }).first()).toBeVisible({ timeout: 30_000 });
  await snap(page, '08-dashboard-invested');

  await page.goto('/app/activity');
  await expect(page.getByText('Buy', { exact: true }).first()).toBeVisible();
  await snap(page, '09-activity');

  if (shots) {
    // Dark theme and phone layout of the same account.
    await page.evaluate(() => localStorage.setItem('aur-theme', 'dark'));
    await page.goto('/app');
    await expect(page.getByRole('cell', { name: /AAPL/ }).first()).toBeVisible();
    await snap(page, '13-dashboard-dark');
    await page.goto('/app/markets/MSFT');
    await expect(page.getByRole('heading', { name: 'Microsoft Corporation' })).toBeVisible();
    await page.waitForTimeout(500);
    await snap(page, '14-asset-dark');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.removeItem('aur-theme'));
    await page.goto('/app');
    await expect(page.getByRole('cell', { name: /AAPL/ }).first()).toBeVisible();
    await snap(page, '15-dashboard-mobile');
  }
});

test('unauthenticated users are redirected to sign in', async ({ page }) => {
  await page.goto('/app/funding');
  await expect(page).toHaveURL(/\/login/);
});
