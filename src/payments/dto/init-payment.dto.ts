import { IsIn, IsOptional } from 'class-validator';

export class InitPaymentDto {
  @IsIn([
    'daily_pass',
    'credit_100',
    'credit_500',
    'credit_1000',
    'pro_15d',
    'monthly_pro',
    'pro_6mo',
    'yearly_pro',
  ])
  plan!: string;

  @IsOptional()
  @IsIn(['ETB'])
  currency?: 'ETB';
}