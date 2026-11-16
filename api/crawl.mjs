import { createAuditHandler } from './audit.mjs';
import { fetchPublicDocument, validateDocumentInput } from '../src/fetch-page.mjs';

// No caller-controlled adapter, method, headers, key or network policy.
export const createCrawlHandler = (options = {}) => createAuditHandler({ ...options,
  fetchPage: options.fetchDocument ?? fetchPublicDocument, validateInput: validateDocumentInput, responseField: 'document' });
export default createCrawlHandler();
