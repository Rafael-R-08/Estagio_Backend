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
    passwordResetTokenExpiresIn:
      process.env.JWT_PASSWORD_RESET_TOKEN_EXPIRES_IN,
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
  },

  supabase: {
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_SERVICE_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || 'certificates',
  },

  bullmq: {
    concurrency: parseInt(process.env.BULLMQ_CONCURRENCY || '2', 10),
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@learninghub.pt',
  },

  app: {
    url: process.env.APP_URL || 'http://localhost:3000',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',
  },

  platforms: {
    encryptionKey: process.env.PLATFORM_ENCRYPTION_KEY || '',
  },

  webPush: {
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
    vapidEmail: process.env.VAPID_EMAIL || 'mailto:admin@learninghub.pt',
  },
});
