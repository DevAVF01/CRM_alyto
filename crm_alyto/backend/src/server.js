import 'dotenv/config';
import { createApp } from './app.js';
import { assertBootConfiguration } from './config/runtime.js';
import { iniciarMotor } from './motor/planificador.js';

const port = Number(process.env.PORT || 4000);

let runtime;
try {
  runtime = assertBootConfiguration();
} catch (err) {
  console.error('[ARRANQUE RECHAZADO]', err.message);
  process.exit(1);
}

const app = createApp();

if (runtime.demoMode) {
  app.locals.logger.warn(
    'MODO DEMOSTRACION ACTIVO (DEMO_MODE=true): el CRM lee del almacen en memoria y las sesiones se emiten con firma local. ' +
      'No ingresar datos reales de clientes en este modo.',
  );
} else {
  app.locals.logger.info(`Base de datos configurada en ${runtime.authLayer}. Capa de datos: ${runtime.dataLayer}.`);
}

const server = app.listen(port, () => {
  app.locals.logger.info(`crm_alyto backend listo en puerto ${port} | ECP ASFI | Stellar Testnet`);
});

// El motor de viajes corre dentro del propio proceso del servidor: un ciclo cada minuto y
// medio. Sin base configurada queda apagado y lo dice en el log, no se finge que corre.
iniciarMotor(app.locals.logger);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    app.locals.logger.info(`senal ${signal} recibida, cerrando servidor`);
    server.close(() => process.exit(0));
  });
}
