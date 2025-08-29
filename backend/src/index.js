import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { PORT, CORS_ALLOWLIST } from './config.js';
import checkRoute from './routes/check.js';
import stopsRoute from './routes/stops.js';

const app = express();

// Security / parsing
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(express.json());
app.use(morgan('combined'));

// CORS: allow local dev and your Vercel domain(s)
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // allow curl / same-origin
    if (CORS_ALLOWLIST.includes(origin)) return cb(null, true);
    cb(new Error('CORS not allowed for this origin'));
  },
  credentials: false
};
app.use(cors(corsOptions));

// Rate-limit the API
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 120
}));

// Routes
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/check', checkRoute);
app.use('/api/stops', stopsRoute);

// Start
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});

