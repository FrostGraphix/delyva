import { createApp } from './create-app.js';
import { loadEnv } from './shared/config/env.js';

const env = loadEnv();
const { app, logger } = await createApp(env);
await app.listen(env.PORT);
logger.info({ port: env.PORT, smsProvider: env.SMS_PROVIDER }, 'delyva-api listening');
