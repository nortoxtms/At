/**
 * Route table — spec §18.1, preserved verbatim under Expo Router (ADR-0002).
 *
 * The paths matter beyond navigation: they are the targets of the
 * `onlyhorses://` scheme and the universal links for onlyhorses.app/*
 * (§18.3), and they mirror the web routes in §19.1 so a link shared from the
 * web opens the equivalent screen in the app.
 *
 * Each entry is annotated with the screen id from §18.2 so the mapping stays
 * checkable as screens land.
 */
export const ROUTES = {
  discover: '/', // S05
  search: '/search', // S06 (filters sheet: S07)
  listingDetail: (slug: string) => `/listings/${slug}`, // S08
  horsePublic: (slug: string) => `/horses/${slug}`, // public horse record

  stable: '/stable', // S09
  horseOwner: (id: string) => `/stable/horses/${id}`, // S11
  horseHealth: (id: string) => `/stable/horses/${id}/health`, // S12
  horseNew: '/stable/horses/new', // S10 wizard

  listingNew: '/listings/new', // S13 wizard

  services: '/services', // S15
  serviceDetail: (slug: string) => `/services/${slug}`, // S16

  jobs: '/jobs', // S17
  jobDetail: (slug: string) => `/jobs/${slug}`, // S18
  jobApply: (slug: string) => `/jobs/${slug}/apply`, // S19

  messages: '/messages', // S21
  conversation: (id: string) => `/messages/${id}`, // S22

  profile: '/profile', // S24
  profilePublic: (handle: string) => `/profile/${handle}`, // S23
  profileEdit: '/profile/edit', // S25

  verification: '/verification', // S26
  paywall: '/paywall', // S27
  saved: '/saved', // S29
  notifications: '/notifications', // S30
  settings: '/settings', // S31
} as const;

/** §16.2: Stripe Checkout returns to the app through this deep link. */
export const BILLING_RETURN_URL = 'onlyhorses://billing/return';
