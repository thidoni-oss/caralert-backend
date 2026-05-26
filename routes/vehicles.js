const router = require('express').Router();

module.exports = (db) => {

  router.post('/', async (req, res) => {
    try {
      const { plate, model, color, recompensa, chavePix } = req.body;

      // Trava de duplicidade — mesma placa, mesmo dia, raio de 5km
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
        `INSERT INTO vehicles (plate, model, color, user_id)
         VALUES ($1, $2, $3, (SELECT id FROM profiles LIMIT 1))
         RETURNING id, plate, model, color,
         (SELECT id FROM profiles LIMIT 1) as "userId"`,
        [plate.toUpperCase().trim(), model.trim(), color.trim()]
      );

      const veiculo = rows[0];

      // Salva recompensa e chave PIX se informadas
      if (recompensa && chavePix) {
        await db.query(
          `UPDATE vehicles SET
             recompensa = $1,
             chave_pix = $2
           WHERE id = $3`,
          [recompensa, chavePix, veiculo.id]
        );
        veiculo.recompensa = recompensa;
        veiculo.chavePix = chavePix;
      }

      res.json(veiculo);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
