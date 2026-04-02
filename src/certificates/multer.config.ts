import { memoryStorage } from 'multer';
import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff', '.txt'];
const MAX_SIZE_MB = 10;

export const multerCertificatesConfig = {
  // Memória: o buffer é enviado diretamente para o Azure Blob Storage
  storage: memoryStorage(),
  limits: {
    fileSize: MAX_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(
        new BadRequestException(`Tipo de ficheiro não permitido. Use: ${ALLOWED_EXTENSIONS.join(', ')}`),
        false,
      );
    }
    cb(null, true);
  },
};
