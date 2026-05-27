require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const { Pool } = require('pg');
const { processarFila } = require('./routes/emails');

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
  res.json({ status: 'CarAlert backend online!' });
});

app.use('/api/alerts', require('./routes/alerts')(db, io));
app.use('/api/users', require('./routes/users')(db));
app.use('/api/vehicles', require('./routes/vehicles')(db));
app.use('/api/pagamentos', require('./routes/pagamentos')(db));
app.use('/api/pagamentos', require('./routes/pagamentos')(db));

const agendarEmails = () => {
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
    } catch(e) {
      console.error(e.message);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('CarAlert rodando na porta ' + PORT);
});
