import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { UsersService } from './users.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const comparePassword = bcrypt.compare as unknown as jest.MockedFunction<
  (plainText: string, hash: string) => Promise<boolean>
>;
const hashPassword = bcrypt.hash as unknown as jest.MockedFunction<
  (plainText: string, rounds: number) => Promise<string>
>;

interface UserModelMock {
  exists: jest.Mock;
  create: jest.Mock;
  findOne: jest.Mock;
  findById: jest.Mock;
  find: jest.Mock;
  countDocuments: jest.Mock;
}

interface FriendshipModelMock {
  exists: jest.Mock;
  create: jest.Mock;
  findOne: jest.Mock;
  find: jest.Mock;
  deleteMany: jest.Mock;
  countDocuments: jest.Mock;
}

interface MutableDocumentMock {
  _id: string;
  id?: string;
  fullName?: string;
  username?: string;
  email?: string;
  passwordHash?: string;
  tokenVersion?: number;
  watchlist?: string[];
  status?: string;
  save: jest.Mock;
}

function createExecQuery<T>(value: T) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

function createLeanQuery<T>(value: T) {
  return {
    lean: jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue(value) }),
  };
}

function firstCallArgument(mock: jest.Mock): unknown {
  const calls = mock.mock.calls as unknown as unknown[][];
  return calls[0]?.[0];
}

