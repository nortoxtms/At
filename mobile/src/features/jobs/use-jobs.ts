import type {
  ApplicationStatus,
  ApplyToJobInput,
  JobSearchHit,
  JobSearchQuery,
} from '@only-horses/shared-types';
import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '../../core/client';

/**
 * Job board data for S17–S19 (spec §18.2).
 *
 * Filters are typed as `JobSearchQuery` — the same object the API parses — so
 * a filter the server does not understand cannot be built here. That is the
 * point of shared-types (ADR-0002): the filter bar and the query grammar are
 * one definition.
 */

export interface JobDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  responsibilities: string | null;
  requirements: string | null;
  job_type: string;
  roles_needed: string[];
  country_code: string;
  region: string | null;
  city: string | null;
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: string | null;
  salary_period: string | null;
  accommodation: string | null;
  meals_included: boolean;
  visa_support: boolean;
  horse_count: number | null;
  experience_years_min: number | null;
  application_count: number;
  application_deadline: string | null;
  organization_name: string | null;
  poster_name: string | null;
  notice: { tr: string; en: string };
}

export interface MyApplication {
  id: string;
  status: ApplicationStatus;
  status_note: string | null;
  created_at: string;
  conversation_id: string | null;
  job_id: string;
  job_slug: string;
  job_title: string;
  organization_name: string | null;
}

export function useJobSearch(filters: Partial<JobSearchQuery>) {
  const [hits, setHits] = useState<JobSearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        const response = await apiClient.requestWithMeta<JobSearchHit[], { total: number }>(
          '/jobs/search',
          { query },
        );

        if (!cancelled) {
          setHits(response.data);
          setTotal(response.meta.total);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Arama başarısız.');
      } finally {
        if (!cancelled) setIsPending(false);
      }
    };

    void run();
    // Cancelled rather than aborted: a stale response arriving after a newer
    // one would otherwise overwrite it with older results.
    return () => {
      cancelled = true;
    };
  }, [serialized]);

  return { hits, total, isPending, error };
}

export function useJob(slug: string | undefined) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    apiClient
      .request<JobDetail>(`/jobs/${encodeURIComponent(slug)}`)
      .then((result) => {
        if (!cancelled) setJob(result);
      })
      .finally(() => {
        if (!cancelled) setIsPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { job, isPending };
}

/** §18.2 S19: submitting opens a conversation with the poster. */
export function useApplyToJob() {
  const [isPending, setIsPending] = useState(false);

  const apply = useCallback(async (slug: string, input: ApplyToJobInput) => {
    setIsPending(true);
    try {
      return await apiClient.request<{ id: string; conversationId: string }>(
        `/jobs/${encodeURIComponent(slug)}/apply`,
        { method: 'POST', body: input },
      );
    } finally {
      setIsPending(false);
    }
  }, []);

  return { apply, isPending };
}

/** §18.2 S24's "Başvurularım" tile. */
export function useMyApplications() {
  const [applications, setApplications] = useState<MyApplication[]>([]);
  const [isPending, setIsPending] = useState(true);

  const reload = useCallback(async () => {
    setIsPending(true);
    try {
      setApplications(await apiClient.request<MyApplication[]>('/me/applications'));
    } finally {
      setIsPending(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { applications, isPending, reload };
}
