import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateContestDto } from './create-contest.dto';

describe('CreateContestDto validation', () => {
  const validPayload = {
    name: 'Concurso Otoño',
    description: 'Concurso interno',
    startDate: '2026-11-01T00:00:00.000Z',
    endDate: '2026-12-01T00:00:00.000Z',
    initialBalance: 1_000_000,
    mode: 'INDIVIDUAL',
    allowedAccountTypes: ['UNIVERSITY', 'EXTERNAL'],
  };

  const createDto = (values: Record<string, unknown> = {}) =>
    plainToInstance(CreateContestDto, { ...validPayload, ...values });

  const invalidProperties = async (values: Record<string, unknown>) => {
    const errors = await validate(createDto(values));

    return errors.map((error) => error.property);
  };

  it('acepta un payload válido', async () => {
    await expect(validate(createDto())).resolves.toHaveLength(0);
  });

  it('acepta un payload sin descripción', async () => {
    await expect(
      validate(createDto({ description: undefined })),
    ).resolves.toHaveLength(0);
  });

  it('rechaza un DTO vacío', async () => {
    const errors = await validate(new CreateContestDto());

    expect(errors.length).toBeGreaterThan(0);
  });

  it('recorta el nombre antes de validarlo', async () => {
    const dto = createDto({ name: '  Concurso  ' });

    expect(dto.name).toBe('Concurso');
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['', '  ab  ', 'a'.repeat(81)])(
    'rechaza nombre fuera de rango: "%s"',
    async (name) => {
      await expect(invalidProperties({ name })).resolves.toContain('name');
    },
  );

  it('rechaza una descripción de más de 500 caracteres', async () => {
    await expect(
      invalidProperties({ description: 'a'.repeat(501) }),
    ).resolves.toContain('description');
  });

  it('rechaza fechas que no son ISO-8601 con hora', async () => {
    await expect(
      invalidProperties({ startDate: 'mañana', endDate: '2026-12-01' }),
    ).resolves.toEqual(expect.arrayContaining(['startDate', 'endDate']));
  });

  it('rechaza endDate igual a startDate', async () => {
    await expect(
      invalidProperties({ endDate: validPayload.startDate }),
    ).resolves.toEqual(['endDate']);
  });

  it('rechaza endDate anterior a startDate', async () => {
    await expect(
      invalidProperties({ endDate: '2026-10-01T00:00:00.000Z' }),
    ).resolves.toEqual(['endDate']);
  });

  it.each([0, -1, 1_000_000_001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza initialBalance inválido: %s',
    async (initialBalance) => {
      await expect(invalidProperties({ initialBalance })).resolves.toContain(
        'initialBalance',
      );
    },
  );

  it('acepta initialBalance en el límite superior', async () => {
    await expect(
      validate(createDto({ initialBalance: 1_000_000_000 })),
    ).resolves.toHaveLength(0);
  });

  it('rechaza un mode fuera del enum', async () => {
    await expect(invalidProperties({ mode: 'SOLO' })).resolves.toContain(
      'mode',
    );
  });

  it('rechaza allowedAccountTypes vacío', async () => {
    await expect(
      invalidProperties({ allowedAccountTypes: [] }),
    ).resolves.toContain('allowedAccountTypes');
  });

  it('rechaza allowedAccountTypes con valores fuera del enum', async () => {
    await expect(
      invalidProperties({ allowedAccountTypes: ['UNIVERSITY', 'OTHER'] }),
    ).resolves.toContain('allowedAccountTypes');
  });

  it('rechaza allowedAccountTypes duplicados', async () => {
    await expect(
      invalidProperties({ allowedAccountTypes: ['EXTERNAL', 'EXTERNAL'] }),
    ).resolves.toContain('allowedAccountTypes');
  });
});
