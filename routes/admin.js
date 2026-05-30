const router = require('express').Router();

module.exports = (db) => {

  router.get('/stats', async (req, res) => {
    try {
      // Senha de acesso ao painel admin
      const { senha } = req.query;
      if (senha !== 'AvisaAI@3036#') {
        return res.status(401).json({ error: 'Acesso negado' });
      }

      // Total de usuarios
      const { rows: usuarios } = await db.query(
        `SELECT COUNT(*) as total FROM profiles`
      );

      // Alertas por status
      const { rows: alertas } = await db.query(
        `SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as ativos,
          COUNT(*) FILTER (WHERE status = 'found') as encontrados,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelados,
          COUNT(*) FILTER (WHERE status = 'pending') as pendentes
         FROM alerts`
      );

      // Total de avistamentos
      const { rows: avistamentos } = await db.query(
        `SELECT COUNT(*) as total FROM sightings`
      );

      // Total em recompensas
      const { rows: recompensas } = await db.query(
        `SELECT 
          COALESCE(SUM(recompensa), 0) as total_cadastrado,
          COALESCE(SUM(recompensa) FILTER (WHERE status = 'active'), 0) as em_caucao,
          COALESCE(SUM(recompensa) FILTER (WHERE status = 'found'), 0) as recompensas_pagas
         FROM alerts a
         JOIN vehicles v ON v.id = a.vehicle_id
         WHERE v.recompensa IS NOT NULL`
      );

      // Receita da taxa de 1%
      const { rows: receita } = await db.query(
        `SELECT 
          COALESCE(SUM(v.recompensa * 0.01), 0) as taxa_total
         FROM alerts a
         JOIN vehicles v ON v.id = a.vehicle_id
         WHERE a.caucao_status = 'paid'`
      );

      // Ultimos 10 alertas com detalhes
      const { rows: ultimosAlertas } = await db.query(
        `SELECT 
          a.id, a.status, a.created_at,
          v.plate, v.model, v.color, v.recompensa, v.tipo,
          p.name as owner_name, p.phone as owner_phone,
          (SELECT COUNT(*) FROM sightings s WHERE s.alert_id = a.id) as total_avistamentos
         FROM alerts a
         JOIN vehicles v ON v.id = a.vehicle_id
         JOIN profiles p ON p.id = a.owner_id
         ORDER BY a.created_at DESC
         LIMIT 10`
      );

      // Crescimento: novos usuarios nos ultimos 7 dias
      const { rows: crescimento } = await db.query(
        `SELECT 
          DATE(created_at) as dia,
          COUNT(*) as novos_usuarios
         FROM profiles
         WHERE created_at >= NOW() - INTERVAL '7 days'
         GROUP BY DATE(created_at)
         ORDER BY dia ASC`
      );

      res.json({
        usuarios: parseInt(usuarios[0].total),
        alertas: {
          total: parseInt(alertas[0].total),
          ativos: parseInt(alertas[0].ativos),
          encontrados: parseInt(alertas[0].encontrados),
          cancelados: parseInt(alertas[0].cancelados),
          pendentes: parseInt(alertas[0].pendentes),
        },
        avistamentos: parseInt(avistamentos[0].total),
        recompensas: {
          total_cadastrado: parseFloat(recompensas[0].total_cadastrado),
          em_caucao: parseFloat(recompensas[0].em_caucao),
          recompensas_pagas: parseFloat(recompensas[0].recompensas_pagas),
        },
        receita: {
          taxa_total: parseFloat(receita[0].taxa_total),
        },
        ultimosAlertas,
        crescimento,
        geradoEm: new Date().toLocaleString('pt-BR')
      });

    } catch (e) {
      console.error('Erro admin stats:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
