import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { VerificationSettingsService } from './verification-settings.service';
import { VerificationService } from './verification.service';

type UploadFileFields = {
  signPdf?: Express.Multer.File[];
  powerOfAttorneyImage?: Express.Multer.File[];
  receiptImage?: Express.Multer.File[];
  bidSheetImage?: Express.Multer.File[];
};

@Controller('verification')
export class VerificationController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly verificationSettingsService: VerificationSettingsService,
  ) {}

  @Get('settings')
  async getSettings() {
    return this.verificationSettingsService.getSettings();
  }

  @Put('settings')
  async updateSettings(@Body() body: unknown) {
    return this.verificationSettingsService.updateSettings(body);
  }

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'signPdf', maxCount: 1 },
        { name: 'powerOfAttorneyImage', maxCount: 1 },
        { name: 'receiptImage', maxCount: 1 },
        { name: 'bidSheetImage', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: {
          fileSize: 20 * 1024 * 1024,
        },
      },
    ),
  )
  async upload(
    @UploadedFiles() files: UploadFileFields,
    @Body() body: { applyReceiptPreprocess?: string },
  ) {
    const signPdf = files.signPdf?.[0];
    const powerOfAttorneyImage = files.powerOfAttorneyImage?.[0];
    const receiptImage = files.receiptImage?.[0];
    const bidSheetImage = files.bidSheetImage?.[0];
    const applyReceiptPreprocessRaw = body?.applyReceiptPreprocess;
    const applyReceiptPreprocess =
      String(applyReceiptPreprocessRaw ?? '').toLowerCase() === 'true';

    if (!signPdf && !powerOfAttorneyImage && !receiptImage && !bidSheetImage) {
      throw new BadRequestException(
        'At least one file is required: signPdf, powerOfAttorneyImage, receiptImage, or bidSheetImage',
      );
    }

    if (
      powerOfAttorneyImage &&
      !powerOfAttorneyImage.mimetype.startsWith('image/')
    ) {
      throw new BadRequestException(
        'powerOfAttorneyImage must be an image file',
      );
    }

    if (receiptImage && !receiptImage.mimetype.startsWith('image/')) {
      throw new BadRequestException('receiptImage must be an image file');
    }

    if (bidSheetImage && !bidSheetImage.mimetype.startsWith('image/')) {
      throw new BadRequestException('bidSheetImage must be an image file');
    }

    return this.verificationService.processUpload(
      signPdf,
      powerOfAttorneyImage,
      receiptImage,
      bidSheetImage,
      applyReceiptPreprocess,
    );
  }
}
