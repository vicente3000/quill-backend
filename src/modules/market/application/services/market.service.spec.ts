import { ConflictException, NotFoundException } from '@nestjs/common';
import { MarketService } from './market.service';

describe('MarketService', () => {
  let service: MarketService;
  let stockModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    deleteOne: jest.Mock;
    countDocuments: jest.Mock;
  };
  let snapshotModel: {
    find: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };
  let marketRefreshService: {
    refreshMarket: jest.Mock;
  };
  let marketSeedService: {
    seedInitialStocks: jest.Mock;
  };
  let cacheService: {
    get: jest.Mock;
    set: jest.Mock;
  };
  let eventEmitter: {
    emit: jest.Mock;
  };
  let orderModel: { exists: jest.Mock };
  let positionModel: { exists: jest.Mock };
  let tradeModel: { exists: jest.Mock };
  let session: { withTransaction: jest.Mock; endSession: jest.Mock };

  beforeEach(() => {
    stockModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      deleteOne: jest.fn(),
      countDocuments: jest.fn(),
    };
    snapshotModel = {
      find: jest.fn(),
    };
    configService = { get: jest.fn() };
    marketRefreshService = { refreshMarket: jest.fn() };
    marketSeedService = { seedInitialStocks: jest.fn() };
    cacheService = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    orderModel = { exists: jest.fn() };
    positionModel = { exists: jest.fn() };
    tradeModel = { exists: jest.fn() };
    session = {
      withTransaction: jest.fn((callback: () => Promise<unknown>) =>
        callback(),
      ),
      endSession: jest.fn(),
    };

    service = new MarketService(
      stockModel as never,
      snapshotModel as never,
      orderModel as never,
      positionModel as never,
      tradeModel as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never,
      configService as never,
      marketRefreshService as never,
      marketSeedService as never,
      cacheService as never,
      eventEmitter as never,
    );
  });

  describe('onModuleInit', () => {
    function mockFindStock(): void {
      const exec = jest.fn().mockResolvedValue([]);
      const lean = jest.fn().mockReturnValue({ exec });
      stockModel.find.mockReturnValue({ lean });
    }

    it('seeds and refreshes when MARKET_FETCH_ON_STARTUP is true', async () => {
      mockFindStock();
      configService.get.mockReturnValue(true);

      await service.onModuleInit();

      expect(marketSeedService.seedInitialStocks).toHaveBeenCalled();
      expect(marketRefreshService.refreshMarket).toHaveBeenCalled();
    });

    it('seeds but does not refresh when MARKET_FETCH_ON_STARTUP is false', async () => {
      mockFindStock();
      configService.get.mockReturnValue(false);

      await service.onModuleInit();

      expect(marketSeedService.seedInitialStocks).toHaveBeenCalled();
      expect(marketRefreshService.refreshMarket).not.toHaveBeenCalled();
    });
  });

  it('lista cotizaciones ordenadas por simbolo', async () => {
    const exec = jest.fn().mockResolvedValue([{ symbol: 'AAPL' }]);
    const lean = jest.fn().mockReturnValue({ exec });
    const sort = jest.fn().mockReturnValue({ lean });
    stockModel.find.mockReturnValue({ sort });

    const result = await service.listQuotes();

    expect(sort).toHaveBeenCalledWith({ symbol: 1 });
    expect(result).toEqual([{ symbol: 'AAPL' }]);
  });

  it('escapa metacaracteres regex al buscar stocks', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const lean = jest.fn().mockReturnValue({ exec });
    const limit = jest.fn().mockReturnValue({ lean });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    stockModel.find.mockReturnValue({ sort });
    stockModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    });

    await service.listStocks({ search: 'AAPL.*', page: 1, limit: 50 });

    const escapedRegex = { $regex: '^AAPL\\.\\*', $options: 'i' };
    expect(stockModel.find).toHaveBeenCalledWith({
      $or: [{ symbol: escapedRegex }, { name: escapedRegex }],
    });
    expect(stockModel.countDocuments).toHaveBeenCalledWith({
      $or: [{ symbol: escapedRegex }, { name: escapedRegex }],
    });
  });

  it('ignora una búsqueda vacía después de normalizar espacios', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const lean = jest.fn().mockReturnValue({ exec });
    const limit = jest.fn().mockReturnValue({ lean });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    stockModel.find.mockReturnValue({ sort });
    stockModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    });

    await service.listStocks({ search: '   \n  ', page: 1, limit: 50 });

    expect(stockModel.find).toHaveBeenCalledWith({});
    expect(stockModel.countDocuments).toHaveBeenCalledWith({});
  });

  it('normaliza espacios y limita búsquedas largas a 64 caracteres', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const lean = jest.fn().mockReturnValue({ exec });
    const limit = jest.fn().mockReturnValue({ lean });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    stockModel.find.mockReturnValue({ sort });
    stockModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    });
    const search = `  Banco   ${'A'.repeat(100)}  `;
    const expectedTerm = `Banco ${'A'.repeat(58)}`;
    const expectedRegex = { $regex: `^${expectedTerm}`, $options: 'i' };

    await service.listStocks({ search, page: 1, limit: 50 });

    expect(stockModel.find).toHaveBeenCalledWith({
      $or: [{ symbol: expectedRegex }, { name: expectedRegex }],
    });
    expect(expectedTerm).toHaveLength(64);
  });

  it('obtiene el historial de precios en orden cronologico', async () => {
    const stockExec = jest
      .fn()
      .mockResolvedValue({ symbol: 'AAPL', source: 'yahoo' });
    const stockLean = jest.fn().mockReturnValue({ exec: stockExec });
    stockModel.findOne.mockReturnValue({ lean: stockLean });

    const snapshotExec = jest.fn().mockResolvedValue([
      { price: 103, createdAt: new Date('2026-01-03') },
      { price: 102, createdAt: new Date('2026-01-02') },
      { price: 101, createdAt: new Date('2026-01-01') },
    ]);
    const snapshotLean = jest.fn().mockReturnValue({ exec: snapshotExec });
    const limit = jest.fn().mockReturnValue({ lean: snapshotLean });
    const sort = jest.fn().mockReturnValue({ limit });
    snapshotModel.find.mockReturnValue({ sort });

    const result = await service.getPriceHistory('aapl', 3);

    expect(stockModel.findOne).toHaveBeenCalledWith({ symbol: 'AAPL' });
    expect(snapshotModel.find).toHaveBeenCalledWith({
      symbol: 'AAPL',
      source: 'yahoo',
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(limit).toHaveBeenCalledWith(3);
    expect(result).toEqual([
      { price: 101, createdAt: new Date('2026-01-01') },
      { price: 102, createdAt: new Date('2026-01-02') },
      { price: 103, createdAt: new Date('2026-01-03') },
    ]);
  });

  it('lanza error si la accion no existe', async () => {
    const exec = jest.fn().mockResolvedValue(null);
    const lean = jest.fn().mockReturnValue({ exec });
    stockModel.findOne.mockReturnValue({ lean });

    await expect(service.getQuote('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('getTopMovers', () => {
    it('returns stocks sorted by dayChangePercentage with limit', async () => {
      const exec = jest.fn().mockResolvedValue([
        { symbol: 'AAPL', dayChangePercentage: 5 },
        { symbol: 'MSFT', dayChangePercentage: 3 },
      ]);
      const lean = jest.fn().mockReturnValue({ exec });
      const limit = jest.fn().mockReturnValue({ lean });
      const sort = jest.fn().mockReturnValue({ limit });
      stockModel.find.mockReturnValue({ sort });

      const result = await service.getTopMovers(2);

      expect(sort).toHaveBeenCalledWith({ dayChangePercentage: -1 });
      expect(limit).toHaveBeenCalledWith(2);
      expect(result).toHaveLength(2);
    });
  });

  it.each<[string, Partial<Record<'order' | 'position' | 'trade', boolean>>]>([
    ['una orden pendiente', { order: true }],
    ['una posición', { position: true }],
    ['un trade', { trade: true }],
  ])('impide eliminar un stock con %s', async (_, references) => {
    stockModel.findOneAndUpdate.mockResolvedValue({
      symbol: 'AAPL',
      source: 'admin',
    });
    orderModel.exists.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(references.order ?? null),
    });
    positionModel.exists.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(references.position ?? null),
    });
    tradeModel.exists.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(references.trade ?? null),
    });

    await expect(service.deleteStock('aapl')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(stockModel.deleteOne).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it('elimina transaccionalmente un stock administrativo sin referencias', async () => {
    stockModel.findOneAndUpdate.mockResolvedValue({
      symbol: 'AAPL',
      source: 'admin',
    });
    for (const model of [orderModel, positionModel, tradeModel]) {
      model.exists.mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });
    }
    const deleteQuery = {
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(undefined),
    };
    stockModel.deleteOne.mockReturnValue(deleteQuery);

    await service.deleteStock('aapl');

    expect(stockModel.findOneAndUpdate).toHaveBeenCalledWith(
      { symbol: 'AAPL' },
      { $currentDate: { updatedAt: true } },
      { returnDocument: 'after', session },
    );
    expect(deleteQuery.session).toHaveBeenCalledWith(session);
    expect(session.endSession).toHaveBeenCalled();
  });

  it('delega el refresh de mercado al servicio especializado', async () => {
    marketRefreshService.refreshMarket.mockResolvedValue([{ symbol: 'COPEC' }]);

    const result = await service.refreshMarket();

    expect(marketRefreshService.refreshMarket).toHaveBeenCalledWith();
    expect(result).toEqual([{ symbol: 'COPEC' }]);
  });
});
