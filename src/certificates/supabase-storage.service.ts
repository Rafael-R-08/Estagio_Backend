import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { extname, join } from 'path';
import * as fs from 'fs';

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private supabase: SupabaseClient | null = null;
  private readonly bucket: string;
  private readonly localFallbackDir = join(process.cwd(), 'uploads', 'certificates');

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('supabase.url');
    const key = this.configService.get<string>('supabase.key');
    this.bucket = this.configService.get<string>('supabase.bucket') || 'certificates';

    this.ensureLocalDir();
    
    if (url && key) {
      this.supabase = createClient(url, key);
      this.logger.log(`Supabase Storage iniciado: bucket "${this.bucket}"`);
    } else {
      this.logger.warn('Supabase credentials missing. Using local fallback.');
    }
  }

  private ensureLocalDir() {
    if (!fs.existsSync(this.localFallbackDir)) {
      fs.mkdirSync(this.localFallbackDir, { recursive: true });
    }
  }

  get isAvailable(): boolean {
    return this.supabase !== null;
  }

  async uploadFile(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    bucketName?: string,
    prefix = 'cert'
  ): Promise<string> {
    const ext = extname(file.originalname);
    const targetBucket = bucketName || this.bucket;
    const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

    // Supabase Storage
    if (this.supabase) {
      const { data, error } = await this.supabase.storage
        .from(targetBucket)
        .upload(filename, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (error) {
        this.logger.error(`Error uploading to Supabase (${targetBucket}): ${error.message} - ${JSON.stringify(error)}`);
        return this.saveLocal(file.buffer, filename, targetBucket);
      }

      const { data: publicUrlData } = this.supabase.storage
        .from(targetBucket)
        .getPublicUrl(filename);

      this.logger.log(`Ficheiro uploaded para Supabase (${targetBucket}): ${filename}`);
      return publicUrlData.publicUrl;
    }

    return this.saveLocal(file.buffer, filename, targetBucket);
  }

  private saveLocal(buffer: Buffer, filename: string, folderName: string): string {
    const targetDir = join(process.cwd(), 'uploads', folderName);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const filePath = join(targetDir, filename);
    fs.writeFileSync(filePath, buffer);
    this.logger.log(`Ficheiro guardado localmente (fallback) em ${folderName}: ${filename}`);
    return `/uploads/${folderName}/${filename}`;
  }

  async deleteFile(fileUrl: string, bucketName?: string): Promise<void> {
    const targetBucket = bucketName || this.bucket;
    // Supabase
    if (this.supabase && fileUrl.includes(this.configService.get<string>('supabase.url')!)) {
      try {
        const urlParts = fileUrl.split('/');
        const filename = urlParts[urlParts.length - 1];
        const { error } = await this.supabase.storage
          .from(targetBucket)
          .remove([filename]);

        if (error) {
          this.logger.warn(`Erro ao eliminar ficheiro do Supabase (${targetBucket}): ${error.message}`);
        } else {
          this.logger.log(`Ficheiro eliminado do Supabase (${targetBucket}): ${filename}`);
        }
      } catch (err) {
        this.logger.warn(`Erro ao processar URL do Supabase para eliminação: ${err}`);
      }
      return;
    }

    // Fallback: disco local
    if (fileUrl.startsWith('/uploads/')) {
      const filePath = join(process.cwd(), fileUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Ficheiro local eliminado: ${fileUrl}`);
      }
    }
  }
}
