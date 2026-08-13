#!/usr/bin/env node
/**
 * Calls the endpoints no other test calls.
 *
 * A proxy recording of every milestone suite, the browser E2E and the account
 * run showed 79 of 137 routes exercised. The other 58 had never been called by
 * anything — and the first one anybody did call, `POST /listings/:id/pause`,
 * had been broken since the day it was written.
 *
 * So this is not a unit-test suite and does not pretend to be one. It is the
 * cheapest question that finds that class of bug: *does this endpoint respond
 * at all, with the status its contract implies?* Anything deeper — that the
 * update actually updated, that the rule was applied — belongs in the
 * milestone scripts, where the surrounding state exists to assert against.
 *
 * Where the assertion is cheap it is made anyway: a read-back after a write, a
 * count that must change, a refusal that must name its reason.
 *
 *   node scripts/coverage-sweep.mjs
 *
 * Needs the API on :3001 and a database with the §9 reference data.
 */
import pg from 'pg';

const API = process.env.API ?? 'http://localhost:3001';
const DB = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/only_horses';
const CRON = process.env.CRON_SECRET ?? 'local-dev-secret-only-not-for-production-32chars';
const STAMP = Date.now();

let failures = 0;
let checks = 0;

const bold = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const pass = (s) => {
  checks += 1;
  console.log(`\x1b[32m  ✓\x1b[0m ${s}`);
};
const fail = (s) => {
  checks += 1;
  failures += 1;
  console.log(`\x1b[31m  ✗ ${s}\x1b[0m`);
};

async function req(method, path, { token, body, expect = [200, 201, 204] } = {}) {
  const response = await fetch(`${API}/v1${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  const ok = expect.includes(response.status);
  const label = `${method} ${path} → ${response.status}`;

  if (ok) pass(label);
  else fail(`${label} (expected ${expect.join('/')}) ${text.slice(0, 160)}`);

  return { status: response.status, data: parsed?.data, error: parsed?.error, ok };
}

async function register(tag) {
  const response = await fetch(`${API}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `sweep-${tag}-${STAMP}@example.com`,
      password: 'guclu-sifre-123',
      displayName: `Sweep ${tag}`,
    }),
  });
  const body = await response.json();
  if (!body?.data) throw new Error(`register ${tag}: ${JSON.stringify(body).slice(0, 200)}`);
  return { token: body.data.tokens.accessToken, profile: body.data.profile, email: `sweep-${tag}-${STAMP}@example.com` };
}

async function sql(query, params = []) {
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  try {
    return await client.query(query, params);
  } finally {
    await client.end();
  }
}

async function verifyIdentity(profileId) {
  await sql(
    `INSERT INTO verifications (profile_id, kind, status, provider, decided_at)
     VALUES ($1, 'identity', 'approved', 'stripe_identity', now())`,
    [profileId],
  );
  await sql(`UPDATE profiles SET verification_level = 'identity_verified' WHERE id = $1`, [
    profileId,
  ]);
}

