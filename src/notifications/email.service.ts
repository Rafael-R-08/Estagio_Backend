import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('smtp.host'),
      port: this.config.get<number>('smtp.port'),
      secure: this.config.get<boolean>('smtp.secure'),
      auth: {
        user: this.config.get<string>('smtp.user'),
        pass: this.config.get<string>('smtp.pass'),
      },
    });
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"LearningHub" <${this.config.get<string>('smtp.from')}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      this.logger.debug(
        `Email enviado para: ${options.to} | Assunto: ${options.subject}`,
      );
    } catch (error) {
      this.logger.error(
        `Erro ao enviar email para ${options.to}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      this.logger.warn(
        `Ligação SMTP não disponível: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
