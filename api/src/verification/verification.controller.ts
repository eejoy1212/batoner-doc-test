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

type SignPdfSpeedTestFileFields = {
  signPdf?: Express.Multer.File[];
};

type SignPdfSpeedTestBody = {
  mode?: string;
};

type PowerOfAttorneySpeedTestFileFields = {
  powerOfAttorneyImage?: Express.Multer.File[];
};

type ReceiptSpeedTestFileFields = {
  receiptImage?: Express.Multer.File[];
};

type BidSheetSpeedTestFileFields = {
  bidSheetImage?: Express.Multer.File[];
};

@Controller(['verification', 'api/verification'])
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

  @Post('warmup')
  async warmup() {
    return this.verificationService.warmupSignPdfCustomProcessor();
  }

  @Post('warmup-receipt')
  async warmupReceipt() {
    return this.verificationService.warmupReceiptFormProcessor();
  }

  @Post('speed-test/1')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'signPdf', maxCount: 1 }], {
      storage: memoryStorage(),
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  async speedTest1(
    @UploadedFiles() files: SignPdfSpeedTestFileFields,
    @Body() body: SignPdfSpeedTestBody,
  ) {
    const signPdf = files.signPdf?.[0];
    const mode = String(body?.mode ?? 'custom');

    if (!signPdf) {
      throw new BadRequestException(
        'signPdf 파일을 선택해주세요.',
      );
    }

    return this.verificationService.speedTestSignPdfV1Upload(signPdf, mode);
  }

  @Post('speed-test/2')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'powerOfAttorneyImage', maxCount: 1 }], {
      storage: memoryStorage(),
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  async speedTest2(
    @UploadedFiles() files: PowerOfAttorneySpeedTestFileFields,
    @Body() body: SignPdfSpeedTestBody,
  ) {
    const powerOfAttorneyImage = files.powerOfAttorneyImage?.[0];
    const mode = String(body?.mode ?? 'custom');

    if (!powerOfAttorneyImage) {
      throw new BadRequestException('powerOfAttorneyImage 파일을 선택해주세요.');
    }

    return this.verificationService.speedTestPowerOfAttorneyV2Upload(
      powerOfAttorneyImage,
      mode,
    );
  }

  @Post('speed-test/3')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'receiptImage', maxCount: 1 }], {
      storage: memoryStorage(),
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  async speedTest3(
    @UploadedFiles() files: ReceiptSpeedTestFileFields,
    @Body() body: SignPdfSpeedTestBody,
  ) {
    const receiptImage = files.receiptImage?.[0];
    const mode = String(body?.mode ?? 'custom');

    if (!receiptImage) {
      throw new BadRequestException('receiptImage 파일을 선택해주세요.');
    }

    return this.verificationService.speedTestReceiptV3Upload(
      receiptImage,
      mode,
    );
  }

  @Post('speed-test/4')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'bidSheetImage', maxCount: 1 }], {
      storage: memoryStorage(),
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  async speedTest4(
    @UploadedFiles() files: BidSheetSpeedTestFileFields,
    @Body() body: SignPdfSpeedTestBody,
  ) {
    const bidSheetImage = files.bidSheetImage?.[0];
    const mode = String(body?.mode ?? 'custom');

    if (!bidSheetImage) {
      throw new BadRequestException('bidSheetImage 파일을 선택해주세요.');
    }

    return this.verificationService.speedTestBidSheetV4Upload(
      bidSheetImage,
      mode,
    );
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
