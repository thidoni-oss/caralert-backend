const router = require('express').Router();
const { adicionarNaFila } = require('./emails');

module.exports = (db, io) => {

  router.post('/', async (req, res) => {
    try {
      const { vehicleId, ownerId, lat, lng } = req.body;
      const { rows } = await db.query(
        `INSERT INTO alerts
           (vehicle_id, owner_id, origin_location, last_seen_location)
         VALUES ($1,$2,
           ST_SetSRID(ST_MakePoint($3,$4),4326),
           ST_SetSRID(ST_MakePoint($3,$4),4326))
         RETURNING *`,
        [vehicleId, ownerId, lng, lat]
      );
      res.json({ success: true, alertId: rows[0].id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:id/sighting', async (req, res) => {
    try {
      const { reporterId, lat, lng, chavePix } = req.body;
      const alertId = req.params.id;

      await db.query(
        `INSERT INTO sightings (alert_id, location, chave_pix_testemunha)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2,$3),4326), $4)`,
        [alertId, lng, lat, chavePix || null]
      );

      await db.query(
        `UPDATE alerts
         SET last_seen_location = ST_SetSRID(ST_MakePoint($1,$2),4326),
             updated_at = NOW()
         WHERE id = $3`,
        [lng, lat, alertId]
      );

      io.emit('new_sighting', { alertId, lat, lng });

      const alertInfo = await db.query(
        `SELECT v.plate, v.model, v.color, v.recompensa
         FROM alerts a JOIN vehicles v ON v.id = a.vehicle_id
         WHERE a.id = $1`, [alertId]
      );

      if (alertInfo.rows.length > 0 && chavePix) {
        const v = alertInfo.rows[0];
        adicionarNaFila(db, 'testemunha', {
          placa: v.plate, modelo: v.model, cor: v.color,
          recompensa: v.recompensa, chavePix, lat, lng, alertId
      }).catch(console.error);

        setTimeout(async () => {
          const ainda = await db.query(
            `SELECT v.plate, v.model, v.color, v.recompensa
             FROM alerts a JOIN vehicles v ON v.id = a.vehicle_id
             WHERE a.id = $1 AND a.status = 'active'`, [alertId]
          );
          
          if (ainda.rows.length > 0) {
            const v = ainda.rows[0];
          adicionarNaFila(db, 'devolucao', {
  placa: v.plate, modelo: v.model, cor: v.color,
  recompensa: v.recompensa, alertId
}).catch(console.error);
          }
        }, 5 * 24 * 60 * 60 * 1000);
      }

      res.json({ success: true });

    } catch (e) {
      console.error('ERRO SIGHTING:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/active', async (req, res) => {
    try {
      const { lat, lng } = req.query;
      const { rows } = await db.query(
        `SELECT a.id, v.plate, v.model, v.color, v.recompensa, v.tipo,
                ST_X(a.last_seen_location) as lng,
                ST_Y(a.last_seen_location) as lat,
                a.updated_at
         FROM alerts a
         JOIN vehicles v ON v.id = a.vehicle_id
         WHERE a.status = 'active'
           AND ST_DWithin(
             a.last_seen_location,
             ST_SetSRID(ST_MakePoint($1,$2),4326),
             0.045)
         ORDER BY a.updated_at DESC`,
        [lng, lat]
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:id/confirmar', async (req, res) => {
    try {
      const alertId = req.params.id;
      const { emailPagador } = req.body;

      const { rows } = await db.query(
        `SELECT s.chave_pix_testemunha, v.recompensa
         FROM sightings s
         JOIN alerts a ON a.id = s.alert_id
         JOIN vehicles v ON v.id = a.vehicle_id
         WHERE s.alert_id = $1
           AND s.chave_pix_testemunha IS NOT NULL
         ORDER BY s.created_at DESC LIMIT 1`,
        [alertId]
      );

      await db.query(
        `UPDATE alerts SET status = 'found', updated_at = NOW() WHERE id = $1`,
        [alertId]
      );

      if (rows.length === 0) {
        return res.json({ success: true, chavePix: null, recompensa: null });
      }

      const { chave_pix_testemunha, recompensa } = rows[0];

      let pixData = null;
      if (recompensa && process.env.MP_ACCESS_TOKEN) {
        const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN,
            'X-Idempotency-Key': alertId + '-recompensa'
          },
          body: JSON.stringify({
            transaction_amount: parseFloat(recompensa) * 1.01,
            description: 'Recompensa AvisaAI',
            payment_method_id: 'pix',
            payer: { email: emailPagador || 'pagador@avisaai.com.br' }
          })
        });
        const mpData = await mpRes.json();
        if (mpRes.ok) {
          pixData = {
            qr_code: mpData.point_of_interaction?.transaction_data?.qr_code,
            qr_code_base64: mpData.point_of_interaction?.transaction_data?.qr_code_base64,
            paymentId: mpData.id
          };
        }
      }

      res.json({
        success: true,
        chavePix: chave_pix_testemunha,
        recompensa: (parseFloat(recompensa) * 1.01).toFixed(2),
        pixData
      });

    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:id/avistamentos', async (req, res) => {
    try {
      const alertId = req.params.id;
      const { rows } = await db.query(
        `SELECT s.id, s.chave_pix_testemunha, s.foto_url, s.created_at,
                ST_X(s.location) as lng,
                ST_Y(s.location) as lat
         FROM sightings s
         WHERE s.alert_id = $1
         ORDER BY s.created_at DESC`,
        [alertId]
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
