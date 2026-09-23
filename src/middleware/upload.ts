import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { config } from '../config';

const allowedMimeTypes: readonly string[] = config.upload.allowedMimeTypes;

class UnsupportedMediaTypeError extends Error {
  constructor(public readonly mimeType: string) {
    super(`Unsupported image type: ${mimeType}`);
  }
}

const multerInstance = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new UnsupportedMediaTypeError(file.mimetype));
    }
  },
});

/**
 * Accepts a single `image` field and translates multer failures into JSON errors.
 * These are request-shape errors (bad file), distinct from detection failures.
 */
export function imageUpload(req: Request, res: Response, next: NextFunction): void {
  multerInstance.single('image')(req, res, (err: unknown) => {
    if (err instanceof UnsupportedMediaTypeError) {
      res.status(415).json({ error: 'unsupported_media_type', message: 'Image must be image/jpeg or image/png' });
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'file_too_large', message: 'Image must be 8MB or smaller' });
        return;
      }
      res.status(400).json({ error: 'invalid_upload', message: err.message });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'missing_image', message: 'Multipart field "image" is required' });
      return;
    }
    next();
  });
}
