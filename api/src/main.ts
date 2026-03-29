import './load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const corsOrigins = (
    process.env.CORS_ORIGIN ||
    'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .map((origin) => origin.replace(/\/+$/, ''))
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const port = Number(process.env.PORT || 4000);
  const rawUseApiPrefix = process.env.USE_GLOBAL_API_PREFIX?.trim().toLowerCase();
  const useApiPrefix =
    rawUseApiPrefix === 'true'
      ? true
      : rawUseApiPrefix === 'false'
        ? false
        : process.env.NODE_ENV === 'production';

  if (useApiPrefix) {
    app.setGlobalPrefix('api');
  }

  await app.listen(port, '0.0.0.0');
}
bootstrap();
