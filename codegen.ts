import type { CodegenConfig } from '@graphql-codegen/cli';

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
