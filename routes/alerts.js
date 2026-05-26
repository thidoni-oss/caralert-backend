const router = require('express').Router();

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

  // Testemunha reporta avistamento com chave PIX
  router.post('/:id/sighting', async (req, res) => {
    try {
      const { reporterId, lat, lng, chavePix } = req.body;
      const alertId = req.params.id;

      await db.query(
        `INSERT INTO sightings (alert_id, reporter_id, location, chave_pix_testemunha)
         VALUES ($1,$2,ST_SetSRID(ST_MakePoint($3,$4),4326),$5)`,
        [alertId, reporterId, lng, lat, chavePix || null]
      );

      await db.query(
        `UPDATE alerts
         SET last_seen_location = ST_SetSRID(ST_MakePoint($1,$2),4326),
             updated_at = NOW()
         WHERE id = $3`,
        [lng, lat, alertId]
      );

      io.emit('new_sighting', { alertId, lat, lng });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Busca alertas ativos com dados de recompensa
  router.get('/active', async (req, res) => {
    try {
      const { lat, lng } = req.query;
      const { rows } = await db.query(
        `SELECT a.id, v.plate, v.model, v.color, v.recompensa,
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

  // Dono confirma que encontrou o carro
  router.post('/:id/confirmar', async (req, res) => {
    try {
      const alertId = req.params.id;

      // Busca última testemunha com chave PIX
      const { rows: sightings } = await db.query(
        `SELECT chave_pix_testemunha FROM sightings
         WHERE alert_id = $1
           AND chave_pix_testemunha IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
        [alertId]
      );

      // Marca alerta como encontrado
      await db.query(
        `UPDATE alerts SET status = 'found', updated_at = NOW() WHERE id = $1`,
        [alertId]
      );

      const chavePix = sightings[0]?.chave_pix_testemunha || null;
      res.json({ success: true, chavePix });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
