import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * CrowdyJS targets two GraphQL endpoints (cks-management-api for auth / users,
 * cks-game-api for runtime/world). Codegen consumes the committed ./schema.gql,
 * which is a merged union of both public SDLs.
 *
 * Standalone builds never look outside this package. To intentionally refresh
 * the schema artifact, run one of:
 *   npm run schema:sync:prod
 *   npm run schema:sync:local
 *   npm run schema:sync:paths -- --management <file-or-url> --game <file-or-url>
 * Then run `npm run codegen` and commit both schema.gql and
 * src/generated/graphql.ts.
 */
const config: CodegenConfig = {
  overwrite: true,
  schema: './schema.gql',
  documents: 'src/operations/**/*.graphql',
  generates: {
    'src/generated/graphql.ts': {
      plugins: ['typescript', 'typescript-operations', 'typed-document-node'],
      config: {
        useTypeImports: true,
        scalars: {
          BigInt: 'string',
          DateTime: 'string',
        },
        avoidOptionals: {
          field: true,
          inputValue: false,
          object: false,
          defaultValue: false,
        },
        skipTypename: false,
        nonOptionalTypename: false,
        documentMode: 'documentNode',
        dedupeFragments: true,
      },
    },
  },
};

export default config;
