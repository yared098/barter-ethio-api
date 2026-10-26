import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateTierDto {
  @IsIn(['FREE', 'PRO'])
  tier!: 'FREE' | 'PRO';

  /** How many days PRO should last (only used when tier === 'PRO'). Null = forever. */
  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;
}