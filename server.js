require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const { Pool } = require('pg');
const { processarFila } = require('./routes/emails');
const { adicionarNaFila } = require('./routes/emails');
const admin = require('firebase-admin');

// Inicializa o Firebase com a chave de serviço salva no Railway
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
console.log('Firebase Admin inicializado!');

// Exporta o admin para outros arquivos poderem usar
module.exports.firebaseAdmin = admin;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

db.query('SELECT 1')
  .then(() => console.log('Banco de dados conectado!'))
  .catch(err => console.error('Erro no banco:', err.message));

app.get('/', (req, res) => {
  res.json({ status: 'AvisaAI backend online!' });
});

app.use('/api/alerts', require('./routes/alerts')(db, io, admin));
app.use('/api/users', require('./routes/users')(db));
app.use('/api/vehicles', require('./routes/vehicles')(db));
app.use('/api/pagamentos', require('./routes/pagamentos')(db));
app.use('/api/admin', require('./routes/admin')(db));

const agendarEmails = () => {
  const verificarAlertasVencidos = async () => {
    try {
      const { rows } = await db.query(`
        SELECT a.id, a.created_at, a.numero_bo,
               v.plate, v.model, v.color, v.recompensa
        FROM alerts a
        JOIN vehicles v ON v.id = a.vehicle_id
        WHERE a.status = 'active'
          AND a.created_at <= NOW() - INTERVAL '5 days'
      `);

      for (const alerta of rows) {
        const diasAtivo = Math.floor(
          (new Date() - new Date(alerta.created_at)) / (1000 * 60 * 60 * 24)
        );

        if (diasAtivo >= 10) {
          await db.query(
            `UPDATE alerts SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
            [alerta.id]
          );
          await adicionarNaFila(db, 'devolucao', {
            alertId: alerta.id,
            placa: alerta.plate,
            modelo: alerta.model,
            cor: alerta.color,
            recompensa: alerta.recompensa,
            motivo: `Alerta encerrado automaticamente no dia ${diasAtivo} sem resposta do dono`
          });
          console.log(`Alerta ${alerta.id} encerrado automaticamente no dia ${diasAtivo}`);
        } else if (diasAtivo >= 6) {
          await adicionarNaFila(db, 'aviso_vencimento', {
            alertId: alerta.id,
            placa: alerta.plate,
            modelo: alerta.model,
            cor: alerta.color,
            recompensa: alerta.recompensa,
            diasAtivo,
            motivo: `Alerta sem resposta — dia ${diasAtivo} de 10`
          });
          console.log(`Aviso enviado para alerta ${alerta.id} — dia ${diasAtivo}`);
        }
      }
    } catch (e) {
      console.error('Erro verificarAlertasVencidos:', e.message);
    }
  };

  const agendarVerificacaoDiaria = () => {
    const agora = new Date();
    const proximo = new Date();
    proximo.setHours(9, 0, 0, 0);
    if (proximo <= agora) proximo.setDate(proximo.getDate() + 1);
    const diff = proximo - agora;
    setTimeout(() => {
      verificarAlertasVencidos();
      setInterval(verificarAlertasVencidos, 24 * 60 * 60 * 1000);
    }, diff);
    console.log(`Verificacao diaria agendada para ${proximo.toLocaleString('pt-BR')}`);
  };

  agendarVerificacaoDiaria();

  const agora = new Date();
  const horarios = [8, 14, 20];

  horarios.forEach(hora => {
    const proximo = new Date();
    proximo.setHours(hora, 0, 0, 0);
    if (proximo <= agora) proximo.setDate(proximo.getDate() + 1);

    const diff = proximo - agora;
    setTimeout(() => {
      processarFila(db).catch(console.error);
      setInterval(() => processarFila(db).catch(console.error), 24 * 60 * 60 * 1000);
    }, diff);

    console.log(`Email agendado para ${proximo.toLocaleString('pt-BR')}`);
  });
};

agendarEmails();

io.on('connection', (socket) => {
  socket.on('update_location', async ({ userId, lat, lng }) => {
    try {
      await db.query(
        `UPDATE profiles
         SET last_location = ST_SetSRID(ST_MakePoint($1,$2),4326)
         WHERE id = $3`,
        [lng, lat, userId]
      );
      socket.join('user:' + userId);
    } catch (e) {
      console.error(e.message);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('AvisaAI rodando na porta ' + PORT);
});
