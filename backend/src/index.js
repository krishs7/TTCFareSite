// backend/src/index.js
import { PORT } from './config.js';
import { app } from './app.js';

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});

