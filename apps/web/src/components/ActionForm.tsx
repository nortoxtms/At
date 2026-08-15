'use client';

import type { ReactNode } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import type { FormState } from '@/lib/form-state';

/**
 * A server-action form with an error banner and a pending submit button.
 *
 * The fields are passed in as `children` and stay server-rendered — this
 * component only owns the two things that need client state: the message a
 * rejected submit comes back with, and the disabled/"Kaydediliyor…" button
 * that stops a slow POST being sent three times.
 *
 * Forms that need errors *next to* a field (sign-up, the horse and product
 * wizards) build their own instead, because the field has to read
 * `state.fields` and that means the field is a client component too. Most
 * forms do not: §12 rejects them as a whole, with one sentence, and one
 * sentence at the top is where people look for it.
 */
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-gold-soft px-6 py-3 text-body font-medium text-text-on-gold disabled:opacity-60"
    >
      {pending ? 'Kaydediliyor…' : label}
    </button>
  );
}

export function ActionForm({
  action,
  submitLabel,
  children,
  note,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});

  const messages = state.fields
    ? Object.values(state.fields)
    : state.error
      ? [state.error]
      : [];

  return (
    <form action={formAction} className="space-y-5">
      {messages.length > 0 ? (
        <div
          role="alert"
          className="rounded-md border border-danger/50 bg-danger/10 px-3 py-2 text-small text-text-primary"
        >
          {messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}

      {children}

      <Submit label={submitLabel} />

      {note ? <div className="text-caption text-text-secondary">{note}</div> : null}
    </form>
  );
}
