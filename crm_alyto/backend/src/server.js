import 'dotenv/config';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 4000);
const app = createApp();

const server = app.listen(port, () => {
  app.locals.logger.info(`crm_alyto backend listo en puerto ${port} | ECP ASFI | Stellar Testnet`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    app.locals.logger.info(`senal ${signal} recibida, cerrando servidor`);
    server.close(() => process.exit(0));
  });
}
