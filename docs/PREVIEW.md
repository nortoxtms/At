# The static preview

`https://nortoxtms.github.io/At/`

## What it is

A working demo of the marketplace, with no server behind it.

Fifty-one pages: the landing page, twelve listings you can browse, filter and
open, a services index, a job board, the pricing page and the seven §24.26
policy documents in Turkish and English. Roughly 2 MB, no API, no database, no
Stripe.

The demo dataset (`apps/web/src/content/demo.ts`) was exported from a running
instance through the real endpoints, so every field is the shape the API
actually returns and every page renders the same components against the same
types. Seller names and handles are replaced with placeholder stables; breeds,
ages, heights, prices, regions and quality scores are as generated.

The listing detail pages are the production pages, unmodified — `lib/api.ts`
serves them from the demo dataset under `NEXT_PUBLIC_STATIC_PREVIEW`, so what
you are looking at is the real page, not a mock-up of it.

## What it is not

It is not live, and every page says so in a banner.

The browse page is the one deliberate substitution. In production it is a
server component that reads the query string and asks the search API, because
§19.2 needs a filtered view to be an indexable URL. A static export has neither
a server to read the query on nor an API to ask, so the preview swaps in
`src/preview/routes/atlar/page.tsx`, which filters twelve listings in the
browser. The filters are real and they work. What they are not is §11's search
engine: relevance ranking, geo radius, boosted placement and facet counts all
live in the API and none are reproduced.

Everything requiring a session is absent rather than stubbed: registration,
messaging, saving a search, applying to a job, payment. There is no login form
that goes nowhere.

Detail pages for services and jobs are not exported — there is no demo data
behind them, and a page that renders empty is worse than a page that is not
there.

## Publishing it

Automatic on push, via `.github/workflows/pages.yml`.

**One manual step is required first, and only the repository owner can do it:**

> Settings → Pages → Build and deployment → Source → **GitHub Actions**

The workflow asks `configure-pages` to enable Pages itself
(`enablement: true`), which works in some repositories and did not work in
this one:

```
Create Pages site failed.
Error: Resource not accessible by integration
```

Creating a Pages site needs repository-admin rights, and the workflow's
`GITHUB_TOKEN` does not have them regardless of the `pages: write` permission
the job grants. So the setting has to be flipped by hand once. After that the
workflow publishes on every push and nothing needs touching again.

### Repository visibility

Pages on a **private** repository requires a paid plan (Pro, Team or
Enterprise); on GitHub Free it is available for public repositories only. This
repository is public, so that constraint does not apply — but it is worth
knowing that publishing the site makes the site public in every case. Even on
GitHub Pro a private repository produces a *public* site; only Enterprise
offers access-controlled Pages. The choice is about who can read the source,
not about who can read the site.

If neither is wanted, skip Pages entirely: `bash scripts/build-preview.sh`
writes `apps/web/out/`, an ordinary directory of HTML that any static host
will serve. `scripts/inline-preview.mjs` goes one step further and folds a
single page into one self-contained file — stylesheet inlined, fonts embedded,
no external requests — which can simply be opened.

## Building it locally

```bash
PAGES_BASE_PATH= bash scripts/build-preview.sh   # no base path when served at /
npx serve apps/web/out
```

The preview builds into `.next-preview`, not `.next`. That separation matters:
without it the export build overwrites the production build directory, and
`next start` then serves the static export — a production server quietly
handing out the demo dataset while looking entirely normal.

Served under a base path, serve the *parent* of the export and visit
`/<repo>/`; the bundle's asset URLs are prefixed at build time and will not
resolve from the export root.

`PAGES_BASE_PATH` matters: GitHub serves a project site under `/<repo>`, so the
CI build passes `/At` and every asset URL is prefixed. Built with the wrong
base path, the pages load and the CSS does not.

## Checking it

```bash
node scripts/contrast-audit.mjs http://localhost:4321/At/ http://localhost:4321/At/tr/atlar/
```

Every rendered text node, its computed colour against the nearest painted
background, in both colour schemes, against WCAG AA. This exists because the
dark theme shipped with cream text on a sand ground at 1.27:1 — invisible —
and no amount of reading the token file would have found it. The Tailwind
utilities compiled to fixed hex values and never read the theme's CSS
variables at all.

## How it relates to the real deployment

`apps/web` has two build targets from one source (`apps/web/next.config.js`):

- default — `output: 'standalone'`, the Cloud Run image, the real thing.
- `STATIC_PREVIEW=1` — `output: 'export'`, this.

They share every component and every string. What the preview cannot show is
live data. See `docs/DEPLOY.md` for the deployment that can.
