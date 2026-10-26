import { IsIn } from 'class-validator';

export class UpdateRoleDto {
  @IsIn(['USER', 'ADMIN'])
  role!: 'USER' | 'ADMIN';
}