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
 * Then run `npm run codegen` and commit schema.gql, src/generated/graphql-schema.ts and
 * src/generated/graphql.ts.
 *
 * Two outputs since graphql-codegen 7 (18.4.1): `typescript-operations` now emits the
 * input types and enums an operation uses, so beside the `typescript` plugin in one file
 * they were declared twice. The schema types go to graphql-schema.ts, the operations
 * import them from there, and graphql.ts re-exports them so its importers are unchanged.
 */
const shared = {
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
};

const config: CodegenConfig = {
  overwrite: true,
  schema: './schema.gql',
  documents: 'src/operations/**/*.graphql',
  generates: {
    'src/generated/graphql-schema.ts': {
      plugins: ['typescript'],
      config: shared,
    },
    'src/generated/graphql.ts': {
      plugins: [
        { add: { content: "export * from './graphql-schema.js';" } },
        'typescript-operations',
        'typed-document-node',
      ],
      config: {
        ...shared,
        importSchemaTypesFrom: 'src/generated/graphql-schema',
        importExtension: '.js',
        documentMode: 'documentNode',
        dedupeFragments: true,
      },
    },
  },
};

export default config;
