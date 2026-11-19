import { expect, Page, test } from '@playwright/test';

/**
 * Browser end-to-end tests of the StarRocks Logs Drilldown app in Grafana 12.0.1 with the unchanged
 * kotak-starrocks-datasource, mock IDAM sign-in and seeded StarRocks (scripts/e2e.sh up).
 */

const APP = '/a/kotak-starrocks-logs-app/explore';
const OBS = 'vw_eks_app_logs_app_1961_observability';
const CMM = 'vw_eks_app_logs_app_01996_frontlineplatforms_cmm';
const SHOTS = 'test-results/screenshots';

async function login(page: Page, user: string) {
  await page.goto('/login/generic_oauth');
  await page.locator('input[name=username]').fill(user);
  await page
    .locator('textarea[name=claims]')
    .fill(JSON.stringify({ aud: ['grafana-e2e'], email: `${user}@kotak.com` }));
  await page.locator('input[type=submit]').click();
  await page.waitForURL((url) => url.port === '23000' && !url.pathname.startsWith('/login'));
}

function appUrl(params: Record<string, string | string[]>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    for (const x of Array.isArray(v) ? v : [v]) {
      sp.append(k, x);
    }
  }
  return `${APP}?${sp.toString()}`;
}

const filter = (key: string, op: string, value: string) => [key, op, value].map(encodeURIComponent).join('|');
const logsMain = (page: Page) => page.getByTestId('logs-main');

