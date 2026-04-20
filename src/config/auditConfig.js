
export const auditConfig = {
  enabled: process.env.AUDIT_LOGGING_ENABLED !== 'false',
  
  skipRoutes: [
    '/health',
    '/metrics', 
    '/favicon.ico',
    '/',
    '/webhook-testing'
  ],
  
  skipMethods: ['OPTIONS'],
  
  sensitiveFields: [
    'password',
    'token',
    'apiKey',
    'secret',
    'key',
    'authorization',
    'stripe_secret',
    'xi-api-key',
    'firebase_private_key',
    'client_secret'
  ],
  
  maxResponseBodySize: 10000, // bytes
  maxRequestBodySize: 10000,  // bytes
  
  retention: {
    days: 90 // Keep audit logs for 90 days
  },
  
  performance: {
    enableAsync: true,
    batchSize: 100
  }
};
