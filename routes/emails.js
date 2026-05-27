const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_ADMIN = 'thi.doni@gmail.com';

const enviarEmailTestemunha = async ({ placa, modelo, cor, recompensa, chavePix, lat, lng, alertId }) => {
  await resend.emails.send({
    from: 'AvisaAI <onboarding@resend.dev>',
    to: EMAIL_ADMIN,
    subject: '🚨 Veículo avistado — pagamento pendente',
    html: `
      <h2>Veículo avistado!</h2>
      <p><strong>Veículo:</strong> ${placa} — ${cor} ${modelo}</p>
      <p><strong>Recompensa:</strong> R$ ${recompensa}</p>
      <p><strong>Chave PIX da testemunha:</strong> ${chavePix}</p>
      <p><strong>Localização:</strong> ${lat}, ${lng}</p>
      <p><strong>ID do alerta:</strong> ${alertId}</p>
      <hr/>
      <p>Faça o PIX de R$ ${recompensa} para a chave acima assim que possível.</p>
    `
  });
};

const enviarEmailDevolucao = async ({ placa, modelo, cor, recompensa, alertId, donoEmail }) => {
  await resend.emails.send({
    from: 'AvisaAI <onboarding@resend.dev>',
    to: EMAIL_ADMIN,
    subject: '⏰ Caução a devolver — 5 dias expirados',
    html: `
      <h2>Prazo de 5 dias expirado</h2>
      <p><strong>Veículo:</strong> ${placa} — ${cor} ${modelo}</p>
      <p><strong>Valor do caução:</strong> R$ ${recompensa}</p>
      <p><strong>ID do alerta:</strong> ${alertId}</p>
      <hr/>
      <p>O dono não encontrou o veículo em 5 dias. Devolva o caução de R$ ${recompensa} via PIX.</p>
    `
  });
};

module.exports = { enviarEmailTestemunha, enviarEmailDevolucao };
