/**
 * Cliente comun de los tres conectores MCP (puertos 4601, 4602 y 4603).
 *
 * Hay dos formas de que un conector falle, y antes solo se traducia una:
 *   - el proceso contesta con un codigo de error  -> se convertia en 502;
 *   - el proceso no esta levantado                -> fetch reventaba con un TypeError sin
 *     codigo y el CRM respondia 500 "Error interno del servidor".
 * El segundo caso es el frecuente en el ECP, porque los conectores se arrancan a mano. Ahora los
 * dos responden 502 con el nombre y la direccion del conector que falta, que es lo que quien mira
 * el panel necesita para saber que proceso levantar. El mensaje tiene que salir con `expose`, si
 * no el manejador de errores lo reemplaza por el texto generico.
 */
export function createConnectorClient({ name, baseUrl }) {
  return async function call(path, options = {}) {
    let res;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: { 'content-type': 'application/json', ...(options.headers || {}) },
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      const fallo = new Error(
        `${name} no responde en ${baseUrl}: no esta levantado o tarda mas de 10 segundos. ` +
          `Levante el conector o senale su direccion con ${envVar(name)} en backend/.env.`,
      );
      fallo.status = 502;
      fallo.code = 'CONNECTOR_UNAVAILABLE';
      fallo.expose = true;
      fallo.cause = err;
      throw fallo;
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.error?.message || `${name} respondio ${res.status}`);
      err.status = 502;
      err.code = body?.error?.code || 'CONNECTOR_ERROR';
      err.expose = true;
      throw err;
    }
    return body.data;
  };
}

function envVar(name) {
  return {
    'stellar-connector': 'MCP_STELLAR_URL',
    'kyc-aml-connector': 'MCP_KYC_URL',
    'notifications-mcp': 'MCP_NOTIFICATIONS_URL',
  }[name] ?? 'la URL del conector';
}
