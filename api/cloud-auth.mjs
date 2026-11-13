import { cloudConfig } from '../src/cloud/config.mjs';
import { bearer, createAuth } from '../src/cloud/auth.mjs';
import { createJsonHandler } from '../src/cloud/http.mjs';

export default createJsonHandler({ config: () => cloudConfig(process.env), maxBytes: 16384,
  async execute(input, headers, config, signal) {
    const accessToken = ['session','signout','password'].includes(input?.action) ? bearer(headers.authorization) : undefined;
    return createAuth({ config }).execute(input, accessToken, signal);
  },
});
