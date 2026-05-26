const router = require('express').Router();

module.exports = (db) => {

  router.post('/', async (req, res) => {
    try {
      const { plate, model, color, recompensa } = req.body;

      // Trava de duplicidade
      const { rows: existentes } = await db.query(
        `SELECT id FROM alerts a
         JOIN vehicles v ON v.id = a.vehicle_id
         WHERE v.plate = $1
           AND DATE(a.created_at) = CURRENT_DATE
           AND a.status = 'active'`,
        [plate.toUpperCase()]
      );

      if (existentes.length > 0) {
        return res.status(409).json({
          error: 'duplicado',
          message: 'Voce ja cadastrou este veiculo hoje. Aguarde avistamentos ou cancele o alerta anterior.'
        });
      }

      const { rows } = await db.query(
        `INSERT INTO vehicles (plate, model, color, user_id, recompensa)
 VALUES ($1, $2, $3, (SELECT id FROM profiles LIMIT 1), $4)
 RETURNING vehicles.id, vehicles.plate, vehicles.model, vehicles.color, vehicles.recompensa,
 (SELECT id FROM profiles LIMIT 1) as "userId"`,
        [plate.toUpperCase().trim(), model.trim(), color.trim(), recompensa || null]
      );

      res.json(rows[0]);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
