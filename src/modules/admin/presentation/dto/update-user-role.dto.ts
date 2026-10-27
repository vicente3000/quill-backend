import { IsIn, IsString } from 'class-validator';

export class UpdateUserRoleDto {
  @IsString()
  @IsIn(['admin', 'teacher', 'investor'])
  role!: 'admin' | 'teacher' | 'investor';
}
