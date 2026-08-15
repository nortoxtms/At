import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { mediaType } from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { CurrentProfileId, Public } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { LocalStorageProvider } from './local-storage.provider.js';
import { MediaService } from './media.service.js';
import { STORAGE_PROVIDER, type StorageProvider } from './storage.provider.js';

const uploadIntentSchema = z.object({
  type: mediaType,
  mimeType: z.string().min(3).max(120),
  sizeBytes: z.number().int().positive(),
  filename: z.string().max(255).optional(),
  /** Free-form hint (`horse`, `listing`, `verification`) for future routing. */
  context: z.string().max(60).optional(),
});

/** Spec §12 "media". */
@Controller('media')
@UseGuards(RateLimitGuard)
export class MediaController {
  constructor(
    private readonly media: MediaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  @Post('upload-intent')
  @HttpCode(HttpStatus.CREATED)
  // §12 rate limits: 100 upload intents per hour, per profile.
  @RateLimit({ limit: 100, windowSeconds: 3600, per: 'profile' })
  async uploadIntent(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(uploadIntentSchema)) body: z.infer<typeof uploadIntentSchema>,
  ) {
    return { data: await this.media.createUploadIntent(profileId, body) };
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.media.complete(profileId, id) };
  }

  // ── local provider only ───────────────────────────────────────────────
  //
  // These two routes stand in for the bucket's presigned PUT and GET when the
  // API is running without cloud credentials. They are registered
  // unconditionally but refuse to act unless the local provider is active, so
  // there is no way to reach storage through them in a real deployment.

  @Post('local-upload')
  @Public()
  @HttpCode(HttpStatus.OK)
  async localUpload(
    @Req() request: Request,
    @Query('key') key: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
  ) {
    const local = this.assertLocalProvider();

    if (!local.verifySignature(key, Number(expires), signature)) {
      throw ApiException.forbidden('Yükleme bağlantısı geçersiz veya süresi dolmuş.');
    }

    const body = await readRawBody(request);
    await local.write({
      storageKey: key,
      body,
      mimeType: request.headers['content-type'] ?? 'application/octet-stream',
    });

    return { data: { bytes: body.byteLength } };
  }

  @Get('local-download')
  @Public()
  @Header('cache-control', 'private, no-store')
  // helmet sets `Cross-Origin-Resource-Policy: same-origin` on everything,
  // which is right for JSON and wrong for an image: the browser refuses to
  // paint it in a page served from any other origin, so every photograph in
  // the web app and in the Expo web build failed with
  // ERR_BLOCKED_BY_RESPONSE.NotSameOrigin and no visible error. The URL is
  // already signed and expires (§10), so the resource is not protected by
  // being same-origin — it is protected by the signature.
  @Header('cross-origin-resource-policy', 'cross-origin')
  async localDownload(
    @Query('key') key: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res() response: Response,
  ): Promise<void> {
    const local = this.assertLocalProvider();

    if (!local.verifySignature(key, Number(expires), signature)) {
      throw ApiException.forbidden('Bağlantı geçersiz veya süresi dolmuş.');
    }

    response.send(await local.read(key));
  }

  private assertLocalProvider(): LocalStorageProvider {
    if (!(this.storage instanceof LocalStorageProvider)) {
      throw ApiException.notFound('Uç nokta');
    }
    return this.storage;
  }
}

function readRawBody(request: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}
