const router = require('express').Router();

module.exports = (db) => {

  router.post('/register', async (req, res) => {
    try {
      const { name, phone, cpf } = req.body;

      const { rows } = await db.query(
        `INSERT INTO profiles (name, phone, cpf)
         VALUES ($1, $2, $3)
         ON CONFLICT (phone) DO UPDATE SET name=$1, cpf=$3
         RETURNING id, name, phone, cpf`,
        [name, phone, cpf || null]
      );
      res.json(rows[0]);
    } catch (e) {
      // Erro de CPF duplicado
      if (e.code === '23505' && e.constraint && e.constraint.includes('cpf')) {
        return res.status(409).json({ error: 'Este CPF já está cadastrado.' });
      }
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/:id/token', async (req, res) => {
    try {
      const { fcmToken, lat, lng } = req.body;

      if (lat && lng) {
        await db.query(
          'UPDATE profiles SET fcm_token=$1, last_location=ST_SetSRID(ST_MakePoint($2,$3),4326) WHERE id=$4',
          [fcmToken, lng, lat, req.params.id]
        );
      } else {
        await db.query(
          'UPDATE profiles SET fcm_token=$1 WHERE id=$2',
          [fcmToken, req.params.id]
        );
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
