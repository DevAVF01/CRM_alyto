/**
 * Middleware para auditoría léxica en tiempo de ejecución
 * Garantiza cumplimiento de directrices de marca y normativa ASFI / ECP
 */

const FORBIDDEN_RULES = [
  { regex: /remesas/i, error: "Uso no permitido de 'remesas'. Utilizar 'transferencias internacionales'." },
  { regex: /non-custodial/i, error: "Uso no permitido de 'non-custodial'. Utilizar 'custodia institucional' o 'wallets custodiales'." },
  { regex: /tenemos licencia/i, error: "Uso no permitido de 'tenemos licencia'. La entidad opera en el ECP bajo supervisión de ASFI." },
  { regex: /somos los únicos/i, error: "Uso no permitido de 'somos los únicos'. No se realizan comparaciones de exclusividad en el ECP." },
  { regex: /—/g, error: "Uso no permitido de guión largo (—) en interfaz y comunicaciones." }
];

export function brandLinterMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    const stringified = JSON.stringify(req.body);
    for (const rule of FORBIDDEN_RULES) {
      if (rule.regex.test(stringified)) {
        return res.status(400).json({
          error: 'Infracción de directrices institucionales de marca y ECP ASFI',
          detail: rule.error
        });
      }
    }
  }
  next();
}
