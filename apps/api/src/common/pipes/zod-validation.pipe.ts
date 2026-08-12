import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

import { ApiException } from '../filters/api-exception.filter.js';

/**
 * Validates a request body or query against a zod schema and returns the
 * parsed value.
 *
 * Used as `@Body(new ZodValidationPipe(schema))`. The schemas come from
 * `packages/shared-types` wherever a rule is shared with the clients, which is
 * the point of ADR-0002: the wizard and the API validate against the same
 * object, so the client cannot promise something the server will reject.
 *
 * Failures are reported as a §12 VALIDATION_ERROR carrying every offending
 * field, so a form can mark all of them at once (§18.2 S03: "errors inline,
 * never as toast").
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(
    private readonly schema: ZodSchema<T>,
    private readonly messageTr = 'Gönderdiğin bilgilerde eksik veya hatalı alanlar var.',
  ) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw ApiException.validation(
        this.messageTr,
        result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    return result.data;
  }
}

export function zodBody<T>(schema: ZodSchema<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}

export function zodQuery<T>(schema: ZodSchema<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema, 'Arama parametrelerinde hata var.');
}
