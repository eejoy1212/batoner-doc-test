import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OcrEngineService } from './ocr/ocr-engine.service';
import { VerificationController } from './verification/verification.controller';
import { VerificationService } from './verification/verification.service';

@Module({
  imports: [],
  controllers: [AppController, VerificationController],
  providers: [AppService, OcrEngineService, VerificationService],
})
export class AppModule {}
