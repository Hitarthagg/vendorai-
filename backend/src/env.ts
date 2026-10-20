import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Resolve against backend/, even when the process is launched from the repo root.
config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
