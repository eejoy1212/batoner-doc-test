import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const corsOrigins = (
    process.env.CORS_ORIGIN || 'http://localhost:3000,https://batoner-web.onrender.com/'
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
  await app.listen(port);
}
bootstrap();
