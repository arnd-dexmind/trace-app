import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import multer from "multer";
import { storage as storageProvider } from "./storage.js";

const ALLOWED_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export class InvalidFileTypeError extends Error {
  mimetype: string;

  constructor(mimetype: string) {
    super(`File type ${mimetype} is not allowed`);
    this.name = "InvalidFileTypeError";
    this.mimetype = mimetype;
  }
}

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (ALLOWED_MIMETYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new InvalidFileTypeError(file.mimetype));
  }
};

export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
});

export async function handleUpload(file: Express.Multer.File, prefix: string) {
  return storageProvider.upload({
    buffer: file.buffer,
    originalName: file.originalname,
    mimetype: file.mimetype,
    prefix,
  });
}

export function generateStorageKey(prefix: string, originalName: string) {
  const ext = extname(originalName).toLowerCase() || ".bin";
  return `${prefix}/${randomUUID()}${ext}`;
}

export { storageProvider };
