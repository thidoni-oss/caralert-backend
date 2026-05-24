const router = require('express').Router();

module.exports = (db) => {

  router.post('/register', async (req, res) => {
    try {
      const { name, phone } = req.body;
      const { rows } = await db.query(
        `INSERT INTO profiles (name, phone)
         VALUES ($1, $2)
         ON CONFLICT (phone) DO UPDATE SET name=$1
         RETURNING id, name, phone`,
        [name, phone]
      );
      res.json(rows[0]);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/:id/token', async (req, res) => {
    try {
      const { fcmToken } = req.body;
      await db.query(
        'UPDATE profiles SET fcm_token=$1 WHERE id=$2',
        [fcmToken, req.params.id]
      );
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
