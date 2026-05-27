const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_ADMIN = 'thi.doni@gmail.com';

const adicionarNaFila = async (db, tipo, dados) => {
  await db.query(
    `INSERT INTO email_queue (tipo, dados) VALUES ($1, $2)`,
    [tipo, JSON.stringify(dados)]
  );
};

const processarFila = async (db) => {
  const { rows } = await db.query(
    `SELECT * FROM email_queue WHERE enviado = FALSE ORDER BY criado_em ASC`
  );
  if (rows.length === 0) return;

  const recompensas = rows.filter(r => r.tipo === 'testemunha');
  const devolucoes = rows.filter(r => r.tipo === 'devolucao');

  let html = `<h2>Resumo AvisaAI — ${new Date().toLocaleString('pt-BR')}</h2>`;

  if (recompensas.length > 0) {
    html += `<h3>🚨 Recompensas pendentes (${recompensas.length})</h3>`;
    recompensas.forEach(r => {
      const d = r.dados;
      html += `
        <div style="border:1px solid #ddd;padding:12px;margin:8px 0;border-radius:8px">
          <p><strong>Veículo:</strong> ${d.placa} — ${d.cor} ${d.modelo}</p>
          <p><strong>Recompensa:</strong> R$ ${d.recompensa}</p>
          <p><strong>Chave PIX da testemunha:</strong> ${d.chavePix}</p>
          <p><strong>Localização:</strong> ${d.lat}, ${d.lng}</p>
          <p><strong>ID do alerta:</strong> ${d.alertId}</p>
        </div>`;
    });
  }

  if (devolucoes.length > 0) {
    html += `<h3>⏰ Devoluções pendentes (${devolucoes.length})</h3>`;
    devolucoes.forEach(r => {
      const d = r.dados;
      html += `
        <div style="border:1px solid #ddd;padding:12px;margin:8px 0;border-radius:8px">
          <p><strong>Veículo:</strong> ${d.placa} — ${d.cor} ${d.modelo}</p>
          <p><strong>Valor a devolver:</strong> R$ ${d.recompensa}</p>
          <p><strong>ID do alerta:</strong> ${d.alertId}</p>
        </div>`;
    });
  }

  await resend.emails.send({
    from: 'AvisaAI <onboarding@resend.dev>',
    to: EMAIL_ADMIN,
    subject: `📋 AvisaAI — ${rows.length} item(s) pendente(s)`,
    html
  });

  const ids = rows.map(r => r.id);
  await db.query(
    `UPDATE email_queue SET enviado = TRUE WHERE id = ANY($1)`,
    [ids]
  );
};

module.exports = { adicionarNaFila, processarFila };
