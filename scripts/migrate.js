import { getConfig } from "../src/config.js";
import { openDatabase } from "../src/database.js";
const db = openDatabase(getConfig().database);
console.log("Database migrations applied.");
db.close();
