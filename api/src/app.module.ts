import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BillingController } from './billing/billing.controller';
import { BillingService } from './billing/billing.service';
import { OcrEngineService } from './ocr/ocr-engine.service';
import { VerificationController } from './verification/verification.controller';
import { VerificationSettingsService } from './verification/verification-settings.service';
import { VerificationService } from './verification/verification.service';

@Module({
  imports: [],
  controllers: [AppController, VerificationController, BillingController],
  providers: [
    AppService,
    BillingService,
    OcrEngineService,
    VerificationService,
    VerificationSettingsService,
  ],
})
export class AppModule {}
