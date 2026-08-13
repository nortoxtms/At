#!/usr/bin/env node
/**
 * Load generator for §24.15 and §24.16.
 *
 *   §24.15 — API p95 < 300 ms reads / < 800 ms writes at 200 concurrent users
 *   §24.16 — search p95 < 200 ms with 50 000 listings
 *
 * §27 names k6. k6 is not installed in this environment and cannot be, so this
 * is the same measurement written against Node's own HTTP client: N virtual
 * users, each looping request → think-time → request for a fixed duration,
 * with latency recorded per request and percentiles taken over the whole run.
 * It is weaker than k6 in one specific way — it shares a single event loop, so
 * at high concurrency the generator itself contributes queueing delay. That
 * biases the numbers *upward*, so a pass here is a real pass; a marginal
 * failure would deserve a re-run on a proper generator before being believed.
 *
 * Usage:
 *   node scripts/perf.mjs                       # full run
 *   VUS=50 DURATION=15 node scripts/perf.mjs    # shorter
 *
 * The API must be running with LOAD_TEST_RATE_MULTIPLIER set high enough that
 * §12's budgets do not stop the run (see rate-limit.guard.ts); otherwise this
 * measures the rate limiter.
 */
import { setTimeout as sleep } from 'node:timers/promises';

const API = process.env.API ?? 'http://localhost:3001';
const VUS = Number(process.env.VUS ?? 200);
const DURATION_S = Number(process.env.DURATION ?? 30);
const WARMUP_S = Number(process.env.WARMUP ?? 5);

