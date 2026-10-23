import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketUpdateWriterService } from './market-update-writer.service';

interface WriterInternals {
  logger: Logger;
}

const update = {
  stock: {
    _id: '1',
    symbol: 'COPEC.SN',
    name: 'COPEC',
    previousClose: 100,
  } as never,
  quote: {
    symbol: 'COPEC.SN',
    name: 'COPEC',
    price: 120,
    close: 120,
    previousClose: 100,
    currency: 'CLP',
    timestamp: new Date('2026-01-01T12:00:00Z'),
    exchange: 'SN',
    source: 'eodhd',
  },
  save: true,
};

describe('MarketUpdateWriterService', () => {
  it('guarda snapshot cuando la actualizacion viene desde EODHD', async () => {
    const stockModel = { bulkWrite: jest.fn().mockResolvedValue({}) };
    const snapshotModel = { insertMany: jest.fn().mockResolvedValue([]) };
    const cacheService = { set: jest.fn().mockResolvedValue(undefined) };
    const service = new MarketUpdateWriterService(
      stockModel as never,
      snapshotModel as never,
      cacheService as never,
      { get: jest.fn(() => 86400) } as unknown as ConfigService,
    );

    await service.persist([update], 'eodhd');

    expect(snapshotModel.insertMany).toHaveBeenCalledWith([
      {
        symbol: 'COPEC.SN',
        price: 120,
        open: 120,
        high: 120,
        low: 120,
        close: 120,
        volume: undefined,
        source: 'eodhd',
      },
    ]);
    const calls = stockModel.bulkWrite.mock.calls as unknown as Array<
      [
        Array<{
          updateOne: {
            update: {
              $set: {
                close: number;
                dayChangePercentage: number;
                source: string;
              };
            };
          };
        }>,
      ]
    >;
    expect(calls[0][0][0].updateOne.update.$set).toMatchObject({
      close: 120,
      dayChangePercentage: 20,
      source: 'eodhd',
    });
    expect(cacheService.set).toHaveBeenCalledTimes(3);
  });

  it('espera todas las escrituras de caché antes de resolver', async () => {
    let resolveCache: (() => void) | undefined;
    const pendingCache = new Promise<void>((resolve) => {
      resolveCache = resolve;
    });
    const cacheService = { set: jest.fn().mockReturnValue(pendingCache) };
    const service = new MarketUpdateWriterService(
      { bulkWrite: jest.fn().mockResolvedValue({}) } as never,
      { insertMany: jest.fn().mockResolvedValue([]) } as never,
      cacheService as never,
      { get: jest.fn(() => 86400) } as unknown as ConfigService,
    );
    let completed = false;

    const persistence = service.persist([update], 'eodhd').then(() => {
      completed = true;
    });
    await Promise.resolve();

    expect(completed).toBe(false);
    resolveCache?.();
    await persistence;
    expect(completed).toBe(true);
  });

  it('registra y propaga fallos de caché', async () => {
    const cacheError = new Error('Redis no disponible');
    const service = new MarketUpdateWriterService(
      { bulkWrite: jest.fn().mockResolvedValue({}) } as never,
      { insertMany: jest.fn().mockResolvedValue([]) } as never,
      { set: jest.fn().mockRejectedValue(cacheError) } as never,
      { get: jest.fn(() => 86400) } as unknown as ConfigService,
    );
    const errorSpy = jest
      .spyOn((service as unknown as WriterInternals).logger, 'error')
      .mockImplementation(jest.fn());

    await expect(service.persist([update], 'eodhd')).rejects.toBe(cacheError);

    expect(errorSpy).toHaveBeenCalledWith(
      'No se pudieron actualizar todas las cotizaciones en caché.',
      cacheError,
    );
  });
});
