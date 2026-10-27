import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AnalysisService } from './analysis.service';

@Controller('products')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Get(':id/analysis')
  analyze(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.analysis.analyze(id, userId);
  }
}