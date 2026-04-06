import { ProcessingStatus } from '@prisma/client';

export class CertificateProcessedEvent {
  constructor(
    public readonly certificateId: string,
    public readonly userId: string,
    public readonly courseName: string,
    public readonly status: ProcessingStatus,
    public readonly errorMessage?: string,
  ) {}
}
