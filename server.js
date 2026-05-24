require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/', (req, res) => {
  res.json({ status: 'CarAlert backend online!' });
});

app.use('/api/alerts', require('./routes/alerts')(db, io));
app.use('/api/users', require('./routes/users')(db));

io.on('connection', (socket) => {
  socket.on('update_location', async ({ userId, lat, lng }) => {
    await db.query(
      `UPDATE profiles
       SET last_location = ST_SetSRID(ST_MakePoint($1,$2),4326)
       WHERE id = $3`,
      [lng, lat, userId]
    );
    socket.join(`user:${userId}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`CarAlert rodando na porta ${PORT}`);
});