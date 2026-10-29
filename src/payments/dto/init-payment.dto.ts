import { IsIn, IsOptional } from 'class-validator';

export class InitPaymentDto {
  @IsIn([
    'daily_pass',
    'credit_100',
    'credit_500',
    'credit_1000',
    'monthly_pro',
    'yearly_pro',
  ])
  plan!: string;

  @IsOptional()
  @IsIn(['ETB'])
  currency?: 'ETB';
}