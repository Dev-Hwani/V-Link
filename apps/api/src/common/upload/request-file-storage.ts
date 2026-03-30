import { existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";

import { diskStorage } from "multer";

const UPLOAD_DIR = join(process.cwd(), "uploads");

function ensureUploadDirectory() {
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export const requestFileStorage = diskStorage({
  destination: (_req, _file, callback) => {
    ensureUploadDirectory();
    callback(null, UPLOAD_DIR);
  },
  filename: (_req, file, callback) => {
    const extension = extname(file.originalname);
    callback(null, `${Date.now()}-${randomUUID()}${extension}`);
  },
});
