import { cloudConfig, databaseConfig } from '../src/cloud/config.mjs';
import { bearer, createAuth } from '../src/cloud/auth.mjs';
import { createJsonHandler } from '../src/cloud/http.mjs';
import { createWorkspaceStore } from '../src/cloud/store.mjs';

export default createJsonHandler({
  config: () => cloudConfig(process.env),
  async execute(input, headers, config, signal) {
    const user = await createAuth({ config }).verify(bearer(headers.authorization), signal);
    const settings = databaseConfig(process.env);
    const { Client } = await import('pg');
    return createWorkspaceStore({ createClient: () => new Client(settings) })(user.id, input, { signal });
  },
});
