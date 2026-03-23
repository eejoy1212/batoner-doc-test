import { Body, Controller, Get, Put } from '@nestjs/common';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('subscription')
  async getSubscription() {
    return this.billingService.getSubscription();
  }

  @Put('subscription')
  async updateSubscription(@Body() body: unknown) {
    return this.billingService.updateSubscription(body);
  }
}
