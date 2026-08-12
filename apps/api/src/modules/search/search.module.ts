import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import { DatabaseService } from '../../database/database.service.js';
import { PostgresSearchProvider } from './postgres-search.provider.js';
import { SearchController } from './search.controller.js';
import { SEARCH_PROVIDER } from './search.provider.js';
import { SearchIndexerService } from './search-indexer.service.js';
import { TypesenseSearchProvider } from './typesense-search.provider.js';

@Module({
  controllers: [SearchController],
  providers: [
    SearchIndexerService,
    {
      provide: SEARCH_PROVIDER,
      inject: [ConfigService, DatabaseService],
      useFactory: (config: ConfigService<Env, true>, db: DatabaseService) => {
        const host = config.get('TYPESENSE_HOST', { infer: true });
        const apiKey = config.get('TYPESENSE_API_KEY', { infer: true });

        if (host && apiKey) {
          return new TypesenseSearchProvider({
            host,
            port: config.get('TYPESENSE_PORT', { infer: true }) ?? 443,
            protocol: config.get('TYPESENSE_PROTOCOL', { infer: true }) ?? 'https',
            apiKey,
          });
        }

        // Search degrades in quality without Typesense (no typo tolerance, no
        // _text_match relevance) but not in correctness, so unlike storage the
        // fallback is allowed to run anywhere — including production, where an
        // unreachable Typesense should mean worse search rather than no site.
        return new PostgresSearchProvider(db);
      },
    },
  ],
  exports: [SEARCH_PROVIDER, SearchIndexerService],
})
export class SearchModule {}
