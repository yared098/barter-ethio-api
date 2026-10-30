import {
  Body,
  Controller,
  Get,
  Headers,        // 👈 add this
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { InitPaymentDto } from './dto/init-payment.dto';
import { PaymentsService } from './payments.service';
import { PLANS } from './plans';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('init')
  init(@CurrentUser() user: any, @Body() dto: InitPaymentDto) {
    return this.payments.init(user.id ?? user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':paymentId/status')
  status(@CurrentUser() user: any, @Param('paymentId') id: string) {
    return this.payments.getStatus(user.id ?? user.userId, id);
  }

  // ✅ Chapa POST webhook — pass the signature header for verification
  @Public()
@Post('webhook')
webhookPost(@Body() body: any) {
  return this.payments.handleWebhook(body);
}

  // Chapa callback_url uses GET — no signature header, rely on chapa.verify()
  @Public()
  @Get('webhook')
  webhookGet(@Query() query: any) {
    return this.payments.handleWebhook(query);
  }

  @Public()
  @Get('plans')
  plans() {
    return this.payments.getPlans();
  }

  @Public()
  @Get('by-tx/:txRef')
  byTx(@Param('txRef') txRef: string) {
    return this.payments.getByTxRef(txRef);
  }
}