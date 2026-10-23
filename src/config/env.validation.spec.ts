import { envValidationSchema } from './env.validation';

describe('envValidationSchema', () => {
  const baseEnv = {
    MONGODB_URI: 'mongodb://localhost:27017/quill',
    JWT_SECRET: 'quill-test-secret-12345',
  };

  it('acepta MARKET_PROVIDER=mock sin API key EODHD', () => {
    const result = envValidationSchema.validate({
      ...baseEnv,
      MARKET_PROVIDER: 'mock',
    });

    expect(result.error).toBeUndefined();
  });

  it('acepta MARKET_PROVIDER=eodhd con API key', () => {
    const result = envValidationSchema.validate({
      ...baseEnv,
      MARKET_PROVIDER: 'eodhd',
      EODHD_API_KEY: 'test-token',
    });

    expect(result.error).toBeUndefined();
  });

  it('rechaza MARKET_PROVIDER=eodhd sin API key', () => {
    const result = envValidationSchema.validate({
      ...baseEnv,
      MARKET_PROVIDER: 'eodhd',
    });

    expect(result.error?.message).toContain('EODHD_API_KEY');
  });

  it('acepta proveedores Yahoo sin API key', () => {
    const result = envValidationSchema.validate({
      ...baseEnv,
      MARKET_PROVIDER: 'yahoo',
      CURRENCY_PROVIDER: 'yahoo',
    });

    expect(result.error).toBeUndefined();
  });

  it('rechaza secretos JWT inseguros en produccion', () => {
    const result = envValidationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'production',
      REDIS_URL: 'redis://cache:6379',
      JWT_SECRET: 'REEMPLAZAR_CON_SECRETO_ALEATORIO_DE_AL_MENOS_32_CARACTERES',
    });

    expect(result.error?.message).toContain('JWT_SECRET');
  });

  it('acepta un secreto JWT largo en produccion', () => {
    const result = envValidationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'production',
      REDIS_URL: 'redis://cache:6379',
      JWT_SECRET: 'secret-production-value-with-32-characters',
    });

    expect(result.error).toBeUndefined();
  });

  it('deshabilita Swagger por defecto en produccion', () => {
    const result = envValidationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'production',
      REDIS_URL: 'redis://cache:6379',
      JWT_SECRET: 'secret-production-value-with-32-characters',
    });
    const value = result.value as { SWAGGER_ENABLED: boolean };

    expect(result.error).toBeUndefined();
    expect(value.SWAGGER_ENABLED).toBe(false);
  });

  it('habilita Swagger por defecto fuera de produccion', () => {
    const result = envValidationSchema.validate(baseEnv);
    const value = result.value as { SWAGGER_ENABLED: boolean };

    expect(result.error).toBeUndefined();
    expect(value.SWAGGER_ENABLED).toBe(true);
  });

  it('permite habilitar Swagger explicitamente en produccion', () => {
    const result = envValidationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'production',
      REDIS_URL: 'redis://cache:6379',
      JWT_SECRET: 'secret-production-value-with-32-characters',
      SWAGGER_ENABLED: 'true',
    });
    const value = result.value as { SWAGGER_ENABLED: boolean };

    expect(result.error).toBeUndefined();
    expect(value.SWAGGER_ENABLED).toBe(true);
  });

  it('requiere REDIS_URL en produccion', () => {
    const result = envValidationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'production',
      JWT_SECRET: 'secret-production-value-with-32-characters',
      REDIS_URL: undefined,
    });

    expect(result.error?.message).toContain('REDIS_URL');
  });
});
