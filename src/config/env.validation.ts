import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  BACKEND_PORT: Joi.number().default(3000),
  FRONTEND_ORIGIN: Joi.string().default('http://localhost:5173'),
  SWAGGER_ENABLED: Joi.boolean().when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().default(false),
    otherwise: Joi.boolean().default(true),
  }),
  MONGODB_URI: Joi.string().required(),
  REDIS_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().uri().required(),
    otherwise: Joi.string().uri().default('redis://localhost:6379'),
  }),
  JWT_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .min(32)
      .invalid('REEMPLAZAR_CON_SECRETO_ALEATORIO_DE_AL_MENOS_32_CARACTERES')
      .required(),
    otherwise: Joi.string().min(16).required(),
  }),
  JWT_EXPIRES_IN: Joi.string().default('1d'),
  INITIAL_BALANCE: Joi.number().positive().default(100000),
  COMMISSION_RATE: Joi.number().min(0).max(1).default(0.005),
  MARKET_PROVIDER: Joi.string().valid('mock', 'eodhd', 'yahoo').optional(),
  MARKET_HOURS_OPEN: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .default('09:30'),
  MARKET_HOURS_CLOSED: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .default('16:00'),
  MARKET_CLOSED_DAYS: Joi.string()
    .pattern(/^\d(,\d)*$/)
    .default('6,7'),
  MARKET_TICK_INTERVAL_SECONDS: Joi.number().min(0).default(15),
  SIMULATION_STRATEGY: Joi.string().valid('flat', 'gbm', 'nw').default('flat'),
  EODHD_API_KEY: Joi.when('MARKET_PROVIDER', {
    is: 'eodhd',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  EODHD_BASE_URL: Joi.string().uri().default('https://eodhd.com/api'),
  EODHD_EXCHANGE_CODE: Joi.string().default('SN'),
  EODHD_SYMBOLS: Joi.string().default(
    'SQM-B.SN,VAPORES.SN,BSANTANDER.SN,COPEC.SN,CENCOSUD.SN,CHILE.SN,CMPC.SN,COLBUN.SN',
  ),
  MARKET_FETCH_ON_STARTUP: Joi.boolean().default(false),
  EODHD_DAILY_REFRESH_ENABLED: Joi.boolean().default(true),
  EODHD_DAILY_REFRESH_CRON: Joi.string().default('0 30 18 * * 1-5'),
  EODHD_CACHE_TTL_SECONDS: Joi.number().positive().default(86400),
  YAHOO_FINANCE_BASE_URL: Joi.string()
    .uri()
    .default('https://query1.finance.yahoo.com'),
  YAHOO_MARKET_SYMBOLS: Joi.string().default('COPEC.SN,CENCOSUD.SN,CHILE.SN'),
  YAHOO_MARKET_REFRESH_CRON: Joi.string().default('0 */15 9-17 * * 1-5'),

  CURRENCY_PROVIDER: Joi.string()
    .valid('mock', 'exchangeRate', 'yahoo')
    .optional(),
  CURRENCY_SIMULATION_STRATEGY: Joi.string()
    .valid('flat', 'gbm', 'nw')
    .default('flat'),
  CURRENCY_RT_TICK_INTERVAL_SECONDS: Joi.number().min(0).default(5),
  CURRENCY_ANCHOR_VOLATILITY: Joi.number().min(0).default(0.005),
  CURRENCY_ANCHOR_DRIFT: Joi.number().default(0),

  MOCK_CURRENCY_SYMBOLS: Joi.string().default('USDCLP'),
  EXCHANGERATE_SYMBOLS: Joi.string().default('USDCLP'),
  EXCHANGERATE_API_KEY: Joi.string().allow('').optional(),
  EXCHANGERATE_BASE_URL: Joi.string()
    .uri()
    .default('https://v6.exchangerate-api.com/v6'),
  EXCHANGERATE_REFRESH_CRON: Joi.string().default('0 0 * * * *'),
  YAHOO_CURRENCY_SYMBOLS: Joi.string().default('USDCLP'),
  YAHOO_CURRENCY_REFRESH_CRON: Joi.string().default('0 */15 * * * *'),

  CURRENCY_SUFFIX_MAP: Joi.string().default('.SN=CLP,.US=USD'),
});