test.describe('as kmbl3e2e (two granted views)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'kmbl3e2e');
  });

  test('the app is a card on the Drilldown page and opens', async ({ page }) => {
    await page.goto('/drilldown');
    const card = page.getByRole('link', { name: /StarRocks Logs Drilldown/ });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/\/a\/kotak-starrocks-logs-app/);
    await page.screenshot({ path: `${SHOTS}/01-drilldown-card.png` });
  });

  test('the view picker lists exactly the views this user is granted', async ({ page }) => {
    await page.goto(APP);
    const picker = page.getByLabel('View', { exact: true });
    await expect(page.getByText(CMM).first()).toBeVisible();
    await picker.click();
    const options = page.getByRole('option');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toHaveText(CMM);
    await expect(options.nth(1)).toHaveText(OBS);
    await page.keyboard.press('Escape');
  });

  test('service grid: volume and newest lines for every service, search, Show logs', async ({ page }) => {
    await page.goto(appUrl({ view: OBS }));
    for (const s of ['proxy', 'apilog', 'otel-collector', 'vector', 'loki-gateway']) {
      await expect(page.getByTestId(`service-row-${s}`)).toBeVisible();
    }
    await expect(page.getByTestId('service-row-proxy').getByTestId('service-samples')).toContainText(
      'kong-ingress-controller'
    );
    await page.screenshot({ path: `${SHOTS}/02-service-grid.png`, fullPage: true });

    await page.getByTestId('service-search').fill('otel');
    await expect(page.getByTestId('service-row-proxy')).toHaveCount(0);
    await expect(page.getByTestId('service-row-otel-collector')).toBeVisible();

    await page.getByTestId('show-logs-otel-collector').click();
    await expect(page.getByTestId('filter-chip')).toContainText('k8s_service_name = otel-collector');
    await expect(page).toHaveURL(/filter=k8s_service_name/);
    await expect(logsMain(page)).toContainText('request completed');
  });

  test('logs tab: level filter, line search, log details filter, trace link to Explore', async ({ page }) => {
    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'otel-collector') }));
    await expect(logsMain(page)).toContainText('traceid=');

    // level read from the message (logfmt level=error)
    await page.getByTestId('level-error').click();
    await expect(page).toHaveURL(/level=error/);
    await expect(logsMain(page)).toContainText('upstream timed out');
    await expect(logsMain(page)).not.toContainText('request completed');
    await page.getByTestId('level-error').click();

    // line search, case-insensitive by default
    await page.getByTestId('line-filter-input').fill('SLOW REQUEST');
    await page.getByTestId('line-include').click();
    await expect(page.getByTestId('line-chip')).toContainText('slow request'.toUpperCase());
    await expect(logsMain(page)).toContainText('slow request');
    await expect(logsMain(page)).not.toContainText('request completed');

    // open log details of the first line
    await logsMain(page).getByText('slow request').first().click();
    const viewTrace = page.getByRole('link', { name: /View trace/ }).first();
    await expect(viewTrace).toBeVisible();
    const href = await viewTrace.getAttribute('href');
    expect(href).toContain('/explore');
    expect(decodeURIComponent(href ?? '')).toContain('e2e-tempo-obs');
    expect(decodeURIComponent(href ?? '')).toMatch(/[0-9a-f]{32}/);
    await page.screenshot({ path: `${SHOTS}/03-log-details-trace-link.png` });

    // follow the trace link
    await viewTrace.click();
    await expect(page).toHaveURL(/\/explore/);
    expect(decodeURIComponent(page.url())).toContain('e2e-tempo-obs');
    await page.screenshot({ path: `${SHOTS}/04-explore-trace.png` });
  });

  test('filter buttons in log details add label filters', async ({ page }) => {
    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'vector') }));
    await logsMain(page).getByText('reconciled').first().click();
    await page
      .getByRole('button', { name: /Filter for value/ })
      .first()
      .click();
    await expect(page.getByTestId('filter-chip')).toHaveCount(2);
  });

  test('show context opens the context modal with lines of the same pod', async ({ page }) => {
    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'apilog') }));
    const row = logsMain(page).locator('tr').filter({ hasText: 'TrackWizzSaaS' }).first();
    await row.hover();
    await row.getByLabel('Show context').click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId('entry-row')).toBeVisible();
    await expect(modal).toContainText('TrackWizzSaaS');
    await page.screenshot({ path: `${SHOTS}/05-show-context.png` });
  });

  test('table and JSON views; Open in Explore carries the SQL', async ({ page }) => {
    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'loki-gateway'), display: 'table' }));
    await expect(logsMain(page)).toContainText('k8s_namespace_name');
    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'loki-gateway'), display: 'json' }));
    await expect(page.getByTestId('json-view')).toContainText('labels');
    const href = await page.getByTestId('open-in-explore').getAttribute('href');
    expect(decodeURIComponent(href ?? '')).toContain('rawSql');
    expect(decodeURIComponent(href ?? '')).toContain(OBS);
  });

  test('labels tab: overview, value breakdown, include', async ({ page }) => {
    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '!=', 'nothing'), tab: 'labels' }));
    await expect(page.getByTestId('breakdown-labels')).toBeVisible();
    await expect(page.getByTestId('select-k8s_namespace_name')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/06-labels-tab.png`, fullPage: true });
    await page.getByTestId('select-k8s_namespace_name').click();
    await expect(page.getByTestId('include-monitoring')).toBeVisible();
    await page.getByTestId('include-monitoring').click();
    await expect(page.getByTestId('filter-chip').filter({ hasText: 'k8s_namespace_name = monitoring' })).toBeVisible();
  });

  test('fields tab: columns and key=value fields found in the lines', async ({ page }) => {
    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'otel-collector'), tab: 'fields' }));
    const table = page.getByTestId('message-fields');
    await expect(table).toContainText('status');
    await expect(table).toContainText('duration_ms');
    await page.screenshot({ path: `${SHOTS}/07-fields-tab.png`, fullPage: true });
    await page.getByRole('button', { name: 'Include status=500' }).click();
    await expect(page.getByTestId('field-chip')).toContainText('status = 500');
  });

  test('patterns tab: configured patterns with counts, include, suggestions', async ({ page }) => {
    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '!=', 'nothing'), tab: 'patterns' }));
    const table = page.getByTestId('patterns-table');
    for (const name of [
      'Request completed',
      'Upstream timed out',
      'Connection refused',
      'Health check',
      '(unmatched)',
    ]) {
      await expect(table.getByTestId(`pattern-row-${name}`)).toBeVisible();
    }
    await page.screenshot({ path: `${SHOTS}/08-patterns-tab.png`, fullPage: true });
    await table.getByTestId('pattern-row-Upstream timed out').getByRole('button', { name: 'Include' }).click();
    await expect(page.getByTestId('pattern-chip')).toContainText('Upstream timed out');
    await page.getByTestId('suggest-patterns').click();
    await expect(page.getByTestId('pattern-suggestions')).toBeVisible();
  });

  test('trace link generated from the Loki derived field (cmm tenant)', async ({ page }) => {
    const line = ['include', '1', '0', encodeURIComponent('trace_id=')].join('|');
    await page.goto(appUrl({ view: CMM, filter: filter('k8s_service_name', '=', 'cmm-api'), line }));
    await logsMain(page).getByText('trace_id=').first().click();
    const viewTrace = page.getByRole('link', { name: /View Trace/i }).first();
    await expect(viewTrace).toBeVisible();
    expect(decodeURIComponent((await viewTrace.getAttribute('href')) ?? '')).toContain('e2e-tempo-cmm');
  });

  test('level-column tenant: levels come from the level column', async ({ page }) => {
    await page.goto(appUrl({ view: CMM }));
    await expect(page.getByTestId('service-row-cmm-api')).toBeVisible();
    await page.goto(appUrl({ view: CMM, filter: filter('k8s_service_name', '=', 'cmm-api'), level: 'error' }));
    await expect(logsMain(page)).toContainText('payment');
    await expect(logsMain(page)).not.toContainText('created order');
  });

  test('long text scans are guarded; Run anyway runs them', async ({ page }) => {
    const line = ['include', '0', '0', encodeURIComponent('timed out')].join('|');
    await page.goto(
      appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'proxy'), line, from: 'now-6h', to: 'now' })
    );
    await expect(page.getByTestId('scan-guard')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/09-scan-guard.png` });
    await page.getByRole('button', { name: 'Run anyway' }).click();
    await expect(page.getByTestId('scan-guard')).toHaveCount(0);
    await expect(logsMain(page)).toContainText('upstream timed out');
  });

  test('state is in the URL: reload keeps filters, back returns to the service grid', async ({ page }) => {
    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'vector'), level: 'error' }));
    await expect(page.getByTestId('filter-chip')).toContainText('vector');
    await page.reload();
    await expect(page.getByTestId('filter-chip')).toContainText('vector');
    await expect(page.getByTestId('level-error')).toBeVisible();
    await page.getByTestId('back-to-services').click();
    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
  });
});

test('another user sees only their own view', async ({ page }) => {
  await login(page, 'kmbl3other');
  await page.goto(APP);
  await expect(page.getByTestId('service-row-dpdpa-api')).toBeVisible();
  await page.getByLabel('View', { exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(1);
});

test('a user with no grants gets an explanation, not data', async ({ page }) => {
  await login(page, 'kmbl3none');
  await page.goto(APP);
  await expect(page.getByText(/Could not list your StarRocks log views/)).toBeVisible();
  await expect(page.getByText(/no access to any log view/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/10-no-access.png` });
});

test('admins see the effective configuration', async ({ page }) => {
  await login(page, 'kmbl3admin');
  await page.goto('/plugins/kotak-starrocks-logs-app?page=configuration');
  await expect(page.getByTestId('app-config')).toContainText('Effective configuration');
  await expect(page.getByTestId('app-config')).toContainText('e2e-tempo-obs');
});
