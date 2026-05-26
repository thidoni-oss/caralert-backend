const router = require('express').Router();

module.exports = (db) => {

  router.post('/pix', async (req, res) => {
    try {
      const { alertId, valor, emailPagador } = req.body;

      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN,
          'X-Idempotency-Key': alertId
        },
        body: JSON.stringify({
          transaction_amount: parseFloat(valor),
          description: 'Recompensa AvisaAI - Alerta ' + alertId,
          payment_method_id: 'pix',
          payer: {
            email: emailPagador || 'pagador@avisaai.com.br'
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(400).json({ error: data.message || 'Erro ao gerar PIX' });
      }

      res.json({
        id: data.id,
        status: data.status,
        qr_code: data.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: data.point_of_interaction?.transaction_data?.qr_code_base64,
        valor: data.transaction_amount
      });

    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/status/:paymentId', async (req, res) => {
    try {
      const response = await fetch(
        'https://api.mercadopago.com/v1/payments/' + req.params.paymentId,
        {
          headers: {
            'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN
          }
        }
      );
      const data = await response.json();
      res.json({ status: data.status, id: data.id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
