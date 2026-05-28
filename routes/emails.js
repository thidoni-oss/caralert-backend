const { Resend } = require('resend');
const ExcelJS = require('exceljs');
const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_ADMIN = 'thi.doni@gmail.com';

const adicionarNaFila = async (db, tipo, dados) => {
  await db.query(
    `INSERT INTO email_queue (tipo, dados) VALUES ($1, $2)`,
    [tipo, JSON.stringify(dados)]
  );
};

const gerarExcel = async (recompensas, devolucoes) => {
  const workbook = new ExcelJS.Workbook();

  const abaRecompensas = workbook.addWorksheet('Pagamentos Recompensa');
  abaRecompensas.columns = [
    { header: 'Placa', key: 'placa', width: 12 },
    { header: 'Veiculo', key: 'veiculo', width: 25 },
    { header: 'Recompensa (R$)', key: 'recompensa', width: 18 },
    { header: 'Chave PIX Testemunha', key: 'chavePix', width: 30 },
    { header: 'Localizacao', key: 'localizacao', width: 25 },
    { header: 'ID do Alerta', key: 'alertId', width: 38 },
    { header: 'Data', key: 'data', width: 20 },
  ];
  abaRecompensas.getRow(1).font = { bold: true };
  recompensas.forEach(r => {
    const d = r.dados;
    abaRecompensas.addRow({
      placa: d.placa,
      veiculo: `${d.cor} ${d.modelo}`,
      recompensa: d.recompensa,
      chavePix: d.chavePix,
      localizacao: `${d.lat}, ${d.lng}`,
      alertId: d.alertId,
      data: new Date(r.criado_em).toLocaleString('pt-BR'),
    });
  });

  const abaDevolucoes = workbook.addWorksheet('Devolucoes Caucao');
  abaDevolucoes.columns = [
    { header: 'Placa', key: 'placa', width: 12 },
    { header: 'Veiculo', key: 'veiculo', width: 25 },
    { header: 'Valor a Devolver (R$)', key: 'recompensa', width: 22 },
    { header: 'ID do Alerta', key: 'alertId', width: 38 },
    { header: 'Data', key: 'data', width: 20 },
  ];
  abaDevolucoes.getRow(1).font = { bold: true };
  devolucoes.forEach(r => {
    const d = r.dados;
    abaDevolucoes.addRow({
      placa: d.placa,
      veiculo: `${d.cor} ${d.modelo}`,
      recompensa: d.recompensa,
      alertId: d.alertId,
      data: new Date(r.criado_em).toLocaleString('pt-BR'),
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer.toString('base64');
};

const processarFila = async (db) => {
  const { rows } = await db.query(
    `SELECT * FROM email_queue WHERE enviado = FALSE ORDER BY criado_em ASC`
  );
  if (rows.length === 0) return;

  const recompensas = rows.filter(r => r.tipo === 'testemunha');
  const devolucoes = rows.filter(r => r.tipo === 'devolucao');
  const avisos = rows.filter(r => r.tipo === 'aviso_vencimento');

  let html = `<h2>Resumo AvisaAI — ${new Date().toLocaleString('pt-BR')}</h2>`;

  if (recompensas.length > 0) {
    html += `<h3>Recompensas pendentes (${recompensas.length})</h3>`;
    recompensas.forEach(r => {
      const d = r.dados;
      html += `
        <div style="border:1px solid #ddd;padding:12px;margin:8px 0;border-radius:8px">
          <p><strong>Veiculo:</strong> ${d.placa} — ${d.cor} ${d.modelo}</p>
          <p><strong>Recompensa:</strong> R$ ${d.recompensa}</p>
          <p><strong>Chave PIX da testemunha:</strong> ${d.chavePix}</p>
          <p><strong>Localizacao:</strong> ${d.lat}, ${d.lng}</p>
          <p><strong>ID do alerta:</strong> ${d.alertId}</p>
        </div>`;
    });
  }

  if (devolucoes.length > 0) {
    html += `<h3>Devolucoes pendentes (${devolucoes.length})</h3>`;
    devolucoes.forEach(r => {
      const d = r.dados;
      html += `
        <div style="border:1px solid #ddd;padding:12px;margin:8px 0;border-radius:8px">
          <p><strong>Veiculo:</strong> ${d.placa} — ${d.cor} ${d.modelo}</p>
          <p><strong>Valor a devolver:</strong> R$ ${d.recompensa}</p>
          <p><strong>ID do alerta:</strong> ${d.alertId}</p>
          ${d.numeroBo ? `<p><strong>Numero B.O.:</strong> ${d.numeroBo}</p>` : ''}
          <p><strong>Motivo:</strong> ${d.motivo}</p>
        </div>`;
    });
  }

  if (avisos.length > 0) {
    html += `<h3>Alertas sem resposta (${avisos.length})</h3>`;
    avisos.forEach(r => {
      const d = r.dados;
      html += `
        <div style="border:1px solid #ddd;padding:12px;margin:8px 0;border-radius:8px;border-left:4px solid #FFA000">
          <p><strong>Veiculo:</strong> ${d.placa} — ${d.cor} ${d.modelo}</p>
          <p><strong>Dias ativo:</strong> ${d.diasAtivo} de 10</p>
          <p><strong>Recompensa em caucao:</strong> R$ ${d.recompensa}</p>
          <p><strong>ID do alerta:</strong> ${d.alertId}</p>
          <p><strong>Obs:</strong> ${d.motivo}</p>
        </div>`;
    });
  }

  const excelBase64 = await gerarExcel(recompensas, devolucoes);
  const dataHoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');

  await resend.emails.send({
    from: 'AvisaAI <onboarding@resend.dev>',
    to: EMAIL_ADMIN,
    subject: `AvisaAI — ${rows.length} item(s) pendente(s)`,
    html,
    attachments: [
      {
        filename: `AvisaAI_${dataHoje}.xlsx`,
        content: excelBase64,
      }
    ]
  });

  const ids = rows.map(r => r.id);
  await db.query(
    `UPDATE email_queue SET enviado = TRUE WHERE id = ANY($1)`,
    [ids]
  );

  console.log(`Email enviado com ${rows.length} item(s) e Excel anexado.`);
};

module.exports = { adicionarNaFila, processarFila };
