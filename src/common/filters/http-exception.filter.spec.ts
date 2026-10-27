import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function getLogger(filter: HttpExceptionFilter): Logger {
  return (filter as unknown as { logger: Logger }).logger;
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: {
    status: jest.Mock;
    json: jest.Mock;
    setHeader: jest.Mock;
  };
  let mockRequest: { url: string; headers: Record<string, string> };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    };
    mockRequest = { url: '/test', headers: {} };
    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    } as unknown as ArgumentsHost;
  });

  beforeAll(() => {
    Logger.overrideLogger(false); // disable all logging
  });

  it('returns 500 for non-HttpException errors', () => {
    filter.catch(new Error('unexpected'), mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    const calls = mockResponse.json.mock.calls as unknown as Array<
      [
        {
          statusCode: number;
          path: string;
          timestamp: unknown;
          message: string;
          error: unknown;
        },
      ]
    >;
    expect(calls[0][0]).toMatchObject({
      statusCode: 500,
      path: '/test',
      message: 'Ha ocurrido un error inesperado.',
      error: undefined,
    });
    expect(typeof calls[0][0].timestamp).toBe('string');
  });

  it('logs non-HttpException errors', () => {
    const errorSpy = jest.spyOn(getLogger(filter), 'error');
    const error = new Error('something broke');

    filter.catch(error, mockHost);

    expect(errorSpy).toHaveBeenCalledWith(error);
  });

  it('does not log HttpException errors', () => {
    const errorSpy = jest.spyOn(getLogger(filter), 'error');

    filter.catch(new BadRequestException('bad input'), mockHost);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('uses HttpException status code', () => {
    filter.catch(new BadRequestException('bad input'), mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
  });

  it('extracts string message from HttpException', () => {
    filter.catch(new BadRequestException('bad input'), mockHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'bad input' }),
    );
  });

  it('extracts message and error from object response', () => {
    filter.catch(
      new HttpException(
        { message: ['field is required'], error: 'ValidationError' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      ),
      mockHost,
    );

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        message: ['field is required'],
        error: 'ValidationError',
      }),
    );
  });

  it('extracts array message from object response', () => {
    filter.catch(
      new BadRequestException(['email is invalid', 'password too short']),
      mockHost,
    );

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: ['email is invalid', 'password too short'],
      }),
    );
  });

  it('falls back to default message when no message in response', () => {
    filter.catch(new HttpException({ statusCode: 400 }, 400), mockHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Ha ocurrido un error inesperado.',
      }),
    );
  });

  it('maps duplicate database errors without leaking database details', () => {
    filter.catch(
      { code: 11000, keyValue: { email: 'secret@example.com' } },
      mockHost,
    );

    expect(mockResponse.status).toHaveBeenCalledWith(409);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'DUPLICATE_RESOURCE',
        message: 'Ya existe un recurso con esos datos.',
      }),
    );
  });

  it('propagates a safe request id for operational tracing', () => {
    mockRequest.headers['x-request-id'] = 'request-123';

    filter.catch(new BadRequestException('bad input'), mockHost);

    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      'request-123',
    );
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-123' }),
    );
  });
});
