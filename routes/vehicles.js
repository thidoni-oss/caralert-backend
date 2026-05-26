const router = require('express').Router();

module.exports = (db) => {

  router.post('/', async (req, res) => {
    try {
      const { plate, model, color, recompensa } = req.body;
      const placaUpper = plate.toUpperCase().trim();

      // Trava de duplicidade
      const duplicado = await db.query(
        `SELECT a.id FROM alerts a
         JOIN vehicles v ON v.id = a.vehicle_id
         WHERE v.plate = $1
           AND DATE(a.created_at) = CURRENT_DATE
           AND a.status = 'active'`,
        [placaUpper]
      );

      if (duplicado.rows.length > 0) {
        return res.status(409).json({
          error: 'duplicado',
          message: 'Voce ja cadastrou este veiculo hoje. Aguarde avistamentos ou cancele o alerta anterior.'
        });
      }

      // Busca um profile para vincular
      const perfil = await db.query('SELECT id FROM profiles LIMIT 1');
      const perfilId = perfil.rows.length > 0 ? perfil.rows[0].id : null;

      // Insere o veículo
      const resultado = await db.query(
        `INSERT INTO vehicles (plate, model, color, user_id, recompensa)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, plate, model, color, recompensa`,
        [placaUpper, model.trim(), color.trim(), perfilId, recompensa || null]
      );

      const veiculo = resultado.rows[0];
      veiculo.userId = perfilId;

      res.json(veiculo);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
