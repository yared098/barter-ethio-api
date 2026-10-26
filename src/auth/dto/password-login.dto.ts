import { IsEmail, IsString, MinLength } from 'class-validator';

export class PasswordLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}