import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Message, Conversation } from '@prisma/client';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly MAX_HISTORY_MESSAGES = 10; // Window Buffer

  constructor(private prisma: PrismaService) {}

  /**
   * Cria ou obtém uma conversa existente.
   */
  async getOrCreateConversation(userId: string, conversationId?: string, initialPrompt?: string): Promise<Conversation> {
    if (conversationId) {
      const existing = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (existing && existing.userId === userId) return existing;
    }

    const title = initialPrompt
      ? initialPrompt.trim().slice(0, 80)
      : 'Nova Conversa';

    return this.prisma.conversation.create({
      data: {
        userId,
        title,
      },
    });
  }

  /**
   * Adiciona uma mensagem ao histórico.
   */
  async addMessage(
    conversationId: string, 
    role: 'user' | 'assistant' | 'system', 
    content: string, 
    metadata?: any
  ): Promise<Message> {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        metadata: metadata || {},
      },
    });

    // Forçar atualização do updatedAt na conversa pai
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    });

    return message;
  }

  /**
   * Obtém as últimas N mensagens formatadas para o prompt (Window Buffer).
   */
  async getContextMessages(conversationId: string, limit = this.MAX_HISTORY_MESSAGES) {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Inverter para ordem cronológica
    return messages.reverse().map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));
  }

  /**
   * Lista conversas do utilizador.
   */
  async listUserConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { messages: true } },
      },
    });
  }

  /**
   * Limpa histórico (opcional).
   */
  async deleteConversation(conversationId: string, userId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv || conv.userId !== userId) throw new NotFoundException('Conversa não encontrada');

    await this.prisma.conversation.delete({ where: { id: conversationId } });
  }

  /**
   * Atualiza o título da conversa (AI Generated usually).
   */
  async updateTitle(conversationId: string, title: string) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { title },
    });
  }

  /**
   * Carrega todas as mensagens de uma conversa (para restaurar histórico no chat).
   */
  async getConversationMessages(conversationId: string, userId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv || conv.userId !== userId) throw new NotFoundException('Conversa não encontrada');

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return { conversationId, title: conv.title, messages };
  }
}
