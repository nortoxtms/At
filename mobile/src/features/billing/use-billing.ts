import type {
  BoostEstimate,
  PlanFeature,
  PlanOption,
  PurchasableProduct,
  SubscriptionView,
} from '@only-horses/shared-types';
import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '../../core/client';

/**
 * Billing data for S27 (paywall) and S28 (boost purchase) — spec §18.2.
 *
 * `checkout` returns a URL and nothing else. Every entitlement is applied by
 * the §16.2 webhook, so the app must never treat "the browser came back" as
 * proof of payment — it re-reads the subscription instead.
 */

export interface PlanCatalogue {
  plans: PlanOption[];
  features: PlanFeature[];
  products: Record<string, { key: string; amountEur: number; durationDays?: number }>;
}

export function usePlans() {
  const [catalogue, setCatalogue] = useState<PlanCatalogue | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionView | null>(null);
  const [isPending, setIsPending] = useState(true);

  const reload = useCallback(async () => {
    setIsPending(true);
    try {
      const [plans, mine] = await Promise.all([
        apiClient.request<PlanCatalogue>('/billing/plans'),
        apiClient.request<SubscriptionView>('/me/subscription'),
      ]);

      setCatalogue(plans);
      setSubscription(mine);
    } finally {
      setIsPending(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { catalogue, subscription, isPending, reload };
}

export function useCheckout() {
  const [isPending, setIsPending] = useState(false);

  const checkout = useCallback(async (product: PurchasableProduct, targetId?: string) => {
    setIsPending(true);
    try {
      return await apiClient.request<{ url: string; sessionId: string }>('/billing/checkout', {
        method: 'POST',
        body: { product, targetId },
      });
    } finally {
      setIsPending(false);
    }
  }, []);

  return { checkout, isPending };
}

/** §18.2 S28's "expected extra views", which the API labels as an estimate. */
export function useBoostEstimate(days: number) {
  const [estimate, setEstimate] = useState<BoostEstimate | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiClient
      .request<BoostEstimate>('/billing/boost-estimate', { query: { days } })
      .then((result) => {
        if (!cancelled) setEstimate(result);
      })
      .catch(() => {
        // An unavailable estimate is not an error worth showing: S28 renders
        // the illustration without a number rather than an error state.
      });

    return () => {
      cancelled = true;
    };
  }, [days]);

  return estimate;
}
