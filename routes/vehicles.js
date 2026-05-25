const router = require('express').Router();

module.exports = (db) => {

  router.post('/', async (req, res) => {
    try {
      const { plate, model, color } = req.body;
      const { rows } = await db.query(
        `INSERT INTO vehicles (plate, model, color, user_id)
         VALUES ($1, $2, $3, (SELECT id FROM profiles LIMIT 1))
         RETURNING id, plate, model, color,
         (SELECT id FROM profiles LIMIT 1) as "userId"`,
        [plate, model, color]
      );
      res.json(rows[0]);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
