import { IsIn } from 'class-validator';

export class OfferActionDto {
  @IsIn(['accept', 'decline', 'cancel', 'complete'])
  action!: 'accept' | 'decline' | 'cancel' | 'complete';
}
