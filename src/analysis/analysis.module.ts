import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { AiService } from './ai.service';

@Module({
  controllers: [AnalysisController],
  providers: [AnalysisService, AiService],
    exports: [AiService],

})
export class AnalysisModule {}