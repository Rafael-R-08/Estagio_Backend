import { plainToInstance } from 'class-transformer';
import { IsEnum, IsString, IsOptional, validateSync, IsUrl, MinLength } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Provision = 'provision',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsString()
  GROQ_API_KEY: string;

  @IsUrl({ protocols: ['postgresql', 'postgres'], require_tld: false })
  DATABASE_URL: string;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET deve ter pelo menos 32 caracteres para segurança.' })
  JWT_SECRET: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_TOKEN_SECRET deve ter pelo menos 32 caracteres para segurança.' })
  JWT_REFRESH_TOKEN_SECRET: string;

  @IsString()
  @MinLength(32, { message: 'JWT_VERIFICATION_TOKEN_SECRET deve ter pelo menos 32 caracteres para segurança.' })
  JWT_VERIFICATION_TOKEN_SECRET: string;

  @IsString()
  @MinLength(32, { message: 'JWT_PASSWORD_RESET_TOKEN_SECRET deve ter pelo menos 32 caracteres para segurança.' })
  JWT_PASSWORD_RESET_TOKEN_SECRET: string;

  @IsUrl()
  SUPABASE_URL: string;

  @IsString()
  SUPABASE_SERVICE_KEY: string;

  @IsString()
  REDIS_HOST: string;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
