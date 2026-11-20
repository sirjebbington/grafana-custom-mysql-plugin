import { expect, Page, test } from '@playwright/test';

/**
 * Browser end-to-end tests of the Logs Drilldown (StarRocks) app in Grafana 12.0.1 with the unchanged
 * kotak-starrocks-datasource, mock IDAM sign-in and seeded StarRocks (scripts/e2e.sh up).
 */

const APP = '/a/kotak-starrocks-logs-app/explore';
const OBS = 'vw_eks_app_logs_app_1961_observability';
const CMM = 'vw_eks_app_logs_app_01996_frontlineplatforms_cmm';
const PAYMENTS = 'vw_eks_app_logs_app_04000_payments';
const DS1 = 'e2e-ds-starrocks-logs';
const DS2 = 'e2e-ds-starrocks-logs2';
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

// 0.1.0/0.2.0 link format (still read, converted to var-filters)
const filter = (key: string, op: string, value: string) => [key, op, value].map(encodeURIComponent).join('|');
// 0.3.0 format, written by the label filter combobox
const varFilter = (key: string, op: string, value: string) => [key, op, value].join('|');
const logsMain = (page: Page) => page.getByTestId('logs-main');
const labelFilters = (page: Page) => page.getByTestId('label-filters');
const pills = (page: Page) => page.getByRole('button', { name: /^Edit filter with key/ });
const serviceRows = (page: Page) => page.locator('[data-testid^="service-row-"]');

/** Picks options in the "Log levels" select. */
async function chooseLevels(page: Page, levels: string[]) {
  await page.getByLabel('Log levels').click();
  for (const l of levels) {
    await page.getByRole('option', { name: l, exact: true }).click();
  }
  await page.keyboard.press('Escape');
}

