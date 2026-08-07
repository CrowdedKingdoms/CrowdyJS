import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * CrowdyJS targets one GraphQL endpoint, whose schema covers both the management
 * and game surfaces. Codegen consumes the committed ./schema.gql, a copy of that
 * unified SDL (it was a merge of two SDLs until cks-management-api was retired on
 * 2026-08-06).
 *
 * Standalone builds never look outside this package. To intentionally refresh
 * the schema artifact, run one of:
 *   npm run schema:sync:prod
 *   npm run schema:sync:local
 *   npm run schema:sync:paths -- --schema <file-or-url>
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
