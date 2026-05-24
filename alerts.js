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

  router.post('/:id/sighting', async (req, res) => {
    try {
      const { reporterId, lat, lng } = req.body;
      const alertId = req.params.id;
      await db.query(
        `INSERT INTO sightings (alert_id, reporter_id, location)
         VALUES ($1,$2,ST_SetSRID(ST_MakePoint($3,$4),4326))`,
        [alertId, reporterId, lng, lat]
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

  router.get('/active', async (req, res) => {
    try {
      const { lat, lng } = req.query;
      const { rows } = await db.query(
        `SELECT a.id, v.plate, v.model, v.color,
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

  return router;
};