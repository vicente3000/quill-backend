export interface YahooFinanceQuote {
  symbol: string;
  name?: string;
  currency: string;
  exchange: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  previousClose: number;
  volume?: number;
  timestamp: Date;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        currency?: string;
        exchangeName?: string;
        fullExchangeName?: string;
        longName?: string;
        shortName?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
        previousClose?: number;
        chartPreviousClose?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { code?: string; description?: string } | null;
  };
}

export async function fetchYahooFinanceQuote(
  ticker: string,
  baseUrl: string,
): Promise<YahooFinanceQuote> {
  const normalizedTicker = ticker.trim().toUpperCase();
  const url = `${baseUrl.replace(/\/+$/, '')}/v8/finance/chart/${encodeURIComponent(normalizedTicker)}?interval=5m&range=1d`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Quill educational market client' },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const payload = (await response.json()) as YahooChartResponse;
  if (payload.chart?.error) {
    throw new Error(
      payload.chart.error.description ??
        payload.chart.error.code ??
        'Yahoo Finance error',
    );
  }

  const result = payload.chart?.result?.[0];
  const meta = result?.meta;
  const quote = result?.indicators?.quote?.[0];
  const price = meta?.regularMarketPrice ?? lastNumber(quote?.close);

  if (!result || !meta || price == null || !Number.isFinite(price)) {
    throw new Error(`No usable quote returned for ${normalizedTicker}`);
  }

  const timestampSeconds =
    meta.regularMarketTime ?? result.timestamp?.at(-1) ?? Date.now() / 1000;

  return {
    symbol: meta.symbol ?? normalizedTicker,
    name: meta.longName ?? meta.shortName,
    currency: meta.currency ?? 'USD',
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? 'Yahoo Finance',
    price,
    open: lastNumber(quote?.open),
    high: lastNumber(quote?.high),
    low: lastNumber(quote?.low),
    previousClose: meta.chartPreviousClose ?? meta.previousClose ?? price,
    volume: lastNumber(quote?.volume),
    timestamp: new Date(timestampSeconds * 1000),
  };
}

function lastNumber(values?: Array<number | null>): number | undefined {
  if (!values) return undefined;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value != null && Number.isFinite(value)) return value;
  }
  return undefined;
}
