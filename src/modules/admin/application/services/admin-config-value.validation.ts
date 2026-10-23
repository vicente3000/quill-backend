import { BadRequestException } from '@nestjs/common';

const ALLOWED_VALUES: Record<string, readonly string[]> = {
  MARKET_PROVIDER: ['mock', 'eodhd', 'yahoo'],
  SIMULATION_STRATEGY: ['flat', 'gbm', 'nw'],
};

const isValidTime = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

export function validateAdminConfigValue(key: string, value: unknown): void {
  if (key === 'COMMISSION_RATE') {
    assertNumberInRange(key, value, 0, 1);
    return;
  }

  if (key === 'INITIAL_BALANCE') {
    assertNumberInRange(key, value, Number.EPSILON, Number.MAX_VALUE);
    return;
  }

  if (key === 'MARKET_HOURS_OPEN' || key === 'MARKET_HOURS_CLOSED') {
    if (!isValidTime(value)) {
      throwInvalidValue(key);
    }
    return;
  }

  if (key === 'MARKET_CLOSED_DAYS') {
    if (typeof value !== 'string' || !/^\d(,\d)*$/.test(value)) {
      throwInvalidValue(key);
    }
    const days = value.split(',').map(Number);
    if (days.some((d) => d < 1 || d > 7)) {
      throwInvalidValue(key);
    }
    return;
  }

  const allowed = ALLOWED_VALUES[key];
  if (allowed && (typeof value !== 'string' || !allowed.includes(value))) {
    throwInvalidValue(key);
  }
}

function assertNumberInRange(
  key: string,
  value: unknown,
  minimum: number,
  maximum: number,
): void {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throwInvalidValue(key);
  }
}

function throwInvalidValue(key: string): never {
  throw new BadRequestException(`Valor inválido para la configuración ${key}.`);
}
