import {
  BadRequestException,
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { VerificationService } from './verification.service';

type UploadFileFields = {
  signPdf?: Express.Multer.File[];
};

@Controller('verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'signPdf', maxCount: 1 }],
      {
        storage: memoryStorage(),
        limits: {
          fileSize: 20 * 1024 * 1024,
        },
      },
    ),
  )
  async upload(@UploadedFiles() files: UploadFileFields) {
    const signPdf = files.signPdf?.[0];

    if (!signPdf) {
      throw new BadRequestException('Missing file field: signPdf');
    }

    return this.verificationService.processUpload(signPdf);
  }
}
