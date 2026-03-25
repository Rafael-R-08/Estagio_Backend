export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    url: process.env.DATABASE_URL || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    accessTokenExpiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN,
    refreshTokenSecret: process.env.JWT_REFRESH_TOKEN_SECRET,
    refreshTokenExpiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN,
    verificationTokenSecret: process.env.JWT_VERIFICATION_TOKEN_SECRET,
    verificationTokenExpiresIn: process.env.JWT_VERIFICATION_TOKEN_EXPIRES_IN,
    passwordResetTokenSecret: process.env.JWT_PASSWORD_RESET_TOKEN_SECRET,
    passwordResetTokenExpiresIn: process.env.JWT_PASSWORD_RESET_TOKEN_EXPIRES_IN,
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  githubModels: {
    token: process.env.GITHUB_TOKEN || '',
    model: process.env.GITHUB_MODEL || 'gpt-4o',
    embedModel: process.env.GITHUB_EMBED_MODEL || 'text-embedding-3-small',
    endpoint: process.env.GITHUB_MODELS_ENDPOINT || 'https://models.inference.ai.azure.com',
  },

  supabase: {
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_SERVICE_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || 'certificates',
  },
});
