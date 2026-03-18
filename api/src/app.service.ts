import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health() {
    return {
      success: true,
      message: 'API is running',
      port: 4000,
    };
  }
}
