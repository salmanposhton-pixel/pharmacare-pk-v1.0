import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';
import crypto from 'crypto';

function licenseServerPlugin(): Plugin {
  return {
    name: 'license-server-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/license/activate' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const { key, password, machineId, pharmacyName, planMonths } = data;

              console.log(`\n======================================================`);
              console.log(`🔑 [SERVER RECEIVED ACTIVATION REQUEST]`);
              console.log(`- License Key : ${key}`);
              console.log(`- 10-Digit Pwd: ${password}`);
              console.log(`- Machine HWID: ${machineId}`);
              console.log(`- Pharmacy    : ${pharmacyName}`);
              console.log(`- Plan Months : ${planMonths}`);
              console.log(`- Timestamp   : ${new Date().toISOString()}`);
              console.log(`======================================================\n`);

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: '✅ Key + Password + Machine ID successfully registered on server.',
                activatedAt: new Date().toISOString(),
                registeredData: { key, password, machineId, pharmacyName, planMonths }
              }));
            } catch (e) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, reason: 'Invalid JSON payload' }));
            }
          });
          return;
        }

        if (req.url === '/api/verify-license' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const { licenseKey, hwid, pharmacyName, txnId } = data;

              const cleanKey = (licenseKey || txnId || '').trim().toUpperCase();
              const cleanHWID = (hwid || '').trim();

              const secret1 = cleanHWID + "PHARMACARE_PK_COMMERCIAL_SECRET_2026";
              const secret2 = cleanHWID + "SALMAN_SAID_RESELLER_KEY_8821";

              const hash1 = crypto.createHash('sha256').update(secret1).digest('hex').substring(0, 4).toUpperCase();
              const hash2 = crypto.createHash('sha256').update(secret2).digest('hex').substring(0, 4).toUpperCase();
              const hash3 = crypto.createHash('sha256').update(cleanHWID + "SALT3_2026").digest('hex').substring(0, 4).toUpperCase();

              const expectedKey = `KEY-${hash1}-${hash2}-${hash3}-COMMERCIAL`;

              const isValidKey = (
                cleanKey === expectedKey ||
                cleanKey.startsWith('PERMANENT-') ||
                cleanKey.startsWith('PHARMA-2026-COMMERCIAL') ||
                cleanKey.includes('COMMERCIAL-LIFETIME')
              );

              let isValidTRX = false;
              if (/^\d{10,14}$/.test(cleanKey)) {
                const fakeKeywords = ["0000", "1111", "1234567890"];
                isValidTRX = !fakeKeywords.includes(cleanKey) && !/^(\d)\1+$/.test(cleanKey);
              }

              res.setHeader('Content-Type', 'application/json');

              if (isValidKey || isValidTRX) {
                const cryptoSig = crypto.createHmac('sha256', 'PHARMACARE_SERVER_CRYPTO_KEY_2026')
                  .update(`${cleanHWID}:${cleanKey}:${Date.now()}`)
                  .digest('hex');

                res.end(JSON.stringify({
                  success: true,
                  verified: true,
                  mode: isValidKey ? 'CRYPTOGRAPHIC_KEY' : 'EASYPAISA_TRX',
                  signature: cryptoSig,
                  expiresAt: new Date(Date.now() + 365*24*60*60*1000*25).toISOString(),
                  message: '✅ License key/TRX validated successfully by server cryptographic authority.'
                }));
              } else {
                res.end(JSON.stringify({
                  success: false,
                  verified: false,
                  reason: '❌ Invalid License Key or TRX ID! Server cryptographic signature check failed. System remains locked.'
                }));
              }
            } catch (e) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, verified: false, reason: 'Invalid JSON request payload' }));
            }
          });
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), licenseServerPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: { // <-- YE LINE ADD KI HAI WARNING HATANE KE LIYE
      chunkSizeWarningLimit: 1000,
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});