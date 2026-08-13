# The static preview

`https://nortoxtms.github.io/At/`

## What it is

The landing page, the pricing page and the seven §24.26 policy documents in
Turkish and English, exported as plain HTML. It exists so the design system
(§20), the copy and the legal pages can be read in a browser without standing
up a database, an API, Stripe or Typesense.

Nineteen pages, 1.5 MB, no server.

## What it is not

It is not the product, and it does not pretend to be — every page carries a
banner saying so.

GitHub Pages serves static files. The marketplace is server-rendered against a
live API: search reads a 50 000-document index, listings are fetched per
request, messaging holds an open connection, and everything behind a login
needs a session. None of that is a file.

So `scripts/build-preview.sh` **removes** those routes from the preview build
rather than shipping them as permanently empty pages:

| Route | Why it is not in the preview |
|---|---|
| `/[locale]/atlar`, `/hizmetler`, `/isler` | Read `searchParams`; a page whose job is to answer a query cannot be a file |
| `/sitemap.xml` | Enumerates live listings; a static copy is stale the moment anything is published |
| `/robots.txt` | A route handler, and a preview should not be instructing crawlers |

The pricing page **is** included and shows real numbers. It normally reads them
from the API, and falls back to the same `@only-horses/shared-types` catalogue
the API derives its answer from — so the preview shows 19 € for Pro because
that is what Pro costs, not because a number was typed into a template.

## Publishing it

Automatic on push, via `.github/workflows/pages.yml`.

**One manual step is required first, and only the repository owner can do it:**

> Settings → Pages → Build and deployment → Source → **GitHub Actions**

Until that is set, the workflow's deploy job fails with "Pages is not enabled
for this repository". Nothing in the repository can flip that switch.

### The repository is private

GitHub Pages on a **private** repository requires a paid plan (Pro, Team or
Enterprise). On GitHub Free, Pages is available for public repositories only,
and enabling it on a private one is refused.

Three ways forward, in the order they are worth considering:

1. **Make the repository public.** Pages then works on the free plan. The
   published site is public either way — on GitHub Pro a private repo still
   produces a *public* site; only GitHub Enterprise offers access-controlled
   Pages. So this choice is about who can read the source, not about who can
   read the site.
2. **GitHub Pro.** Keeps the source private, publishes the site publicly.
3. **Skip Pages.** `bash scripts/build-preview.sh` writes `apps/web/out/`,
   which is an ordinary directory of HTML. Serve it from anywhere —
   `npx serve apps/web/out`, Cloud Storage, Netlify, or by opening the files.

## Building it locally

```bash
PAGES_BASE_PATH= bash scripts/build-preview.sh   # no base path when served at /
npx serve apps/web/out
```

`PAGES_BASE_PATH` matters: GitHub serves a project site under `/<repo>`, so the
CI build passes `/At` and every asset URL is prefixed. Built with the wrong
base path, the pages load and the CSS does not.

## How it relates to the real deployment

`apps/web` has two build targets from one source (`apps/web/next.config.js`):

- default — `output: 'standalone'`, the Cloud Run image, the real thing.
- `STATIC_PREVIEW=1` — `output: 'export'`, this.

They share every component and every string. What the preview cannot show is
live data. See `docs/DEPLOY.md` for the deployment that can.