test.describe('as kmbl3e2e (two granted views)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'kmbl3e2e');
  });

  test('the app is a card on the Drilldown page and opens', async ({ page }) => {
    await page.goto('/drilldown');
    const card = page.getByRole('link', { name: /Logs Drilldown \(StarRocks\)/ });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/\/a\/kotak-starrocks-logs-app/);
    // opened by client-side navigation: the first view the user can read must be selected automatically
    await expect(page.getByTestId('service-row-cmm-api')).toBeVisible();
    await expect(page).toHaveURL(/view=vw_eks_app_logs_/);
    await page.screenshot({ path: `${SHOTS}/01-drilldown-card.png` });
  });

  test('layout: label filters left; data source, view, time and refresh right; quick ranges up to 24 hours', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(APP);
    await expect(page.getByTestId('service-row-cmm-api')).toBeVisible();
    const filters = await labelFilters(page).boundingBox();
    const ds = await page.getByTestId('datasource-picker').boundingBox();
    const view = await page.getByTestId('view-picker').boundingBox();
    const time = await page.getByTestId('data-testid TimePicker Open Button').boundingBox();
    expect(filters && ds && view && time).toBeTruthy();
    expect(filters!.x).toBeLessThan(ds!.x);
    expect(ds!.x).toBeLessThan(view!.x);
    expect(view!.x).toBeLessThan(time!.x);
    // one row at 1920 px with the menu docked: the pickers sit next to the label filters, not under them
    expect(Math.abs(filters!.y + filters!.height - (ds!.y + ds!.height))).toBeLessThan(12);
    // only the "service" tab and "Add label"; no other label tabs by default
    await expect(page.getByRole('tab')).toHaveCount(1);
    await expect(page.getByRole('tab', { name: 'service' })).toBeVisible();
    await expect(page.getByTestId('add-label')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/00-layout.png` });

    await page.getByTestId('data-testid TimePicker Open Button').click();
    await expect(page.getByText('Last 24 hours', { exact: true })).toBeVisible();
    await expect(page.getByText('Last 5 minutes', { exact: true })).toBeVisible();
    await expect(page.getByText('Last 2 days', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Last 7 days', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/00-quick-ranges.png` });
    await page.getByText('Last 3 hours', { exact: true }).click();
    await expect(page).toHaveURL(/from=now-3h/);
    // a narrow window: the pickers wrap under the label filters, right-aligned, nothing overlaps
    await page.setViewportSize({ width: 1280, height: 900 });
    const f2 = await labelFilters(page).boundingBox();
    const ds2 = await page.getByTestId('datasource-picker').boundingBox();
    expect(ds2!.y).toBeGreaterThan(f2!.y + f2!.height - 1);
    expect(f2!.width).toBeGreaterThanOrEqual(279);
    await page.screenshot({ path: `${SHOTS}/00-layout-narrow.png` });
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

  test('data source picker: both StarRocks databases, switching changes the views, kept in the URL', async ({
    page,
  }) => {
    await page.goto(APP);
    // default data source, first view (sorted): cmm
    await expect(page.getByTestId('service-row-cmm-api')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`ds=${DS1}`));
    const dsPicker = page.getByLabel('Data source', { exact: true });
    await dsPicker.click();
    const options = page.getByRole('option');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toContainText('app-logs-starrocks-db');
    await expect(options.nth(1)).toContainText('app-logs-starrocks-db2');
    await options.nth(1).click();
    await expect(page).toHaveURL(new RegExp(`ds=${DS2}`));
    // first view of the second database (sorted): payments
    await expect(page.getByTestId('service-row-payments-api')).toBeVisible();
    await page.getByLabel('View', { exact: true }).click();
    await expect(page.getByRole('option')).toHaveCount(2);
    await page.getByRole('option', { name: OBS }).click();
    await expect(page.getByTestId('service-row-archive-compactor')).toBeVisible();
    await expect(page.getByTestId('service-row-cmm-api')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/11-datasource-picker.png` });
    await page.reload();
    await expect(page.getByTestId('service-row-archive-compactor')).toBeVisible();
    await expect(page.getByText('app-logs-starrocks-db2').first()).toBeVisible();
  });

  test('per-database tenant settings: the level comes from the column in the second database', async ({ page }) => {
    await page.goto(
      appUrl({ ds: DS2, view: OBS, filter: filter('k8s_service_name', '=', 'archive-compactor'), level: 'error' })
    );
    await expect(logsMain(page)).toContainText('segment upload failed');
    await expect(logsMain(page)).not.toContainText('compacted segment');
  });

  test('service grid: volume and newest lines for every service, search values dropdown, Show logs', async ({
    page,
  }) => {
    await page.goto(appUrl({ view: OBS }));
    for (const svc of ['proxy', 'apilog', 'otel-collector', 'vector', 'loki-gateway']) {
      await expect(page.getByTestId(`service-row-${svc}`)).toBeVisible();
    }
    await expect(page.getByTestId('service-row-proxy').getByTestId('service-samples')).toContainText(
      'kong-ingress-controller'
    );
    await expect(page.getByText(/^Showing/)).toContainText('of');
    await page.screenshot({ path: `${SHOTS}/02-service-grid.png`, fullPage: true });

    // typing filters the grid and the dropdown lists the matching values with their line counts
    await page.getByLabel('Search values').click();
    await page.keyboard.type('otel');
    await expect(page.getByRole('option', { name: /otel-collector/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /otel-collector/ })).toContainText('lines');
    await expect(page.getByTestId('service-row-proxy')).toHaveCount(0);
    await expect(page.getByTestId('service-row-otel-collector')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/02b-search-values.png` });
    // picking a value from the dropdown keeps only that one
    await page.getByRole('option', { name: /otel-collector/ }).click();
    await expect(serviceRows(page)).toHaveCount(1);

    await page.getByTestId('show-logs-otel-collector').click();
    await expect(labelFilters(page)).toContainText('k8s_service_name = otel-collector');
    await expect(page).toHaveURL(
      /var-filters=k8s_service_name%7C%3D%7Cotel-collector|var-filters=k8s_service_name\|=\|otel-collector/
    );
    await expect(page).toHaveURL(/page=details/);
    await expect(logsMain(page)).toContainText('request completed');
  });

  test('Include on a service row adds a label filter and becomes Remove; Show logs above the grid', async ({
    page,
  }) => {
    await page.goto(appUrl({ view: OBS }));
    await expect(page.getByTestId('service-row-vector')).toBeVisible();
    await page.getByTestId('include-vector').click();
    await expect(page.getByTestId('include-vector')).toHaveText('Remove');
    await expect(labelFilters(page)).toContainText('k8s_service_name = vector');
    // the grid stays: every service is still listed
    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
    await page.getByTestId('include-proxy').click();
    await expect(pills(page)).toHaveCount(2);
    await page.screenshot({ path: `${SHOTS}/02c-include.png` });
    await page.getByTestId('include-proxy').click();
    await expect(page.getByTestId('include-proxy')).toHaveText('Include');
    await expect(pills(page)).toHaveCount(1);

    // Show logs above the grid: the logs of the current filters
    await page.getByTestId('show-logs').click();
    await expect(page).toHaveURL(/page=details/);
    await expect(logsMain(page)).toContainText('reconciled');
    await expect(logsMain(page)).not.toContainText('kong-ingress-controller');
    await page.getByTestId('back-to-services').click();
    await expect(page.getByTestId('include-vector')).toHaveText('Remove');
  });

  test('Add label: a closable tab with the values of that label', async ({ page }) => {
    await page.goto(appUrl({ view: OBS }));
    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
    await page.getByTestId('add-label').click();
    await page.getByLabel('Search labels').fill('namespace');
    await page.getByRole('option', { name: 'k8s_namespace_name', exact: true }).click();
    await expect(page.getByRole('tab', { name: /k8s_namespace_name/ })).toBeVisible();
    await expect(page.getByTestId('service-row-monitoring')).toBeVisible();
    await expect(page).toHaveURL(/label=k8s_namespace_name/);
    await expect(page).toHaveURL(/tabs=k8s_namespace_name/);
    await page.screenshot({ path: `${SHOTS}/02d-add-label.png` });
    // Include on this tab filters by namespace
    await page.getByTestId('include-monitoring').click();
    await expect(labelFilters(page)).toContainText('k8s_namespace_name = monitoring');
    // back to the service tab: only the services in the included namespace
    await page.getByRole('tab', { name: 'service' }).click();
    await expect(page.getByTestId('service-row-otel-collector')).toBeVisible();
    await expect(page.getByTestId('service-row-loki-gateway')).toBeVisible();
    await expect(page.getByTestId('service-row-proxy')).toHaveCount(0);
    // close the added tab
    await page.getByRole('tab', { name: /k8s_namespace_name/ }).click();
    await expect(page.getByTestId('service-row-monitoring')).toBeVisible();
    await page.getByRole('button', { name: 'Remove k8s_namespace_name tab' }).click();
    await expect(page.getByRole('tab')).toHaveCount(1);
    await expect(page.getByTestId('service-row-otel-collector')).toBeVisible();
  });

  test('label filter combobox: labels, then a dropdown of values', async ({ page }) => {
    await page.goto(appUrl({ view: OBS }));
    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
    await labelFilters(page).getByPlaceholder('Filter by label values').click();
    await page.keyboard.type('k8s_namespace');
    await page.getByRole('option', { name: 'k8s_namespace_name', exact: true }).click();
    await page.getByRole('option', { name: /^= Equals/ }).click();
    // values of the label in the selected time range
    await expect(page.getByRole('option', { name: 'monitoring', exact: true })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/02e-values-dropdown.png` });
    await page.getByRole('option', { name: 'monitoring', exact: true }).click();
    await expect(labelFilters(page)).toContainText('k8s_namespace_name = monitoring');
    await expect(page).toHaveURL(/var-filters=k8s_namespace_name/);
  });

  test('favourites are listed first', async ({ page }) => {
    await page.goto(appUrl({ view: OBS }));
    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
    const first = await serviceRows(page).first().getAttribute('data-testid');
    expect(first).not.toBe('service-row-loki-gateway');
    await page.getByTestId('favorite-loki-gateway').click();
    await page.reload();
    await expect(page.getByTestId('service-row-loki-gateway')).toBeVisible();
    await expect(serviceRows(page).first()).toHaveAttribute('data-testid', 'service-row-loki-gateway');
  });

  test('a view is always selected: invalid or missing view in the URL, last view remembered', async ({ page }) => {
    await page.goto(appUrl({ ds: DS1, view: 'vw_eks_app_logs_does_not_exist' }));
    await expect(page.getByTestId('service-row-cmm-api')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`view=${CMM}`));
    await page.goto(appUrl({ view: OBS }));
    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
    // opening the app again without a view: the last view used
    await page.goto(APP);
    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`view=${OBS}`));
    // an empty view parameter does not clear the selection
    await page.goto(appUrl({ ds: DS1, view: '' }));
    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
  });

  test('logs: scrolling to the end loads the next lines (infinite scroll)', async ({ page }) => {
    await page.goto(appUrl({ view: OBS, page: 'details' }));
    const rows = logsMain(page).locator('tr');
    await expect(rows.first()).toBeVisible();
    await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(1000);
    const before = await rows.count();
    expect(before).toBeLessThanOrEqual(1000);
    const box = await logsMain(page).boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + Math.min(box!.height, 600) / 2);
    await expect
      .poll(
        async () => {
          await page.mouse.wheel(0, 50_000);
          return rows.count();
        },
        { timeout: 60_000, intervals: [1000] }
      )
      .toBeGreaterThan(1000);
    await page.screenshot({ path: `${SHOTS}/12-infinite-scroll.png` });
    // the pages join without duplicates: ids are stable and the bounds are exact
    const texts = await rows.evaluateAll((trs) => trs.map((tr) => tr.textContent ?? ''));
    expect(new Set(texts).size).toBeGreaterThan(1000);
  });

  test('logs tab: level filter, line search, log details filter, trace link to Explore', async ({ page }) => {
    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'otel-collector') }));
    await expect(logsMain(page)).toContainText('traceid=');

    // level read from the message (logfmt level=error), chosen in "Log levels"
    await chooseLevels(page, ['error']);
    await expect(page).toHaveURL(/level=error/);
    await expect(logsMain(page)).toContainText('upstream timed out');
    await expect(logsMain(page)).not.toContainText('request completed');
    await page
      .getByTestId('log-levels')
      .getByRole('button', { name: /Remove error|Remove/ })
      .first()
      .click();
    await expect(page).not.toHaveURL(/level=error/);

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
    await expect(pills(page)).toHaveCount(2);
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
    await expect(labelFilters(page)).toContainText('k8s_namespace_name = monitoring');
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
    await page.goto(
      appUrl({
        view: OBS,
        page: 'details',
        'var-filters': varFilter('k8s_service_name', '=', 'vector'),
        level: 'error',
      })
    );
    await expect(labelFilters(page)).toContainText('k8s_service_name = vector');
    await expect(page.getByTestId('log-levels')).toContainText('error');
    await page.reload();
    await expect(labelFilters(page)).toContainText('vector');
    await expect(page.getByTestId('log-levels')).toContainText('error');
    await page.getByTestId('back-to-services').click();
    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
    await expect(page.getByTestId('include-vector')).toHaveText('Remove');
    // browser back returns to the logs (vector, errors only)
    await page.goBack();
    await expect(page).toHaveURL(/page=details/);
    await expect(logsMain(page)).toContainText('failed to sync pod');
    await expect(logsMain(page)).not.toContainText('reconciled');
    // and forward to the grid again
    await page.goForward();
    await expect(page.getByTestId('service-row-proxy')).toBeVisible();
  });

  test('old links (filter=...) still open the logs of that filter', async ({ page }) => {
    await page.goto(appUrl({ view: OBS, filter: filter('k8s_service_name', '=', 'vector') }));
    await expect(labelFilters(page)).toContainText('k8s_service_name = vector');
    await expect(logsMain(page)).toContainText('reconciled');
    await expect(page).toHaveURL(/var-filters=/);
    await expect(page).not.toHaveURL(/[?&]filter=/);
  });
});

test('another user sees only their own view', async ({ page }) => {
  await login(page, 'kmbl3other');
  await page.goto(APP);
  await expect(page.getByTestId('service-row-dpdpa-api')).toBeVisible();
  await page.getByLabel('View', { exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(1);
});

test('a user with access to the second database only lands on it', async ({ page }) => {
  await login(page, 'kmbl3db2only');
  await page.goto(APP);
  await expect(page.getByTestId('service-row-payments-api')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`ds=${DS2}`));
  await expect(page).toHaveURL(new RegExp(`view=${PAYMENTS}`));
  // the first data source is still offered, marked with why it could not be used
  await page.getByLabel('Data source', { exact: true }).click();
  await expect(page.getByRole('option').first()).toContainText(/refused|invalid connection|denied/i);
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
