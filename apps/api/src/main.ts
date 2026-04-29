import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: config.get<string>("WEB_URL", "http://localhost:3000"),
    credentials: true,
  });

  const port = config.get<number>("API_PORT", 4000);
  await app.listen(port);
  console.log(`🚀 Supkeys API running on http://localhost:${port}/api`);
}

bootstrap();
