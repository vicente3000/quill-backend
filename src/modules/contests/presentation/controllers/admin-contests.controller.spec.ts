import { AdminContestsController } from './admin-contests.controller';

describe('AdminContestsController', () => {
  const contestsService = {
    create: jest.fn().mockResolvedValue({ id: 'contest-1' }),
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: 'contest-1' }),
  };
  const controller = new AdminContestsController(contestsService as never);

  it('crea el concurso con el id del admin autenticado', async () => {
    const dto = { name: 'Concurso' } as never;

    await controller.create(
      { sub: 'admin-1', email: 'a@quill.dev', role: 'admin', tokenVersion: 0 },
      dto,
    );

    expect(contestsService.create).toHaveBeenCalledWith('admin-1', dto);
  });

  it('delega el listado y la búsqueda por id', async () => {
    await controller.findAll();
    await controller.findOne('contest-1');

    expect(contestsService.findAll).toHaveBeenCalled();
    expect(contestsService.findOne).toHaveBeenCalledWith('contest-1');
  });
});
