import { closePmDb } from './connection.js';
import { migratePmDb } from './migrate.js';
import { seedPmDb } from './seed.js';

const command = process.argv[2];

try {
  switch (command) {
    case 'migrate':
      migratePmDb();
      break;
    case 'seed':
      seedPmDb();
      break;
    default:
      console.error('Usage: pm-db <migrate|seed>');
      process.exitCode = 1;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  closePmDb();
}