const bold = (s) => `[1m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const red = (s) => `[31m${s}[0m`;

/** Percentile over a sorted copy; nearest-rank, which never flatters a tail. */
function percentile(values, p) {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

async function timed(fn) {
  const started = process.hrtime.bigint();
  try {
    const ok = await fn();
    return { ms: Number(process.hrtime.bigint() - started) / 1e6, ok };
  } catch {
    return { ms: Number(process.hrtime.bigint() - started) / 1e6, ok: false };
  }
}

const json = (r) => r.json();

async function register(tag) {
  const email = `perf-${tag}-${Date.now()}@example.com`;
  const response = await fetch(`${API}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'guclu-sifre-123', displayName: `Perf ${tag}` }),
  });
  const body = await json(response);
  if (!body?.data?.tokens?.accessToken) {
    throw new Error(`register failed: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.data.tokens.accessToken;
}

/**
 * Scenarios. Each is one request a virtual user makes; `kind` decides which
 * §24.15 budget it is judged against, and `name` is what the table reports.
 */
const QUERIES = ['at', 'kısrak', 'aygır', 'safkan', 'jumper', 'dressage', 'genç', ''];
const REGIONS = ['İstanbul', 'İzmir', 'Antalya', 'Bursa', 'Konya'];

function scenarios(token, listings, horseId) {
  const auth = { authorization: `Bearer ${token}` };
  const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

  return [
    {
      name: 'GET /listings/search (free text)',
      kind: 'search',
      run: () =>
        fetch(
          `${API}/v1/listings/search?q=${encodeURIComponent(pick(QUERIES))}&limit=20`,
        ).then((r) => r.ok),
    },
    {
      name: 'GET /listings/search (faceted)',
      kind: 'search',
      run: () =>
        fetch(
          `${API}/v1/listings/search?region=${encodeURIComponent(pick(REGIONS))}` +
            `&priceMax=250000&sort=recommended&limit=20`,
        ).then((r) => r.ok),
    },
    {
      name: 'GET /listings/:slug',
      kind: 'read',
      run: () => fetch(`${API}/v1/listings/${pick(listings).slug}`).then((r) => r.ok),
    },
    {
      name: 'GET /reference/breeds',
      kind: 'read',
      run: () => fetch(`${API}/v1/reference/breeds`).then((r) => r.ok),
    },
    {
      name: 'GET /me (authenticated)',
      kind: 'read',
      run: () => fetch(`${API}/v1/me`, { headers: auth }).then((r) => r.ok),
    },
    {
      // §16's free plan allows 3 horse registrations, so a create loop would
      // measure the *rejection* path after the third request. An update is the
      // honest write: it takes the same RLS-scoped transaction and touches the
      // same table, without a quota deciding the result.
      name: 'PATCH /horses/:id (write)',
      kind: 'write',
      run: async () => {
        const response = await fetch(`${API}/v1/horses/${horseId}`, {
          method: 'PATCH',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ heightCm: 150 + Math.floor(Math.random() * 30) }),
        });
        return response.ok;
      },
    },
    {
      name: 'POST /saved (write)',
      kind: 'write',
      run: async () => {
        const saved = await fetch(`${API}/v1/saved`, {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ itemType: 'listing', itemId: pick(listings).id }),
        });
        return saved.ok;
      },
    },
  ];
}

async function run(label, scenario, vus, durationSeconds) {
  const samples = [];
  let failures = 0;
  const deadline = Date.now() + durationSeconds * 1000;

  const user = async () => {
    while (Date.now() < deadline) {
      const { ms, ok } = await timed(scenario.run);
      samples.push(ms);
      if (!ok) failures += 1;
      // A think-time keeps this a "concurrent users" test rather than a
      // saturation benchmark: §24.15's number is about users, not throughput.
      await sleep(20 + Math.random() * 40);
    }
  };

  await Promise.all(Array.from({ length: vus }, user));

  return {
    label,
    kind: scenario.kind,
    count: samples.length,
    failures,
    rps: samples.length / durationSeconds,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    max: Math.max(...samples),
  };
}

const BUDGET = { read: 300, write: 800, search: 200 };

async function main() {
  console.log(bold(`\nONLY HORSES — §24.15 / §24.16 load run`));
  console.log(`API ${API} · ${VUS} concurrent users · ${DURATION_S}s per scenario\n`);

  const health = await fetch(`${API}/health`).then(json);
  console.log(`health: ${JSON.stringify(health)}`);

  const slugPage = await fetch(`${API}/v1/listings/search?limit=50`).then(json);
  const total = slugPage?.meta?.total ?? 0;
  console.log(`corpus: ${bold(String(total))} indexed listings`);
  if (total < 50_000) {
    console.log(
      red(`  ! §24.16 asks for 50 000; this run measures ${total} and must be reported as such.`),
    );
  }

  const listings = (slugPage?.data ?? []).filter((i) => i.slug && i.id);
  if (listings.length === 0) throw new Error('no listings to read; seed the corpus first');

  const token = await register('vu');
  const horse = await fetch(`${API}/v1/horses`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: `Perf ${Math.random().toString(36).slice(2, 8)}`,
      sex: 'mare',
      breedId: 'arabian',
      color: 'doru',
      heightCm: 160,
      dateOfBirth: '2018-05-01',
    }),
  }).then(json);
  const horseId = horse?.data?.id;
  if (!horseId) throw new Error(`horse fixture failed: ${JSON.stringify(horse).slice(0, 200)}`);

  const plan = scenarios(token, listings, horseId);

  console.log(bold(`\nWarmup (${WARMUP_S}s, ${Math.min(20, VUS)} users)`));
  await run('warmup', plan[0], Math.min(20, VUS), WARMUP_S);

  const results = [];
  for (const scenario of plan) {
    process.stdout.write(`  ${scenario.name} … `);
    const result = await run(scenario.name, scenario, VUS, DURATION_S);
    results.push(result);
    const budget = BUDGET[result.kind];
    console.log(
      `${result.p95 <= budget ? green('p95 ' + result.p95.toFixed(0) + 'ms') : red('p95 ' + result.p95.toFixed(0) + 'ms')}` +
        ` (budget ${budget}ms, ${result.count} reqs, ${result.failures} failed)`,
    );
  }

  console.log(bold('\nResults\n'));
  const header = ['scenario', 'kind', 'reqs', 'fail', 'rps', 'p50', 'p95', 'p99', 'max', 'budget'];
  const rows = results.map((r) => [
    r.label,
    r.kind,
    String(r.count),
    String(r.failures),
    r.rps.toFixed(0),
    r.p50.toFixed(0),
    r.p95.toFixed(0),
    r.p99.toFixed(0),
    r.max.toFixed(0),
    `${BUDGET[r.kind]}ms`,
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i].length)),
  );
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(line(header));
  console.log(widths.map((w) => '─'.repeat(w)).join('  '));
  for (const row of rows) console.log(line(row));

  // Cost per request, with the queueing removed. p50 at one virtual user is
  // what the server actually spends; the p95 above it is that cost plus the
  // wait for a core. Reporting both is the difference between "the code is
  // slow" and "the box is too small", and only one of those is fixable here.
  console.log(bold('\nService time (1 user, no contention)\n'));
  for (const scenario of plan) {
    const solo = await run(scenario.name, scenario, 1, Math.max(3, Math.round(DURATION_S / 6)));
    console.log(
      `  ${scenario.name.padEnd(34)} p50 ${solo.p50.toFixed(1).padStart(6)}ms   ` +
        `p95 ${solo.p95.toFixed(1).padStart(6)}ms`,
    );
  }

  const failed = results.filter((r) => r.p95 > BUDGET[r.kind] || r.failures > 0);
  console.log('');
  if (failed.length === 0) {
    console.log(green(`✓ every scenario inside its budget at ${VUS} concurrent users`));
  } else {
    for (const r of failed) {
      console.log(
        red(
          `✗ ${r.label}: p95 ${r.p95.toFixed(0)}ms vs ${BUDGET[r.kind]}ms, ${r.failures} failures`,
        ),
      );
    }
    process.exitCode = 1;
  }
}

await main();