async function main() {
  const seller = await register('seller');
  const buyer = await register('buyer');
  const staff = await register('staff');

  const sellerId = (await req('GET', '/me', { token: seller.token })).data.id;
  const buyerId = (await req('GET', '/me', { token: buyer.token })).data.id;
  const staffId = (await req('GET', '/me', { token: staff.token })).data.id;

  await verifyIdentity(sellerId);
  await verifyIdentity(buyerId);
  await sql(`UPDATE profiles SET is_moderator = TRUE, is_admin = TRUE WHERE id = $1`, [staffId]);

  // ── auth ─────────────────────────────────────────────────────────────
  bold('auth');
  const login = await req('POST', '/auth/login', {
    body: { email: seller.email, password: 'guclu-sifre-123' },
  });
  const refreshToken = login.data?.tokens?.refreshToken;

  if (refreshToken) {
    const refreshed = await req('POST', '/auth/refresh', { body: { refreshToken } });
    if (refreshed.data?.accessToken) pass('refresh returns a new access token');
    else fail('refresh returned no access token');
  } else {
    fail('login returned no refresh token');
  }

  await req('POST', '/auth/logout', { token: seller.token, expect: [204] });
  await req('POST', '/auth/login', {
    body: { email: seller.email, password: 'yanlis-sifre' },
    expect: [401],
  });

  // ── reference data ───────────────────────────────────────────────────
  bold('reference (§9)');
  for (const [path, minimum] of [
    ['/reference/breeds', 100],
    ['/reference/disciplines', 20],
    ['/reference/service-categories', 20],
  ]) {
    const result = await req('GET', path);
    const count = Array.isArray(result.data) ? result.data.length : 0;
    if (count >= minimum) pass(`${path} returns ${count} rows`);
    else fail(`${path} returned ${count} rows, expected at least ${minimum}`);
  }

  // ── profiles ─────────────────────────────────────────────────────────
  bold('profiles');
  await req('PATCH', '/me', {
    token: seller.token,
    body: { bio: 'Ankara’da dresaj çalışıyorum.', city: 'Ankara', region: 'Ankara' },
    expect: [200, 204],
  });
  const afterPatch = await req('GET', '/me', { token: seller.token });
  if (afterPatch.data?.city === 'Ankara') pass('PATCH /me persisted');
  else fail(`PATCH /me did not persist (city=${afterPatch.data?.city})`);

  const handle = afterPatch.data?.handle;
  await req('GET', `/profiles/${handle}`);
  await req('GET', `/profiles/${sellerId}/reviews`);

  const role = await req('POST', '/me/roles', {
    token: seller.token,
    body: { role: 'trainer', isPublic: true, headline: 'Dresaj eğitmeni' },
    expect: [200, 201],
  });
  const roleId = role.data?.id;
  if (roleId) {
    await req('PATCH', `/me/roles/${roleId}`, {
      token: seller.token,
      body: { headline: 'Dresaj ve genç at eğitimi' },
      expect: [200, 204],
    });
    await req('POST', `/me/roles/${roleId}/credentials`, {
      token: seller.token,
      body: { kind: 'certificate', title: 'FEI Level 1', issuer: 'FEI', issuedOn: '2021-06-01' },
      expect: [200, 201],
    });
    await req('DELETE', `/me/roles/${roleId}`, { token: seller.token, expect: [200, 204] });
  } else {
    fail('POST /me/roles returned no id, so the role routes below cannot run');
  }

  // ── the "my …" reads ─────────────────────────────────────────────────
  bold('me/*');
  for (const path of [
    '/me/dashboard',
    '/me/limits',
    '/me/horses',
    '/me/listings',
    '/me/services',
    '/me/jobs',
    '/me/applications',
    '/me/organizations',
    '/me/data-requests',
    '/me/access-requests',
  ]) {
    await req('GET', path, { token: seller.token });
  }

  // ── horses ───────────────────────────────────────────────────────────
  bold('horses');
  const horse = (
    await req('POST', '/horses', {
      token: seller.token,
      body: {
        name: `Sweep ${STAMP}`,
        sex: 'mare',
        breedId: 'arabian',
        color: 'doru',
        heightCm: 160,
        dateOfBirth: '2017-06-01',
        disciplines: ['dressage'],
      },
      expect: [200, 201],
    })
  ).data;

  const competition = await req('POST', `/horses/${horse.id}/competitions`, {
    token: seller.token,
    body: {
      eventName: 'Ankara Bahar Kupası',
      discipline: 'dressage',
      level: 'L',
      eventDate: '2025-04-12',
      placing: 2,
      riderName: 'Ayşe Yılmaz',
    },
    expect: [200, 201],
  });
  const competitions = await req('GET', `/horses/${horse.id}/competitions`, {
    token: seller.token,
  });
  if (Array.isArray(competitions.data) && competitions.data.length > 0) {
    pass('the competition reads back');
  } else {
    fail('the competition was written but does not read back');
  }
  void competition;

  const record = await req('POST', `/horses/${horse.id}/health`, {
    token: seller.token,
    body: { type: 'farrier', title: 'Nal değişimi', performedOn: '2026-07-01' },
    expect: [200, 201],
  });
  const recordId = record.data?.id;
  if (recordId) {
    await req('PATCH', `/horses/${horse.id}/health/${recordId}`, {
      token: seller.token,
      body: { title: 'Nal değişimi (ön)' },
      expect: [200, 204],
    });
    await req('DELETE', `/horses/${horse.id}/health/${recordId}`, {
      token: seller.token,
      expect: [200, 204],
    });
  } else {
    fail('POST /horses/:id/health returned no id');
  }

  // ── listings ─────────────────────────────────────────────────────────
  bold('listings');
  const media = await uploadPhotos(seller.token, horse.id, 8);
  const listing = (
    await req('POST', '/listings', {
      token: seller.token,
      body: {
        horseId: horse.id,
        type: 'sale',
        title: `Sweep ${STAMP} — dresaj kısrağı`,
        description:
          'Sakin mizaçlı, düzenli çalışan bir kısrak. Sağlık kayıtları eksiksiz tutuluyor, ' +
          'nal bakımı altı haftada bir yapılıyor ve aşıları güncel. Manejde ve arazide rahat ' +
          'çalışır, nakliyeye alışkındır. Deneme binişine ve alım öncesi veteriner muayenesine ' +
          'açığız; röntgenler ve sağlık dosyası talep üzerine paylaşılır.',
        priceAmount: 240000,
        priceCurrency: 'TRY',
        priceType: 'fixed',
        countryCode: 'TR',
        region: 'Ankara',
        city: 'Ankara',
      },
      expect: [200, 201],
    })
  ).data;

  await req('PATCH', `/listings/${listing.id}`, {
    token: seller.token,
    body: { priceAmount: 250000 },
    expect: [200, 204],
  });
  await req('GET', `/listings/${listing.id}/quality`, { token: seller.token });
  await req('POST', `/listings/${listing.id}/publish`, { token: seller.token, expect: [200, 201] });
  await req('GET', `/listings/${listing.slug}`);
  await req('GET', `/listings/${listing.id}/stats`, { token: seller.token });
  await req('GET', `/listings/similar/${listing.id}`);
  await req('GET', '/listings/search?limit=5');
  await req('GET', '/search/suggest?q=sweep');

  // §5: renew only applies to an expired listing, so expire it first.
  await sql(`UPDATE listings SET status = 'expired', expires_at = now() - interval '1 day' WHERE id = $1`, [
    listing.id,
  ]);
  await req('POST', `/listings/${listing.id}/renew`, { token: seller.token, expect: [200, 201] });
  const renewed = await sql(`SELECT status FROM listings WHERE id = $1`, [listing.id]);
  if (renewed.rows[0]?.status === 'active') pass('renew moved an expired listing back to active');
  else fail(`renew left the listing at ${renewed.rows[0]?.status}`);

  // ── media ────────────────────────────────────────────────────────────
  bold('media');
  await req('PATCH', `/horses/${horse.id}/media/reorder`, {
    token: seller.token,
    body: { order: [...media].reverse() },
    expect: [200, 204],
  });
  await req('DELETE', `/horses/${horse.id}/media/${media[media.length - 1]}`, {
    token: seller.token,
    expect: [200, 204],
  });

  // ── messaging, blocks, reports ───────────────────────────────────────
  bold('messaging, blocks and reports');
  const conversation = (
    await req('POST', '/conversations', {
      token: buyer.token,
      body: {
        contextType: 'listing',
        contextId: listing.id,
        participantId: sellerId,
        firstMessage: 'Merhaba, at hâlâ satılık mı?',
      },
      expect: [200, 201],
    })
  ).data;

  await req('GET', '/messaging/token', { token: buyer.token });
  await req('POST', `/conversations/${conversation.conversationId}/archive`, {
    token: buyer.token,
    expect: [200, 204],
  });
  const report = await req('POST', '/reports', {
    token: buyer.token,
    body: { targetType: 'listing', targetId: listing.id, reason: 'spam', detail: 'Şüpheli ilan.' },
    expect: [200, 201],
  });
  await req('POST', '/blocks', {
    token: buyer.token,
    body: { profileId: sellerId },
    expect: [200, 201],
  });
  await req('DELETE', `/blocks/${sellerId}`, { token: buyer.token, expect: [200, 204] });
  await req('POST', '/notifications/read-all', { token: buyer.token, expect: [200, 204] });

  // ── access grants (§24.4) ────────────────────────────────────────────
  bold('access grants');
  const request = await req('POST', `/horses/${horse.slug ?? horse.id}/access-requests`, {
    token: buyer.token,
    body: { scope: ['health'], message: 'Sağlık dosyasını görebilir miyim?' },
    expect: [200, 201],
  });
  if (request.data?.id) {
    await req('PATCH', `/access-requests/${request.data.id}`, {
      token: seller.token,
      body: { status: 'granted', expiresInDays: 30 },
      expect: [200, 204],
    });
    await req('PATCH', `/access-requests/${request.data.id}`, {
      token: seller.token,
      body: { status: 'revoked' },
      expect: [200, 204],
    });
  }

  // ── quick actions (§18.2 S22) ────────────────────────────────────────
  bold('quick actions');
  await req('POST', `/conversations/${conversation.conversationId}/quick-action`, {
    token: buyer.token,
    body: { action: 'propose_viewing', payload: { when: '2026-09-01T10:00:00Z' } },
    expect: [200, 201],
  });

  // ── avatar ───────────────────────────────────────────────────────────
  bold('avatar');
  const avatar = await uploadPhotos(seller.token, horse.id, 1);
  await req('POST', '/me/avatar', {
    token: seller.token,
    body: { mediaId: avatar[0] },
    expect: [200, 204],
  });

  // ── saved searches ───────────────────────────────────────────────────
  bold('saved searches');
  const saved = await req('POST', '/saved-searches', {
    token: buyer.token,
    body: { name: 'Ankara dresaj', query: { region: 'Ankara' }, alertChannels: ['push'] },
    expect: [200, 201],
  });
  await req('GET', '/saved-searches', { token: buyer.token });
  if (saved.data?.id) {
    await req('DELETE', `/saved-searches/${saved.data.id}`, { token: buyer.token, expect: [200, 204] });
  }

  // ── services and jobs ────────────────────────────────────────────────
  bold('services and jobs');
  const service = (
    await req('POST', '/services', {
      token: seller.token,
      body: {
        category: 'training',
        title: 'Dresaj eğitimi',
        description:
          'Genç atlar ve orta seviye biniciler için haftalık dresaj çalışması. ' +
          'Manej ve arazi, kendi tesisimizde veya sizin tesisinizde.',
        priceMin: 800,
        priceMax: 1500,
        priceUnit: 'session',
        currency: 'TRY',
        countryCode: 'TR',
        region: 'Ankara',
        city: 'Ankara',
        isMobile: true,
        // §18.2 S16 draws the radius as a circle, so the schema refuses one
        // without a centre — a coverage area nobody can be inside of.
        serviceRadiusKm: 60,
        lat: 39.9334,
        lng: 32.8597,
      },
      expect: [200, 201],
    })
  ).data;

  if (service?.id) {
    await req('PATCH', `/services/${service.id}`, {
      token: seller.token,
      body: { priceMax: 1800 },
      expect: [200, 204],
    });
    await req('POST', `/services/${service.id}/publish`, { token: seller.token, expect: [200, 201] });
    await req('POST', `/services/${service.id}/pause`, { token: seller.token, expect: [200, 201, 204] });
    await req('GET', '/services/search?limit=5');
    await req('DELETE', `/services/${service.id}`, { token: seller.token, expect: [200, 204] });
  }

  const job = (
    await req('POST', '/jobs', {
      token: seller.token,
      body: {
        title: 'Seyis aranıyor',
        description:
          'Ankara’daki tesisimizde tam zamanlı seyis arıyoruz. Sekiz at, iki kişilik ekip. ' +
          'Konaklama sağlanır, yemek dahildir.',
        jobType: 'full_time',
        rolesNeeded: ['groom'],
        countryCode: 'TR',
        region: 'Ankara',
        city: 'Ankara',
        salaryMin: 30000,
        salaryMax: 38000,
        salaryCurrency: 'TRY',
        salaryPeriod: 'month',
        salaryPublic: true,
        accommodation: 'shared',
        mealsIncluded: true,
      },
      expect: [200, 201],
    })
  ).data;

  if (job?.id) {
    // §16.1: a job post is a paid product. On the free plan the honest answer
    // is 402 with the price in it, and that is what this asserts — the failure
    // mode worth catching here is a 500, or a free publish.
    await req('POST', `/jobs/${job.id}/publish`, { token: seller.token, expect: [402] });
    await req('GET', '/jobs/search?limit=5');
    await req('POST', `/jobs/${job.id}/pause`, { token: seller.token, expect: [200, 201, 204] });
    await req('DELETE', `/jobs/${job.id}`, { token: seller.token, expect: [200, 204] });
  }

  // ── organizations ────────────────────────────────────────────────────
  bold('organizations');
  const organization = (
    await req('POST', '/organizations', {
      token: seller.token,
      body: {
        name: `Sweep Hara ${STAMP}`,
        type: 'stable',
        countryCode: 'TR',
        city: 'Ankara',
        about: 'Dresaj ve genç at eğitimi üzerine çalışan bir hara.',
      },
      expect: [200, 201],
    })
  ).data;

  if (organization?.id) {
    await req('PATCH', `/organizations/${organization.id}`, {
      token: seller.token,
      body: { about: 'Dresaj, genç at eğitimi ve pansiyon.' },
      expect: [200, 204],
    });
    await req('GET', `/organizations/${organization.slug ?? organization.id}`);
    await req('GET', `/organizations/${organization.id}/members`, { token: seller.token });
    // §18.2 S25 invites by email, not by profile id: an owner adding people
    // knows their address, not their internal id, and being able to attach an
    // arbitrary id to your organisation is not a capability worth having.
    await req('POST', `/organizations/${organization.id}/members`, {
      token: seller.token,
      body: { email: buyer.email, role: 'staff' },
      expect: [200, 201],
    });
    await req('PATCH', `/organizations/${organization.id}/members/${buyerId}`, {
      token: seller.token,
      body: { role: 'admin' },
      expect: [200, 204],
    });
    await req('DELETE', `/organizations/${organization.id}/members/${buyerId}`, {
      token: seller.token,
      expect: [200, 204],
    });
  }

  // ── verification and admin ───────────────────────────────────────────
  bold('verification and admin (§14.1, §22)');
  const submission = await req('POST', '/verification/submit', {
    token: buyer.token,
    body: { kind: 'professional', evidence: { note: 'FEI Level 1 sertifikası' } },
    expect: [200, 201],
  });

  await req('GET', '/admin/verifications/queue', { token: staff.token });
  if (submission.data?.id) {
    await req('POST', `/admin/verifications/${submission.data.id}/decide`, {
      token: staff.token,
      body: { status: 'approved', note: 'Belge doğrulandı.' },
      expect: [200, 201, 204],
    });
  }
  await req('GET', '/admin/metrics?days=7', { token: staff.token });
  await req('GET', '/admin/moderation/queue?status=open', { token: staff.token });

  // A non-staff account must not reach any of it (§12: 404, not 403).
  await req('GET', '/admin/metrics', { token: buyer.token, expect: [404] });
  await req('GET', '/admin/verifications/queue', { token: buyer.token, expect: [404] });

  // ── moderation decisions (§12) ───────────────────────────────────────
  bold('moderation decisions');
  await req('GET', '/admin/moderation/queue?status=open&limit=200', { token: staff.token });

  // The report's own response carries the case it opened; searching the queue
  // for it is a race against every other fixture in the database.
  if (report.data?.caseId) {
    pass('the report opened a moderation case');
    await req('POST', `/admin/moderation/${report.data.caseId}/action`, {
      token: staff.token,
      body: { action: 'dismiss', note: 'İnceledim, kural ihlali yok.' },
      expect: [200, 201],
    });
  } else {
    fail('POST /reports returned no caseId');
  }

  // ── destructive, last: these remove the fixtures above ───────────────
  bold('deletes and transfer (§2, §24.3)');
  await req('POST', `/horses/${horse.id}/transfer`, {
    token: seller.token,
    body: { toProfileId: buyerId, reason: 'sold' },
    expect: [200, 201, 204],
  });
  const owner = await sql(`SELECT owner_profile_id FROM horses WHERE id = $1`, [horse.id]);
  if (owner.rows[0]?.owner_profile_id === buyerId) pass('transfer moved ownership');
  else fail('transfer left ownership unchanged');

  await req('DELETE', `/listings/${listing.id}`, { token: seller.token, expect: [200, 204, 403, 404] });
  await req('DELETE', `/horses/${horse.id}`, { token: buyer.token, expect: [200, 204] });

  // ── billing (reads only; §16's writes need Stripe) ───────────────────
  bold('billing reads');
  await req('GET', '/billing/plans');
  // The listing is gone by now, so this asserts the shape of the refusal
  // rather than the estimate — which is the half that has never been checked.
  await req('GET', `/billing/boost-estimate?listingId=${listing.id}&days=7`, {
    token: seller.token,
    expect: [200, 404],
  });

  // ── jobs (cron) ──────────────────────────────────────────────────────
  bold('scheduled jobs');
  for (const path of [
    '/jobs/search-sync',
    '/jobs/saved-search-alerts',
    '/jobs/health-reminders',
    '/jobs/marketplace-sweeps',
  ]) {
    const response = await fetch(`${API}/v1${path}`, {
      method: 'POST',
      headers: { 'x-cron-secret': CRON },
    });
    if (response.ok) pass(`POST ${path} → ${response.status}`);
    else fail(`POST ${path} → ${response.status}`);
  }

  console.log(`\n${checks} checks · ${failures} failed`);
  if (failures > 0) process.exitCode = 1;
}

async function uploadPhotos(token, horseId, count) {
  const { default: sharp } = await import(
    new URL('../apps/api/node_modules/sharp/lib/index.js', import.meta.url).pathname
  );

  const ids = [];
  for (let index = 0; index < count; index += 1) {
    const buffer = await sharp({
      create: {
        width: 640,
        height: 427,
        channels: 3,
        background: { r: 20 + index * 27, g: 130, b: 50 + index * 19 },
      },
    })
      .jpeg()
      .toBuffer();

    const intent = await fetch(`${API}/v1/media/upload-intent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        type: 'image',
        mimeType: 'image/jpeg',
        sizeBytes: buffer.byteLength,
        filename: `sweep-${index}.jpg`,
      }),
    }).then((r) => r.json());

    await fetch(intent.data.uploadUrl, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg' },
      body: buffer,
    });
    await fetch(`${API}/v1/media/${intent.data.mediaId}/complete`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    await fetch(`${API}/v1/horses/${horseId}/media`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        mediaId: intent.data.mediaId,
        category: 'conformation',
        sortOrder: index,
      }),
    });
    ids.push(intent.data.mediaId);
  }

  return ids;
}

await main();
