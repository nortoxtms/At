import type { ServiceSearchHit, ServiceSearchQuery } from '@only-horses/shared-types';
import { useEffect, useState } from 'react';

import { apiClient } from '../../core/client';

/** Services hub data for S15/S16 (spec §18.2). */

export interface ServiceCategory {
  code: string;
  name_tr: string;
  name_en: string;
  icon: string | null;
  active_count: number;
}

export interface ServiceDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  category_name_tr: string;
  price_min: string | null;
  price_max: string | null;
  price_unit: string | null;
  currency: string;
  city: string | null;
  service_radius_km: number | null;
  is_mobile: boolean;
  availability_note: string | null;
  provider_id: string;
  provider_name: string;
  verification_level: string;
  trust_score: number;
  rating_average: string | null;
  rating_count: string;
  /** §26: present on transport services only. */
  notice: { tr: string; en: string } | null;
}

export function useServiceCategories() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);

  useEffect(() => {
    let cancelled = false;

    apiClient.request<ServiceCategory[]>('/services/categories').then((result) => {
      if (!cancelled) setCategories(result);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return categories;
}

export function useServiceSearch(filters: Partial<ServiceSearchQuery>) {
  const [hits, setHits] = useState<ServiceSearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [isPending, setIsPending] = useState(true);

  const serialized = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setIsPending(true);
      try {
        const query = Object.fromEntries(
          Object.entries(JSON.parse(serialized) as Record<string, unknown>)
            .filter(([, value]) => value !== undefined && value !== '')
            .map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : String(value)]),
        );

        const response = await apiClient.requestWithMeta<ServiceSearchHit[], { total: number }>(
          '/services/search',
          { query },
        );

        if (!cancelled) {
          setHits(response.data);
          setTotal(response.meta.total);
        }
      } finally {
        if (!cancelled) setIsPending(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [serialized]);

  return { hits, total, isPending };
}

export function useService(slug: string | undefined) {
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    apiClient
      .request<ServiceDetail>(`/services/${encodeURIComponent(slug)}`)
      .then((result) => {
        if (!cancelled) setService(result);
      })
      .finally(() => {
        if (!cancelled) setIsPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { service, isPending };
}
