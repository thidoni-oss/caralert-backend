const router = require('express').Router();
const { adicionarNaFila } = require('./emails');

module.exports = (db, io, admin) => {

  // Função auxiliar: envia push para o dono do alerta via Expo
  const enviarPushParaDono = async (alertId, titulo, corpo) => {
    try {
      const { rows } = await db.query(
        `SELECT p.fcm_token
         FROM alerts a
         JOIN profiles p ON p.id = a.owner_id
         WHERE a.id = $1 AND p.fcm_token IS NOT NULL`,
        [alertId]
      );
      if (rows.length === 0) return;
      const token = rows[0].fcm_token;
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ to: token, title: titulo, body: corpo, sound: 'default', priority: 'high' })
      });
      console.log(`Push enviado para alerta ${alertId}`);
    } catch (e) {
      console.error('Erro ao enviar push:', e.message);
    }
  };

  // Cria o alerta — se tiver recompensa, gera PIX do caucao primeiro
  router.post('/', async (req, res) => {
    try {
      const { vehicleId, ownerId, lat, lng } = req.body;

      // Verifica se o veiculo tem recompensa
      const veiculo = await db.query(`SELECT recompensa FROM vehicles WHERE id = $1`, [vehicleId]);
      const recompensa = veiculo.rows[0]?.recompensa;
      const temRecompensa = recompensa && parseFloat(recompensa) > 0;

      // Sem recompensa = alerta ativo direto, sem cobranca
      const statusInicial = temRecompensa ? 'pending' : 'active';

      const { rows } = await db.query(
        `INSERT INTO alerts (vehicle_id, owner_id, origin_location, last_seen_location, status)
         VALUES ($1,$2, ST_SetSRID(ST_MakePoint($3,$4),4326), ST_SetSRID(ST_MakePoint($3,$4),4326), $5)
         RETURNING *`,
        [vehicleId, ownerId, lng, lat, statusInicial]
      );
      const alerta = rows[0];

      if (!temRecompensa) {
        return res.json({ success: true, alertId: alerta.id, precisaPagar: false });
      }

      // Tem recompensa — gera PIX do caucao (recompensa x 1,01)
      const valorCaucao = (parseFloat(recompensa) * 1.01).toFixed(2);
      const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN,
          'X-Idempotency-Key': alerta.id + '-caucao'
        },
        body: JSON.stringify({
          transaction_amount: parseFloat(valorCaucao),
          description: 'Caucao AvisaAI — ' + alerta.id,
          payment_method_id: 'pix',
          payer: { email: 'pagador@avisaai.com.br' },
          date_of_expiration: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        })
      });

      const mpData = await mpRes.json();

      if (!mpRes.ok) {
        // Se o MP falhou, ativa o alerta mesmo assim
        await db.query(`UPDATE alerts SET status = 'active' WHERE id = $1`, [alerta.id]);
        return res.json({ success: true, alertId: alerta.id, precisaPagar: false });
      }

      await db.query(
        `UPDATE alerts SET caucao_payment_id = $1 WHERE id = $2`,
        [String(mpData.id), alerta.id]
      );

      res.json({
        success: true,
        alertId: alerta.id,
        precisaPagar: true,
        valorCaucao,
        recompensa,
        paymentId: mpData.id,
        qr_code: mpData.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: mpData.point_of_interaction?.transaction_data?.qr_code_base64
      });

    } catch (e) {
      console.error('Erro ao criar alerta:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // O app consulta esta rota a cada 5s para saber se o pagamento foi confirmado
  router.get('/:id/status-pagamento', async (req, res) => {
    try {
      const alertId = req.params.id;
      const { rows } = await db.query(
        `SELECT caucao_payment_id, caucao_status, status FROM alerts WHERE id = $1`, [alertId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Alerta nao encontrado' });

      const alerta = rows[0];

      if (alerta.status === 'active') return res.json({ pago: true, status: 'active' });
      if (!alerta.caucao_payment_id) return res.json({ pago: false, status: 'pending' });

      // Consulta o Mercado Pago
      const mpRes = await fetch(
        'https://api.mercadopago.com/v1/payments/' + alerta.caucao_payment_id,
        { headers: { 'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN } }
      );
      const mpData = await mpRes.json();

      if (mpData.status === 'approved') {
        await db.query(
          `UPDATE alerts SET status = 'active', caucao_status = 'paid' WHERE id = $1`, [alertId]
        );
        return res.json({ pago: true, status: 'active' });
      }

      res.json({ pago: false, status: mpData.status });
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
        `UPDATE alerts SET last_seen_location = ST_SetSRID(ST_MakePoint($1,$2),4326), updated_at = NOW() WHERE id = $3`,
        [lng, lat, alertId]
      );

      io.emit('new_sighting', { alertId, lat, lng });

      const alertInfo = await db.query(
        `SELECT v.plate, v.model, v.color, v.recompensa
         FROM alerts a JOIN vehicles v ON v.id = a.vehicle_id
         WHERE a.id = $1`, [alertId]
      );

      if (alertInfo.rows.length > 0) {
        const v = alertInfo.rows[0];
        await enviarPushParaDono(
          alertId,
          'Seu veiculo foi avistado!',
          `${v.plate} — ${v.color} ${v.model} foi visto proximo a voce. Toque para ver no mapa.`
        );
        if (chavePix) {
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
         WHERE s.alert_id = $1 AND s.chave_pix_testemunha IS NOT NULL
         ORDER BY s.created_at DESC LIMIT 1`,
        [alertId]
      );

      await db.query(`UPDATE alerts SET status = 'found', updated_at = NOW() WHERE id = $1`, [alertId]);

      if (rows.length === 0) return res.json({ success: true, chavePix: null, recompensa: null });

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
                ST_X(s.location) as lng, ST_Y(s.location) as lat
         FROM sightings s WHERE s.alert_id = $1 ORDER BY s.created_at DESC`,
        [alertId]
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:id/decisao5dias', async (req, res) => {
    try {
      const alertId = req.params.id;
      const { numeroBo, decisao } = req.body;
      if (!numeroBo) return res.status(400).json({ error: 'Numero do B.O. obrigatorio' });
      if (decisao === 'desistir') {
        await db.query(
          `UPDATE alerts SET status = 'cancelled', numero_bo = $1, data_decisao_5dias = NOW() WHERE id = $2`,
          [numeroBo, alertId]
        );
        await adicionarNaFila(db, 'devolucao', { alertId, numeroBo, motivo: 'Dono desistiu das buscas no dia 5' });
      } else {
        await db.query(`UPDATE alerts SET numero_bo = $1, data_decisao_5dias = NOW() WHERE id = $2`, [numeroBo, alertId]);
      }
      res.json({ success: true, decisao });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
