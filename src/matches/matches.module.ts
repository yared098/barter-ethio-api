import { Module } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { AnalysisModule } from 'src/analysis/analysis.module';

@Module({
    imports: [AnalysisModule],

  controllers: [MatchesController],
  providers: [MatchesService],
    exports: [MatchesService],

})
export class MatchesModule {}