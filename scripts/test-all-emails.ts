import * as nodemailer from 'nodemailer';
import { config } from 'dotenv';
import * as templates from '../src/notifications/templates/email-templates';

config();

const smtpConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
};

const testEmail = process.env.SMTP_USER;
const loginUrl = process.env.APP_URL || 'http://localhost:3000';

async function runTest() {
  if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
    console.error('❌ Erro: SMTP_USER ou SMTP_PASS não definidos no .env');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport(smtpConfig);

  console.log(`🚀 Iniciando teste de emails para: ${testEmail}`);
  console.log(`📤 Servidor: ${smtpConfig.host}:${smtpConfig.port}`);

  try {
    await transporter.verify();
    console.log('✅ Conexão SMTP verificada com sucesso!');
  } catch (error) {
    console.error('❌ Erro na conexão SMTP:', error.message);
    console.log('\n💡 Dica: Verifica se criaste a "App Password" no Google e se a colocaste no .env como SMTP_PASS.');
    process.exit(1);
  }

  const mockTemplates = [
    { name: 'Bem-vindo', fn: () => templates.buildWelcomeEmail('Utilizador de Teste', loginUrl) },
    { name: 'Confirmação de Email', fn: () => templates.buildVerificationEmail('Utilizador de Teste', `${loginUrl}/verify?token=123`) },
    { name: 'Recuperação de Password', fn: () => templates.buildPasswordResetEmail('Utilizador de Teste', `${loginUrl}/reset?token=123`) },
    { name: 'Password Alterada', fn: () => templates.buildPasswordChangedEmail('Utilizador de Teste', loginUrl) },
    { name: 'Certificado Processado', fn: () => templates.buildCertificateCompletedEmail('Utilizador de Teste', 'NestJS Masterclass', loginUrl) },
    { name: 'Erro no Certificado', fn: () => templates.buildCertificateFailedEmail('Utilizador de Teste', 'NestJS Masterclass', loginUrl) },
    { name: 'Certificado em Atraso', fn: () => templates.buildCertificateStuckEmail('Utilizador de Teste', 'NestJS Masterclass', loginUrl) },
    { name: 'Certificado a Expirar', fn: () => templates.buildCertificateExpiringEmail('Utilizador de Teste', [{ courseName: 'Certificação Cloud', expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }], loginUrl) },
    { name: 'Formação Concluída', fn: () => templates.buildTrainingCompletedEmail('Utilizador de Teste', 'Introdução à IA', loginUrl) },
    { name: 'Estagnação de Formação', fn: () => templates.buildTrainingStagnationEmail('Utilizador de Teste', [{ title: 'TypeScript Avançado', startedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) }], loginUrl) },
    { name: 'Lembrete de Onboarding', fn: () => templates.buildOnboardingReminderEmail('Utilizador de Teste', loginUrl) },
    { name: 'Novo Membro (Manager)', fn: () => templates.buildNewMemberEmail('Manager de Teste', 'Novo Colaborador', 'novo@exemplo.com', 'Service Line Alpha', loginUrl) },
    { name: 'Resumo Semanal (Manager)', fn: () => templates.buildSlManagerDigestEmail('Manager de Teste', 'Service Line Alpha', { totalMembers: 10, activeMembers: 8, completedLast30Days: 5, ongoing: 12, expiringCerts: 2 }, loginUrl) },
    { name: 'Recomendações Semanais', fn: () => templates.buildWeeklyRecommendationsEmail('Utilizador de Teste', [{ title: 'Machine Learning', reason: 'Com base no teu interesse em Python', category: 'interests', level: 'Intermédio', estimatedHours: 10 }], 'Aqui estão as tuas sugestões de topo.', loginUrl) },
    { name: 'Lembrete de Calendário', fn: () => templates.buildCalendarReminderEmail('Utilizador de Teste', 'Workshop de React', new Date(), 'dayOf', 0, loginUrl) },
  ];

  for (const t of mockTemplates) {
    try {
      const email = t.fn();
      await transporter.sendMail({
        from: `"LearningHub Test" <${process.env.SMTP_FROM || smtpConfig.auth.user}>`,
        to: testEmail,
        subject: `[TESTE] ${t.name} - ${email.subject}`,
        html: email.html,
        text: email.text,
      });
      console.log(`✅ Enviado: ${t.name}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar ${t.name}:`, error.message);
    }
  }

  console.log('\n✨ Todos os testes concluídos! Verifica a tua caixa de entrada.');
}

runTest();
