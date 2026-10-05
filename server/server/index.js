import { openDb } from './db.js';
import { createApp } from './app.js';

const db = openDb();
const port = Number(process.env.PORT || 3000);
createApp(db).listen(port, () => console.log(`PairMundo running on http://localhost:${port}`));
