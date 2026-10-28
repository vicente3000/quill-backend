import { ContestsController } from './contests.controller';

describe('ContestsController', () => {
  const enrollmentsService = {
    findAllForUser: jest.fn().mockResolvedValue([]),
    enroll: jest.fn().mockResolvedValue({ contestId: 'contest-1' }),
  };
  const controller = new ContestsController(enrollmentsService as never);
  const user = {
    sub: 'user-1',
    email: 'u@quill.dev',
    role: 'investor' as const,
    tokenVersion: 0,
  };

  it('lista los concursos para el usuario autenticado', async () => {
    await controller.findAll(user);

    expect(enrollmentsService.findAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('inscribe al usuario autenticado en el concurso indicado', async () => {
    await controller.enroll(user, 'contest-1');

    expect(enrollmentsService.enroll).toHaveBeenCalledWith(
      'contest-1',
      'user-1',
    );
  });
});
