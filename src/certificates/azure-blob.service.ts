import { Injectable, Logger } from '@nestjs/common';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { extname, join } from 'path';
import * as fs from 'fs';

@Injectable()
export class AzureBlobService {
  private readonly logger = new Logger(AzureBlobService.name);
  private containerClient: ContainerClient | null = null;
  private readonly containerName: string;
  private readonly connectionString: string;
  private readonly localFallbackDir = join(process.cwd(), 'uploads', 'certificates');

  constructor() {
    this.connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
    this.containerName = process.env.AZURE_CONTAINER_NAME || 'certificates';
    this.ensureLocalDir();
    this.initialize();
  }

  private ensureLocalDir() {
    if (!fs.existsSync(this.localFallbackDir)) {
      fs.mkdirSync(this.localFallbackDir, { recursive: true });
    }
  }

  private initialize() {
    if (!this.connectionString) {
      this.logger.warn('AZURE_STORAGE_CONNECTION_STRING não configurada. A usar armazenamento local como fallback.');
      return;
    }
    try {
      const blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
      this.containerClient = blobServiceClient.getContainerClient(this.containerName);
      this.logger.log(`Azure Blob Storage iniciado: container "${this.containerName}"`);
    } catch (err) {
      this.logger.error(`Erro ao iniciar Azure Blob Storage: ${err}. A usar armazenamento local.`);
    }
  }

  get isAvailable(): boolean {
    return this.containerClient !== null;
  }

  async uploadFile(file: { buffer: Buffer; originalname: string; mimetype: string }): Promise<string> {
    const ext = extname(file.originalname);
    const filename = `cert-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

    // Azure Blob Storage
    if (this.containerClient) {
      await this.containerClient.createIfNotExists({ access: 'blob' });
      const blockBlobClient = this.containerClient.getBlockBlobClient(filename);
      await blockBlobClient.uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: file.mimetype },
      });
      this.logger.log(`Ficheiro uploaded para Azure: ${filename}`);
      return blockBlobClient.url;
    }

    // Fallback: disco local
    const filePath = join(this.localFallbackDir, filename);
    fs.writeFileSync(filePath, file.buffer);
    this.logger.log(`Ficheiro guardado localmente (fallback): ${filename}`);
    return `/uploads/certificates/${filename}`;
  }

  async deleteFile(fileUrl: string): Promise<void> {
    // Azure
    if (this.containerClient && fileUrl.startsWith('https://')) {
      try {
        const url = new URL(fileUrl);
        const blobName = url.pathname.split('/').slice(2).join('/');
        const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.deleteIfExists();
        this.logger.log(`Ficheiro eliminado do Azure: ${blobName}`);
      } catch (err) {
        this.logger.warn(`Erro ao eliminar ficheiro do Azure: ${err}`);
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