describe('UsersService', () => {
  let service: UsersService;
  let userModel: UserModelMock;
  let friendshipModel: FriendshipModelMock;
  let stockModel: { find: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    userModel = {
      exists: jest.fn(),
      create: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
    };
    friendshipModel = {
      exists: jest.fn(),
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      deleteMany: jest.fn(),
      countDocuments: jest.fn(),
    };
    stockModel = {
      find: jest.fn(),
    };
    configService = {
      get: jest.fn(),
    };

    service = new UsersService(
      userModel as never,
      friendshipModel as never,
      stockModel as never,
      configService as never,
      { get: jest.fn().mockResolvedValue(null) } as never,
    );
  });

  describe('createUser', () => {
    it('crea un usuario con username auto-generado y correo normalizado', async () => {
      userModel.exists.mockResolvedValueOnce(null);
      userModel.exists.mockResolvedValueOnce(null);
      configService.get.mockReturnValue(100000);
      userModel.create.mockResolvedValue({
        id: 'user-1',
        email: 'ana@quill.dev',
        username: 'user_a1b2c3',
      });

      const result = await service.createUser({
        fullName: 'Ana Lopez',
        email: 'ANA@QUILL.DEV',
        passwordHash: 'hashed-password',
      });

      expect(userModel.exists).toHaveBeenNthCalledWith(1, {
        email: 'ana@quill.dev',
      });
      const createInput = firstCallArgument(userModel.create) as {
        username: string;
      };
      expect(createInput.username).toMatch(/^user_[0-9a-f]{6}$/);
      expect(userModel.create).toHaveBeenCalledWith({
        fullName: 'Ana Lopez',
        email: 'ana@quill.dev',
        accountType: 'external',
        passwordHash: 'hashed-password',
        username: createInput.username,
        availableBalance: 100000,
        reservedBalance: 0,
      });
      expect(result).toEqual({
        id: 'user-1',
        email: 'ana@quill.dev',
        username: 'user_a1b2c3',
      });
    });

    it('rechaza un correo equivalente aunque cambie la capitalizacion', async () => {
      userModel.exists.mockResolvedValueOnce({ _id: 'existing-user' });

      await expect(
        service.createUser({
          fullName: 'Ana Lopez',
          email: 'ANA@QUILL.DEV',
          passwordHash: 'hashed-password',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(userModel.exists).toHaveBeenCalledWith({
        email: 'ana@quill.dev',
      });
      expect(userModel.create).not.toHaveBeenCalled();
    });

    it('usa el username proporcionado si es valido', async () => {
      userModel.exists.mockResolvedValueOnce(null);
      userModel.exists.mockResolvedValueOnce(null);
      configService.get.mockReturnValue(100000);
      userModel.create.mockResolvedValue({
        id: 'user-2',
        email: 'luis@quill.dev',
        username: 'luis123',
      });

      const result = await service.createUser({
        fullName: 'Luis Perez',
        email: 'luis@quill.dev',
        passwordHash: 'hashed-password',
        username: 'Luis123',
      });

      expect(userModel.exists).toHaveBeenNthCalledWith(2, {
        username: 'luis123',
      });
      expect(userModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'luis123' }),
      );
      expect(result.username).toBe('luis123');
    });

    it('rechaza username duplicado', async () => {
      userModel.exists.mockResolvedValueOnce(null);
      userModel.exists.mockResolvedValueOnce({ _id: 'existing' });

      await expect(
        service.createUser({
          fullName: 'Luis Perez',
          email: 'luis@quill.dev',
          passwordHash: 'hashed-password',
          username: 'TakenUser',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rechaza crear un usuario cuando el correo ya existe', async () => {
      userModel.exists.mockResolvedValue({ _id: 'existing-user' });

      await expect(
        service.createUser({
          fullName: 'Ana Lopez',
          email: 'ana@quill.dev',
          passwordHash: 'hashed-password',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(userModel.create).not.toHaveBeenCalled();
    });

    it('traduce una colision concurrente de email a conflicto', async () => {
      userModel.exists.mockResolvedValue(null);
      configService.get.mockReturnValue(100000);
      userModel.create.mockRejectedValue({
        code: 11000,
        keyPattern: { email: 1 },
        keyValue: { email: 'ana@quill.dev' },
      });

      await expect(
        service.createUser({
          fullName: 'Ana Lopez',
          email: 'ANA@QUILL.DEV',
          passwordHash: 'hashed-password',
          username: 'ana',
        }),
      ).rejects.toThrow('Ya existe una cuenta con ese correo.');
    });

    it('traduce una colision concurrente de username a conflicto', async () => {
      userModel.exists.mockResolvedValue(null);
      configService.get.mockReturnValue(100000);
      userModel.create.mockRejectedValue({
        code: 11000,
        keyPattern: { username: 1 },
        keyValue: { username: 'ana' },
      });

      await expect(
        service.createUser({
          fullName: 'Ana Lopez',
          email: 'ana@quill.dev',
          passwordHash: 'hashed-password',
          username: 'Ana',
        }),
      ).rejects.toThrow('Ese nombre de usuario ya está en uso.');
    });
  });

  describe('findByEmail', () => {
    it('busca por correo normalizado', async () => {
      const user = { id: 'user-1', email: 'ana@quill.dev' };
      userModel.findOne.mockReturnValue(createExecQuery(user));

      const result = await service.findByEmail('ANA@QUILL.DEV');

      expect(userModel.findOne).toHaveBeenCalledWith({
        email: 'ana@quill.dev',
      });
      expect(result).toBe(user);
    });
  });

  describe('findById', () => {
    it('lanza error si no existe', async () => {
      userModel.findById.mockReturnValue(createExecQuery(null));

      await expect(service.findById('user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('retorna el usuario si existe', async () => {
      const user = { id: 'user-1', email: 'ana@quill.dev' };
      userModel.findById.mockReturnValue(createExecQuery(user));

      expect(await service.findById('user-1')).toBe(user);
    });
  });

  describe('findByIdentity', () => {
    it('busca por email', async () => {
      const user = { id: 'user-1', email: 'ana@quill.dev' };
      userModel.findOne.mockReturnValue(createExecQuery(user));

      const result = await service.findByIdentity('ana@quill.dev');

      expect(userModel.findOne).toHaveBeenCalledWith({
        $or: [{ email: 'ana@quill.dev' }, { username: 'ana@quill.dev' }],
      });
      expect(result).toBe(user);
    });

    it('normaliza el correo al buscar por identidad', async () => {
      const user = { id: 'user-1', email: 'ana@quill.dev' };
      userModel.findOne.mockReturnValue(createExecQuery(user));

      await service.findByIdentity('ANA@QUILL.DEV');

      expect(userModel.findOne).toHaveBeenCalledWith({
        $or: [{ email: 'ana@quill.dev' }, { username: 'ana@quill.dev' }],
      });
    });
  });

  describe('updateProfile', () => {
    it('actualiza fullName y username', async () => {
      const user = {
        _id: 'user-1',
        id: 'user-1',
        fullName: 'Old Name',
        username: 'old_user',
        save: jest.fn().mockResolvedValue(true),
      } satisfies MutableDocumentMock;
      userModel.findById.mockReturnValue(createExecQuery(user));
      userModel.exists.mockResolvedValue(null);

      const result = await service.updateProfile('user-1', {
        fullName: 'New Name',
        username: 'new_user',
      });

      expect(user.fullName).toBe('New Name');
      expect(user.username).toBe('new_user');
      expect(user.save).toHaveBeenCalled();
      expect(result).toBe(user);
    });

    it('rechaza username duplicado', async () => {
      const user = {
        _id: 'user-1',
        save: jest.fn(),
      } satisfies MutableDocumentMock;
      userModel.findById.mockReturnValue(createExecQuery(user));
      userModel.exists.mockResolvedValue({ _id: 'other-user' });

      await expect(
        service.updateProfile('user-1', { username: 'taken' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('changeEmail', () => {
    it('cambia el email e invalida los tokens anteriores', async () => {
      const user = {
        _id: 'user-1',
        email: 'old@quill.dev',
        passwordHash: 'hashed',
        tokenVersion: 4,
        save: jest.fn().mockResolvedValue(true),
      } satisfies MutableDocumentMock;
      userModel.findById.mockReturnValue(createExecQuery(user));
      comparePassword.mockResolvedValue(true);
      userModel.exists.mockResolvedValue(null);

      await service.changeEmail('user-1', 'correct-password', 'new@quill.dev');

      expect(user.email).toBe('new@quill.dev');
      expect(user.tokenVersion).toBe(5);
      expect(user.save).toHaveBeenCalled();
    });

    it('rechaza con contraseña incorrecta', async () => {
      const user = {
        _id: 'user-1',
        passwordHash: 'hashed',
        save: jest.fn(),
      } satisfies MutableDocumentMock;
      userModel.findById.mockReturnValue(createExecQuery(user));
      comparePassword.mockResolvedValue(false);

      await expect(
        service.changeEmail('user-1', 'wrong', 'new@quill.dev'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(user.save).not.toHaveBeenCalled();
    });

    it('rechaza si el nuevo email ya esta en uso', async () => {
      const user = {
        _id: 'user-1',
        passwordHash: 'hashed',
        save: jest.fn(),
      } satisfies MutableDocumentMock;
      userModel.findById.mockReturnValue(createExecQuery(user));
      comparePassword.mockResolvedValue(true);
      userModel.exists.mockResolvedValue({ _id: 'other-user' });

      await expect(
        service.changeEmail('user-1', 'pass', 'taken@quill.dev'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('changePassword', () => {
    it('cambia la contraseña e invalida los tokens anteriores', async () => {
      const user = {
        _id: 'user-1',
        passwordHash: 'old-hash',
        tokenVersion: 4,
        save: jest.fn().mockResolvedValue(true),
      } satisfies MutableDocumentMock;
      userModel.findById.mockReturnValue(createExecQuery(user));
      comparePassword.mockResolvedValue(true);
      hashPassword.mockResolvedValue('new-hash');

      await service.changePassword('user-1', 'old-pass', 'new-pass-long');

      expect(bcrypt.hash).toHaveBeenCalledWith('new-pass-long', 10);
      expect(user.passwordHash).toBe('new-hash');
      expect(user.tokenVersion).toBe(5);
      expect(user.save).toHaveBeenCalled();
    });

    it('rechaza con contraseña actual incorrecta', async () => {
      const user = {
        _id: 'user-1',
        passwordHash: 'old-hash',
        save: jest.fn(),
      } satisfies MutableDocumentMock;
      userModel.findById.mockReturnValue(createExecQuery(user));
      comparePassword.mockResolvedValue(false);

      await expect(
        service.changePassword('user-1', 'wrong', 'new-pass-long'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(user.save).not.toHaveBeenCalled();
    });
  });

  describe('watchlist', () => {
    it('agrega simbolos al watchlist', async () => {
      const user = {
        _id: 'user-1',
        watchlist: ['AAPL'],
        save: jest.fn().mockResolvedValue(true),
      } satisfies MutableDocumentMock;
      userModel.findById.mockReturnValue(createExecQuery(user));

      const result = await service.addToWatchlist('user-1', ['AAPL', 'MSFT']);

      expect(user.watchlist).toEqual(['AAPL', 'MSFT']);
      expect(user.save).toHaveBeenCalled();
      expect(result).toBe(user);
    });

    it('normaliza y deduplica simbolos antes de persistir', async () => {
      const user = {
        _id: 'user-1',
        watchlist: ['aapl', 'AAPL'],
        save: jest.fn().mockResolvedValue(true),
      } satisfies MutableDocumentMock;
      userModel.findById.mockReturnValue(createExecQuery(user));

      await service.addToWatchlist('user-1', ['msft', 'MSFT', 'AAPL']);

      expect(user.watchlist).toEqual(['AAPL', 'MSFT']);
      expect(user.save).toHaveBeenCalled();
    });

    it('rechaza agregar simbolos cuando la watchlist supera el maximo', async () => {
      const user = {
        _id: 'user-1',
        watchlist: Array.from({ length: 50 }, (_, index) => `SYM${index}`),
        save: jest.fn(),
      } satisfies MutableDocumentMock;
      userModel.findById.mockReturnValue(createExecQuery(user));

      await expect(
        service.addToWatchlist('user-1', ['EXTRA']),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(user.save).not.toHaveBeenCalled();
    });

    it('elimina un simbolo del watchlist', async () => {
      const user = {
        _id: 'user-1',
        watchlist: ['AAPL', 'MSFT', 'GOOGL'],
        save: jest.fn().mockResolvedValue(true),
      } satisfies MutableDocumentMock;
      userModel.findById.mockReturnValue(createExecQuery(user));

      const result = await service.removeFromWatchlist('user-1', 'MSFT');

      expect(user.watchlist).toEqual(['AAPL', 'GOOGL']);
      expect(result).toBe(user);
    });

    it('retorna datos de acciones para el watchlist', async () => {
      userModel.findById.mockReturnValue(
        createExecQuery({ _id: 'user-1', watchlist: ['AAPL', 'MSFT'] }),
      );
      stockModel.find.mockReturnValue(
        createLeanQuery([
          {
            symbol: 'AAPL',
            name: 'Apple',
            close: 150,
            previousClose: 148,
            dayChangePercentage: 1.35,
            currency: 'USD',
          },
          {
            symbol: 'MSFT',
            name: 'Microsoft',
            close: 300,
            previousClose: 295,
            dayChangePercentage: 1.69,
            currency: 'USD',
          },
        ]),
      );

      const result = await service.getWatchlist('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].symbol).toBe('AAPL');
      expect(result[1].symbol).toBe('MSFT');
    });
  });

  describe('friends', () => {
    const userId = new Types.ObjectId().toString();
    const friendId = new Types.ObjectId().toString();

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('envia solicitud de amistad', async () => {
      userModel.findById.mockReturnValue(createExecQuery({ _id: friendId }));
      friendshipModel.exists.mockResolvedValue(null);
      friendshipModel.create.mockResolvedValue(true);

      await service.sendFriendRequest(userId, friendId);

      const friendshipInput = firstCallArgument(friendshipModel.create) as {
        userId: unknown;
        friendId: unknown;
        status: string;
      };
      expect(friendshipInput.userId).toBeInstanceOf(Types.ObjectId);
      expect(friendshipInput.friendId).toBeInstanceOf(Types.ObjectId);
      expect(friendshipInput.status).toBe('pending');
    });

    it('rechaza auto-solicitud', async () => {
      await expect(
        service.sendFriendRequest(userId, userId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza solicitud duplicada', async () => {
      userModel.findById.mockReturnValue(createExecQuery({ _id: friendId }));
      friendshipModel.exists.mockResolvedValue({ _id: 'existing' });

      await expect(
        service.sendFriendRequest(userId, friendId),
      ).rejects.toBeInstanceOf(ConflictException);

      const filter = firstCallArgument(friendshipModel.exists) as {
        $or: Array<{ userId: Types.ObjectId; friendId: Types.ObjectId }>;
      };
      expect(filter.$or).toEqual([
        {
          userId: new Types.ObjectId(userId),
          friendId: new Types.ObjectId(friendId),
        },
        {
          userId: new Types.ObjectId(friendId),
          friendId: new Types.ObjectId(userId),
        },
      ]);
    });

    it('rechaza una solicitud inversa cuando ya existe A hacia B', async () => {
      userModel.findById.mockReturnValue(createExecQuery({ _id: userId }));
      friendshipModel.exists.mockResolvedValue({ _id: 'a-to-b' });

      await expect(
        service.sendFriendRequest(friendId, userId),
      ).rejects.toBeInstanceOf(ConflictException);

      const filter = firstCallArgument(friendshipModel.exists) as {
        $or: Array<{ userId: Types.ObjectId; friendId: Types.ObjectId }>;
      };
      expect(filter.$or).toContainEqual({
        userId: new Types.ObjectId(userId),
        friendId: new Types.ObjectId(friendId),
      });
      expect(friendshipModel.create).not.toHaveBeenCalled();
    });

    it('acepta solicitud de amistad', async () => {
      const request = {
        _id: 'request-1',
        status: 'pending',
        save: jest.fn().mockResolvedValue(true),
      } satisfies MutableDocumentMock;
      friendshipModel.findOne.mockReturnValue(createExecQuery(request));

      await service.acceptFriendRequest(userId, friendId);

      expect(request.status).toBe('accepted');
      expect(request.save).toHaveBeenCalled();
    });

    it('elimina amistad en ambas direcciones', async () => {
      friendshipModel.deleteMany.mockReturnValue(
        createExecQuery({ deletedCount: 2 }),
      );

      await service.removeFriend(userId, friendId);

      const deleteFilter = firstCallArgument(friendshipModel.deleteMany) as {
        $or: Array<{ userId: unknown; friendId: unknown }>;
      };
      expect(deleteFilter.$or).toHaveLength(2);
      for (const direction of deleteFilter.$or) {
        expect(direction.userId).toBeInstanceOf(Types.ObjectId);
        expect(direction.friendId).toBeInstanceOf(Types.ObjectId);
      }
    });

    it('lista amigos aceptados', async () => {
      friendshipModel.find.mockReturnValue(
        createLeanQuery([
          {
            userId: new Types.ObjectId(userId),
            friendId: new Types.ObjectId(friendId),
            status: 'accepted',
          },
        ]),
      );
      userModel.find.mockReturnValue(
        createLeanQuery([
          {
            _id: new Types.ObjectId(friendId),
            fullName: 'Friend',
            email: 'friend@quill.dev',
            username: 'friend_user',
          },
        ]),
      );

      const friends = await service.getFriends(userId);

      expect(friends).toEqual([
        {
          _id: friendId,
          id: friendId,
          fullName: 'Friend',
          email: 'friend@quill.dev',
          username: 'friend_user',
        },
      ]);
    });

    it('lista solicitudes pendientes con contrato compatible', async () => {
      const requestId = new Types.ObjectId();
      const createdAt = new Date('2026-06-15T10:00:00.000Z');
      friendshipModel.find.mockReturnValue(
        createLeanQuery([
          {
            _id: requestId,
            userId: new Types.ObjectId(friendId),
            friendId: new Types.ObjectId(userId),
            status: 'pending',
            createdAt,
          },
        ]),
      );
      userModel.find.mockReturnValue(
        createLeanQuery([
          {
            _id: new Types.ObjectId(friendId),
            fullName: 'Friend',
            email: 'friend@quill.dev',
            username: 'friend_user',
          },
        ]),
      );

      expect(await service.getPendingRequests(userId)).toEqual([
        {
          _id: requestId.toString(),
          id: requestId.toString(),
          from: {
            _id: friendId,
            id: friendId,
            fullName: 'Friend',
            email: 'friend@quill.dev',
            username: 'friend_user',
          },
          fromUserId: friendId,
          fullName: 'Friend',
          email: 'friend@quill.dev',
          username: 'friend_user',
          status: 'pending',
          createdAt,
          requestedAt: createdAt,
        },
      ]);
    });
  });

  describe('toProfile', () => {
    it('expone el perfil publico del usuario incluyendo nuevos campos', () => {
      const profile = service.toProfile({
        id: 'user-1',
        fullName: 'Ana Lopez',
        email: 'ana@quill.dev',
        role: 'investor',
        accountType: 'external',
        username: 'ana_lopez',
        availableBalance: 100000,
        reservedBalance: 2500,
        watchlist: ['AAPL', 'MSFT'],
      } as never);

      expect(profile).toEqual({
        id: 'user-1',
        fullName: 'Ana Lopez',
        email: 'ana@quill.dev',
        role: 'investor',
        accountType: 'external',
        username: 'ana_lopez',
        availableBalance: 100000,
        reservedBalance: 2500,
        watchlist: ['AAPL', 'MSFT'],
      });
    });

    it('retorna username null si no tiene', () => {
      const profile = service.toProfile({
        id: 'user-1',
        fullName: 'Ana Lopez',
        email: 'ana@quill.dev',
        role: 'investor',
        accountType: 'external',
        username: undefined,
        availableBalance: 100000,
        reservedBalance: 0,
        watchlist: [],
      } as never);

      expect(profile.username).toBeNull();
    });
  });
});
