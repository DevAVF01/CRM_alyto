import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import * as StellarSdk from '@stellar/stellar-sdk';

const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const FRIENDBOT_URL = process.env.STELLAR_FRIENDBOT_URL || 'https://friendbot.stellar.org';
const NETWORK = 'Stellar Testnet';

const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);
const networkPassphrase = StellarSdk.Networks.TESTNET;

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const wallets = new Map();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'stellar-connector', network: NETWORK, horizon: HORIZON_URL });
});

app.post('/wallets', async (req, res, next) => {
  try {
    const pair = StellarSdk.Keypair.random();
    try {
      await fetch(`${FRIENDBOT_URL}?addr=${pair.publicKey()}`, { signal: AbortSignal.timeout(15000) });
    } catch {
      // friendbot puede no estar disponible en entornos sin salida a internet; la clave sigue siendo utilizable en el ECP
    }
    const record = {
      publicKey: pair.publicKey(),
      secret: pair.secret(),
      network: NETWORK,
      custodial: true,
      createdAt: new Date().toISOString(),
    };
    wallets.set(pair.publicKey(), record);
    return res.status(201).json({ data: record });
  } catch (err) {
    return next(err);
  }
});

app.get('/wallets/:publicKey', async (req, res, next) => {
  try {
    const account = await horizon.loadAccount(req.params.publicKey);
    const balances = account.balances.map((b) => ({
      asset: b.asset_type === 'native' ? 'XLM' : b.asset_code,
      balance: b.balance,
    }));
    return res.json({ data: { publicKey: req.params.publicKey, network: NETWORK, balances } });
  } catch (err) {
    if (wallets.has(req.params.publicKey)) {
      return res.json({ data: { publicKey: req.params.publicKey, network: NETWORK, balances: [], note: 'cuenta pendiente de activacion en el ledger' } });
    }
    err.status = 404;
    err.expose = true;
    err.message = 'Cuenta no encontrada en Stellar Testnet';
    return next(err);
  }
});

app.post('/payments', async (req, res, next) => {
  try {
    const { fromSecret, to, amount, memo } = req.body || {};
    if (!fromSecret || !to || !amount) {
      const err = new Error('fromSecret, to y amount son requeridos');
      err.status = 400;
      err.expose = true;
      throw err;
    }
    const sourceKeys = StellarSdk.Keypair.fromSecret(fromSecret);
    const account = await horizon.loadAccount(sourceKeys.publicKey());
    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: await horizon.fetchBaseFee(),
      networkPassphrase,
    })
      .addOperation(StellarSdk.Operation.payment({ destination: to, asset: StellarSdk.Asset.native(), amount: String(amount) }))
      .addMemo(memo ? StellarSdk.Memo.text(String(memo).slice(0, 28)) : StellarSdk.Memo.none())
      .setTimeout(30)
      .build();
    transaction.sign(sourceKeys);
    const result = await horizon.submitTransaction(transaction);
    return res.status(201).json({
      data: {
        hash: result.hash,
        ledger: result.ledger,
        network: NETWORK,
        submittedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    err.status = 502;
    err.expose = true;
    return next(err);
  }
});

app.get('/payments', async (req, res, next) => {
  try {
    const { account } = req.query;
    if (!account) {
      const err = new Error('query param account requerido');
      err.status = 400;
      err.expose = true;
      throw err;
    }
    const operations = await horizon.operations().forAccount(String(account)).order('desc').limit(20).call();
    return res.json({
      data: operations.records.map((record) => ({
        id: record.id,
        type: record.type,
        createdAt: record.created_at,
      })),
    });
  } catch (err) {
    err.status = 502;
    err.expose = true;
    return next(err);
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  return res.status(err.status || 500).json({
    error: { code: 'STELLAR_CONNECTOR_ERROR', message: err.expose ? err.message : 'Error interno del conector' },
  });
});

const port = Number(process.env.PORT || 4601);
app.listen(port, () => {
  console.log(`[stellar-connector] listo en puerto ${port} | ${NETWORK} | horizon: ${HORIZON_URL}`);
});
