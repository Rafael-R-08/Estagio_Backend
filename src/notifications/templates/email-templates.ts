const baseStyle = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background-color: #f4f6f8;
  margin: 0; padding: 0;
`;

const cardStyle = `
  max-width: 560px; margin: 40px auto; background: #ffffff;
  border-radius: 8px; overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
`;

const headerStyle = `
  background: linear-gradient(135deg, #003087 0%, #0057c8 100%);
  padding: 32px 40px; text-align: center;
`;

const bodyStyle = `padding: 32px 40px; color: #333333;`;

const ctaBtnStyle = (bg = '#003087') => `
  display: inline-block; padding: 14px 32px; border-radius: 6px;
  background: ${bg}; color: #ffffff; text-decoration: none;
  font-weight: 600; font-size: 15px; margin: 8px 0;
`;

const footerStyle = `
  padding: 20px 40px; background: #f4f6f8; text-align: center;
  font-size: 12px; color: #999999;
`;

function wrap(content: string): string {
  return `<!DOCTYPE html><html><body style="${baseStyle}">
<div style="${cardStyle}">
  <div style="${headerStyle}">
    <h1 style="color:#ffffff; margin:0; font-size:24px; font-weight:700; letter-spacing:-0.5px;">LearningHub</h1>
    <p style="color:#a8c4f0; margin:6px 0 0; font-size:14px;">Softinsa Learning Platform</p>
  </div>
  ${content}
  <div style="${footerStyle}">
    <p style="margin:0;">Este email foi enviado automaticamente. Por favor não responda.</p>
    <p style="margin:4px 0 0;">© 2026 Softinsa · LearningHub</p>
  </div>
</div>
</body></html>`;
}

export function buildVerificationEmail(
  name: string,
  verificationUrl: string,
): { subject: string; html: string; text: string } {
  const subject = 'Confirme o seu email — LearningHub';
  const html = wrap(`
    <div style="${bodyStyle}">
      <h2 style="margin-top:0; color:#003087;">Olá${name ? `, ${name}` : ''}!</h2>
      <p>Obrigado por se registar no <strong>LearningHub</strong>. Para ativar a sua conta, confirme o seu endereço de email clicando no botão abaixo.</p>
      <p style="text-align:center; margin:32px 0;">
        <a href="${verificationUrl}" style="${ctaBtnStyle()}">Confirmar Email</a>
      </p>
      <p style="font-size:13px; color:#666;">Este link expira em <strong>24 horas</strong>. Se não criou esta conta, pode ignorar este email com segurança.</p>
    </div>
  `);
  const text = `Olá${name ? ` ${name}` : ''},\n\nConfirme o seu email acedendo ao link:\n${verificationUrl}\n\nEste link expira em 24 horas.`;
  return { subject, html, text };
}

export function buildPasswordResetEmail(
  name: string,
  resetUrl: string,
): { subject: string; html: string; text: string } {
  const subject = 'Recuperação de password — LearningHub';
  const html = wrap(`
    <div style="${bodyStyle}">
      <h2 style="margin-top:0; color:#003087;">Recuperar Password</h2>
      <p>Olá${name ? `, <strong>${name}</strong>` : ''}! Recebemos um pedido para redefinir a password da sua conta LearningHub.</p>
      <p style="text-align:center; margin:32px 0;">
        <a href="${resetUrl}" style="${ctaBtnStyle('#d93025')}">Redefinir Password</a>
      </p>
      <p style="font-size:13px; color:#666;">Este link expira em <strong>1 hora</strong>. Se não pediu a recuperação de password, pode ignorar este email — a sua conta está segura.</p>
    </div>
  `);
  const text = `Olá${name ? ` ${name}` : ''},\n\nRedefina a sua password acedendo ao link:\n${resetUrl}\n\nEste link expira em 1 hora.`;
  return { subject, html, text };
}

export function buildPasswordChangedEmail(
  name: string,
  loginUrl: string,
): { subject: string; html: string; text: string } {
  const subject = 'A tua password foi alterada — LearningHub';
  const html = wrap(`
    <div style="${bodyStyle}">
      <h2 style="margin-top:0; color:#003087;">Password Alterada</h2>
      <p>Olá${name ? `, <strong>${name}</strong>` : ''}! A password da tua conta LearningHub foi alterada com sucesso.</p>
      <p>Se foste tu a fazer esta alteração, não precisas de fazer nada.</p>
      <div style="background:#fff3cd; border-left:4px solid #e6a817; padding:12px 16px; border-radius:4px; margin:16px 0; font-size:13px;">
        ⚠️ <strong>Não reconheces esta alteração?</strong> Altera a tua password imediatamente e contacta o suporte.
      </div>
      <p style="text-align:center; margin:32px 0;">
        <a href="${loginUrl}/auth/forgot-password" style="${ctaBtnStyle('#d93025')}">Recuperar Conta</a>
      </p>
    </div>
  `);
  const text = `Olá${name ? ` ${name}` : ''},\n\nA password da tua conta LearningHub foi alterada.\n\nSe não foste tu, recupera a tua conta: ${loginUrl}/auth/forgot-password`;
  return { subject, html, text };
}

export function buildCertificateStuckEmail(
  name: string,
  courseName: string,
  loginUrl: string,
): { subject: string; html: string; text: string } {
  const subject = `Atraso no processamento do certificado: ${courseName}`;
  const html = wrap(`
    <div style="${bodyStyle}">
      <h2 style="margin-top:0; color:#e6a817;">Processamento em Atraso</h2>
      <p>Olá${name ? `, <strong>${name}</strong>` : ''}! O processamento do certificado do curso <strong>${courseName}</strong> está a demorar mais do que o esperado.</p>
      <p>A nossa equipa técnica foi notificada. Podes tentar submeter o certificado novamente ou aguardar mais alguns minutos.</p>
      <p style="text-align:center; margin:32px 0;">
        <a href="${loginUrl}/certificates" style="${ctaBtnStyle('#e6a817')}">Ver Certificados</a>
      </p>
    </div>
  `);
  const text = `Olá${name ? ` ${name}` : ''},\n\nO processamento do certificado "${courseName}" está em atraso.\n\nVer certificados: ${loginUrl}/certificates`;
  return { subject, html, text };
}

export function buildTrainingStagnationEmail(
  name: string,
  trainings: { title: string; startedAt: Date }[],
  loginUrl: string,
): { subject: string; html: string; text: string } {
  const subject =
    trainings.length === 1
      ? `Continua a tua formação: ${trainings[0].title}`
      : `Tens ${trainings.length} formações em curso há mais de 30 dias`;

  const items = trainings
    .map((t) => {
      const days = Math.floor(
        (Date.now() - t.startedAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      return `<li style="margin:8px 0;"><strong>${t.title}</strong> <span style="color:#999; font-size:13px;">(em curso há ${days} dias)</span></li>`;
    })
    .join('');

  const html = wrap(`
    <div style="${bodyStyle}">
      <h2 style="margin-top:0; color:#003087;">Continua a tua aprendizagem! 💪</h2>
      <p>Olá${name ? `, <strong>${name}</strong>` : ''}! Tens formações em curso há algum tempo. Não deixes o impulso parar:</p>
      <ul style="padding-left:20px; margin:16px 0;">${items}</ul>
      <p style="text-align:center; margin:32px 0;">
        <a href="${loginUrl}/trainings" style="${ctaBtnStyle()}">Retomar Formações</a>
      </p>
    </div>
  `);
  const textItems = trainings.map((t) => `- ${t.title}`).join('\n');
  const text = `Olá${name ? ` ${name}` : ''},\n\nTens formações em curso há mais de 30 dias:\n${textItems}\n\nRetomar: ${loginUrl}/trainings`;
  return { subject, html, text };
}

export function buildOnboardingReminderEmail(
  name: string,
  loginUrl: string,
): { subject: string; html: string; text: string } {
  const subject = 'Completa o teu perfil e começa a aprender — LearningHub';
  const html = wrap(`
    <div style="${bodyStyle}">
      <h2 style="margin-top:0; color:#003087;">O teu perfil está incompleto</h2>
      <p>Olá${name ? `, <strong>${name}</strong>` : ''}! Registaste-te no LearningHub mas ainda não completaste o teu perfil.</p>
      <p>Com o perfil completo consegues:</p>
      <ul style="padding-left:20px; margin:12px 0; line-height:1.8;">
        <li>Receber recomendações de formação personalizadas por IA</li>
        <li>Acompanhar o teu progresso de aprendizagem</li>
        <li>Visibilidade para o teu SL Manager</li>
      </ul>
      <p style="text-align:center; margin:32px 0;">
        <a href="${loginUrl}/onboarding" style="${ctaBtnStyle()}">Completar Perfil</a>
      </p>
    </div>
  `);
  const text = `Olá${name ? ` ${name}` : ''},\n\nCompleta o teu perfil para receber recomendações personalizadas.\n\nCompletare perfil: ${loginUrl}/onboarding`;
  return { subject, html, text };
}

export function buildNewMemberEmail(
  managerName: string,
  memberName: string,
  memberEmail: string,
  lineName: string,
  loginUrl: string,
): { subject: string; html: string; text: string } {
  const subject = `Novo membro na ${lineName}: ${memberName || memberEmail}`;
  const html = wrap(`
    <div style="${bodyStyle}">
      <h2 style="margin-top:0; color:#003087;">Novo Membro na Service Line</h2>
      <p>Olá${managerName ? `, <strong>${managerName}</strong>` : ''}! Um novo colaborador foi adicionado à tua Service Line <strong>${lineName}</strong>.</p>
      <div style="background:#f0f4ff; border-radius:6px; padding:14px 16px; margin:16px 0;">
        <div style="font-size:15px; font-weight:600;">${memberName || '—'}</div>
        <div style="font-size:13px; color:#666;">${memberEmail}</div>
      </div>
      <p style="text-align:center; margin:32px 0;">
        <a href="${loginUrl}/sl-manager" style="${ctaBtnStyle()}">Ver Service Line</a>
      </p>
    </div>
  `);
  const text = `Olá${managerName ? ` ${managerName}` : ''},\n\nNovo membro na ${lineName}: ${memberName || memberEmail} (${memberEmail})\n\nVer service line: ${loginUrl}/sl-manager`;
  return { subject, html, text };
}

export function buildWeeklyRecommendationsEmail(
  name: string,
  courses: {
    title: string;
    reason: string;
    category: string;
    level?: string | null;
    estimatedHours?: number | null;
  }[],
  summary: string,
  loginUrl: string,
): { subject: string; html: string; text: string } {
  const subject = 'As tuas recomendações semanais de formação — LearningHub';

  const categoryLabel = (cat: string) => {
    if (cat === 'improvement') return 'Progressão de Carreira';
    if (cat === 'interests') return 'Área de Interesse';
    if (cat === 'missing_skills') return 'Competências a Desenvolver';
    return 'Recomendado';
  };

  const courseItems = courses
    .map((c) => {
      const meta = [
        c.level ? `Nível: ${c.level}` : null,
        c.estimatedHours ? `${c.estimatedHours}h` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      return `
      <div style="border:1px solid #e8edf2; border-radius:6px; padding:16px; margin:10px 0;">
        <div style="font-size:11px; color:#0057c8; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">${categoryLabel(c.category)}</div>
        <div style="font-size:15px; font-weight:600; color:#1a1a1a; margin-bottom:4px;">${c.title}</div>
        <div style="font-size:13px; color:#555;">${c.reason}</div>
        ${meta ? `<div style="font-size:12px; color:#999; margin-top:6px;">${meta}</div>` : ''}
      </div>`;
    })
    .join('');

  const html = wrap(`
    <div style="${bodyStyle}">
      <h2 style="margin-top:0; color:#003087;">As tuas recomendações desta semana</h2>
      <p>Olá${name ? `, <strong>${name}</strong>` : ''}! Com base no teu perfil, selecionámos estas formações para ti:</p>
      <div style="background:#f0f4ff; border-radius:6px; padding:14px 16px; margin:16px 0; font-size:14px; color:#333; font-style:italic;">${summary}</div>
      ${courseItems}
      <p style="text-align:center; margin:32px 0;">
        <a href="${loginUrl}/recommendations" style="${ctaBtnStyle()}">Ver Todas as Recomendações</a>
      </p>
      <p style="font-size:12px; color:#999;">Podes gerir as tuas preferências de notificações nas definições da conta.</p>
    </div>
  `);

  const textCourses = courses
    .map((c, i) => `${i + 1}. ${c.title}\n   ${c.reason}`)
    .join('\n\n');
  const text = `Olá${name ? ` ${name}` : ''},\n\n${summary}\n\n${textCourses}\n\nVer recomendações: ${loginUrl}/recommendations`;
  return { subject, html, text };
}

export function buildSlManagerDigestEmail(
  name: string,
  lineName: string,
  stats: {
    totalMembers: number;
    activeMembers: number;
    completedLast30Days: number;
    ongoing: number;
    expiringCerts: number;
  },
  loginUrl: string,
): { subject: string; html: string; text: string } {
  const subject = `Resumo semanal da sua Service Line — ${lineName}`;

  const row = (label: string, value: string | number, highlight = false) =>
    `<tr>
      <td style="padding:10px 12px; border-bottom:1px solid #eee; color:#555;">${label}</td>
      <td style="padding:10px 12px; border-bottom:1px solid #eee; font-weight:600; color:${highlight ? '#d93025' : '#1a1a1a'}; text-align:right;">${value}</td>
    </tr>`;

  const html = wrap(`
    <div style="${bodyStyle}">
      <h2 style="margin-top:0; color:#003087;">Resumo Semanal — ${lineName}</h2>
      <p>Olá${name ? `, <strong>${name}</strong>` : ''}! Aqui está o resumo da tua Service Line para esta semana:</p>
      <table style="width:100%; border-collapse:collapse; margin:16px 0; border:1px solid #e8edf2; border-radius:6px; overflow:hidden;">
        ${row('Membros ativos', `${stats.activeMembers} / ${stats.totalMembers}`)}
        ${row('Formações concluídas (últimos 30 dias)', stats.completedLast30Days)}
        ${row('Formações em curso', stats.ongoing)}
        ${row('Certificados a expirar (90 dias)', stats.expiringCerts, stats.expiringCerts > 0)}
      </table>
      ${stats.expiringCerts > 0 ? `<p style="color:#d93025; font-size:13px;">⚠️ Existem <strong>${stats.expiringCerts} certificados</strong> a expirar nos próximos 90 dias. Considera alertar os colaboradores afetados.</p>` : ''}
      <p style="text-align:center; margin:32px 0;">
        <a href="${loginUrl}/sl-manager" style="${ctaBtnStyle()}">Ver Detalhes da Service Line</a>
      </p>
    </div>
  `);

  const text = [
    `Olá${name ? ` ${name}` : ''},`,
    ``,
    `Resumo Semanal — ${lineName}`,
    `Membros ativos: ${stats.activeMembers}/${stats.totalMembers}`,
    `Formações concluídas (30d): ${stats.completedLast30Days}`,
    `Em curso: ${stats.ongoing}`,
    `Certificados a expirar: ${stats.expiringCerts}`,
    ``,
    `Ver detalhes: ${loginUrl}/sl-manager`,
  ].join('\n');
  return { subject, html, text };
}

export function buildTrainingCompletedEmail(
  name: string,
  trainingTitle: string,
  loginUrl: string,
): { subject: string; html: string; text: string } {
  const subject = `Formação concluída: ${trainingTitle}`;
  const html = wrap(`
    <div style="${bodyStyle}">
      <h2 style="margin-top:0; color:#003087;">Parabéns pela conclusão! 🎉</h2>
      <p>Olá${name ? `, <strong>${name}</strong>` : ''}! Concluíste com sucesso a formação:</p>
      <div style="background:#f0f4ff; border-left:4px solid #003087; padding:12px 16px; border-radius:4px; margin:16px 0;">
        <strong style="font-size:16px;">${trainingTitle}</strong>
      </div>
      <p>Não te esqueças de submeter o certificado para manter o teu registo atualizado.</p>
      <p style="text-align:center; margin:32px 0;">
        <a href="${loginUrl}/trainings" style="${ctaBtnStyle()}">Ver As Minhas Formações</a>
      </p>
    </div>
  `);
  const text = `Olá${name ? ` ${name}` : ''},\n\nParabéns! Concluíste a formação "${trainingTitle}".\n\nVer formações: ${loginUrl}/trainings`;
  return { subject, html, text };
}

export function buildCertificateCompletedEmail(
  name: string,
  courseName: string,
  loginUrl: string,
): { subject: string; html: string; text: string } {
  const subject = `Certificado processado: ${courseName}`;
  const html = wrap(`
    <div style="${bodyStyle}">
      <h2 style="margin-top:0; color:#003087;">Certificado Processado ✓</h2>
      <p>Olá${name ? `, <strong>${name}</strong>` : ''}! O certificado do curso <strong>${courseName}</strong> foi processado com sucesso.</p>
      <p>Os metadados foram extraídos e o seu registo foi atualizado automaticamente.</p>
      <p style="text-align:center; margin:32px 0;">
        <a href="${loginUrl}/certificates" style="${ctaBtnStyle()}">Ver Certificados</a>
      </p>
    </div>
  `);
  const text = `Olá${name ? ` ${name}` : ''},\n\nO certificado do curso "${courseName}" foi processado com sucesso.\n\nVer certificados: ${loginUrl}/certificates`;
  return { subject, html, text };
}

export function buildCertificateFailedEmail(
  name: string,
  courseName: string,
  loginUrl: string,
): { subject: string; html: string; text: string } {
  const subject = `Erro ao processar certificado: ${courseName}`;
  const html = wrap(`
    <div style="${bodyStyle}">
      <h2 style="margin-top:0; color:#d93025;">Erro ao Processar Certificado</h2>
      <p>Olá${name ? `, <strong>${name}</strong>` : ''}! Ocorreu um erro ao processar o certificado do curso <strong>${courseName}</strong>.</p>
      <p>Por favor tente submeter o certificado novamente. Se o problema persistir, contacte o suporte.</p>
      <p style="text-align:center; margin:32px 0;">
        <a href="${loginUrl}/certificates" style="${ctaBtnStyle('#d93025')}">Ver Certificados</a>
      </p>
    </div>
  `);
  const text = `Olá${name ? ` ${name}` : ''},\n\nOcorreu um erro ao processar o certificado do curso "${courseName}".\n\nVer certificados: ${loginUrl}/certificates`;
  return { subject, html, text };
}

export function buildCertificateExpiringEmail(
  name: string,
  certificates: { courseName: string; expirationDate: Date }[],
  loginUrl: string,
): { subject: string; html: string; text: string } {
  const subject =
    certificates.length === 1
      ? `Certificado a expirar: ${certificates[0].courseName}`
      : `${certificates.length} certificados a expirar em breve`;

  const certRows = certificates
    .map((c) => {
      const dateStr = c.expirationDate.toLocaleDateString('pt-PT', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      return `<tr>
      <td style="padding:8px 12px; border-bottom:1px solid #eee;">${c.courseName}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #eee; color:#d93025; font-weight:600;">${dateStr}</td>
    </tr>`;
    })
    .join('');

  const html = wrap(`
    <div style="${bodyStyle}">
      <h2 style="margin-top:0; color:#d93025;">⚠️ Certificados a Expirar</h2>
      <p>Olá${name ? `, <strong>${name}</strong>` : ''}! Os seguintes certificados expiram em breve:</p>
      <table style="width:100%; border-collapse:collapse; margin:16px 0;">
        <thead>
          <tr style="background:#f4f6f8;">
            <th style="padding:8px 12px; text-align:left; font-size:13px;">Curso</th>
            <th style="padding:8px 12px; text-align:left; font-size:13px;">Expira em</th>
          </tr>
        </thead>
        <tbody>${certRows}</tbody>
      </table>
      <p style="text-align:center; margin:32px 0;">
        <a href="${loginUrl}/certificates" style="${ctaBtnStyle('#d93025')}">Renovar Certificados</a>
      </p>
    </div>
  `);
  const textRows = certificates
    .map(
      (c) =>
        `- ${c.courseName}: ${c.expirationDate.toLocaleDateString('pt-PT')}`,
    )
    .join('\n');
  const text = `Olá${name ? ` ${name}` : ''},\n\nOs seguintes certificados expiram em breve:\n${textRows}\n\nRenovar: ${loginUrl}/certificates`;
  return { subject, html, text };
}

export function buildWelcomeEmail(
  name: string,
  loginUrl: string,
): { subject: string; html: string; text: string } {
  const subject = 'Bem-vindo ao LearningHub!';
  const html = wrap(`
    <div style="${bodyStyle}">
      <h2 style="margin-top:0; color:#003087;">Bem-vindo ao LearningHub${name ? `, ${name}` : ''}!</h2>
      <p>A sua conta foi criada com sucesso. Explore formações personalizadas, acompanhe o seu progresso e obtenha recomendações de aprendizagem com IA.</p>
      <p style="text-align:center; margin:32px 0;">
        <a href="${loginUrl}" style="${ctaBtnStyle()}">Aceder ao LearningHub</a>
      </p>
      <p style="font-size:13px; color:#666;">Comece por completar o seu perfil para receber recomendações mais precisas.</p>
    </div>
  `);
  const text = `Bem-vindo ao LearningHub${name ? `, ${name}` : ''}!\n\nA sua conta foi criada com sucesso.\n\nAceda à plataforma: ${loginUrl}`;
  return { subject, html, text };
}

// ── Calendar ────────────────────────────────────────────────────────────────

export type CalendarReminderType = 'dayBefore' | 'dayOf' | 'final';

export function buildCalendarReminderEmail(
  name: string,
  eventTitle: string,
  eventDate: Date,
  reminderType: CalendarReminderType,
  reminderMinutesBefore: number,
  frontendUrl: string,
): { subject: string; html: string; text: string } {
  const dateStr = eventDate.toLocaleDateString('pt-PT', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = eventDate.toLocaleTimeString('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
  });

  let subject: string;
  let headlineColor = '#003087';
  let headline: string;
  let message: string;

  if (reminderType === 'dayBefore') {
    subject = `Amanhã: ${eventTitle} — LearningHub`;
    headline = 'Lembrete: Amanhã tens um evento!';
    headlineColor = '#0057c8';
    message = `O teu evento "<strong>${eventTitle}</strong>" está marcado para amanhã, <strong>${dateStr}</strong> às <strong>${timeStr}</strong>.`;
  } else if (reminderType === 'dayOf') {
    subject = `Hoje: ${eventTitle} — LearningHub`;
    headline = 'Lembrete: O teu evento é hoje!';
    headlineColor = '#e07b00';
    message = `O teu evento "<strong>${eventTitle}</strong>" está marcado para hoje, <strong>${dateStr}</strong> às <strong>${timeStr}</strong>.`;
  } else {
    subject = `Em ${reminderMinutesBefore} minutos: ${eventTitle} — LearningHub`;
    headline = `O teu evento começa em ${reminderMinutesBefore} minutos`;
    headlineColor = '#c0392b';
    message = `O teu evento "<strong>${eventTitle}</strong>" começa às <strong>${timeStr}</strong> — em <strong>${reminderMinutesBefore} minutos</strong>!`;
  }

  const html = wrap(`
    <div style="${bodyStyle}">
      <h2 style="margin-top:0; color:${headlineColor};">${headline}</h2>
      <p>Olá${name ? `, <strong>${name}</strong>` : ''}!</p>
      <p>${message}</p>
      <div style="background:#f0f4ff; border-radius:6px; padding:16px 20px; margin:20px 0;">
        <div style="font-size:18px; font-weight:700; color:#1a1a1a; margin-bottom:4px;">📅 ${eventTitle}</div>
        <div style="font-size:14px; color:#555;">${dateStr} · ${timeStr}</div>
      </div>
      <p style="text-align:center; margin:32px 0;">
        <a href="${frontendUrl}/calendar" style="${ctaBtnStyle()}">Ver Calendário</a>
      </p>
    </div>
  `);

  const reminderLabel =
    reminderType === 'dayBefore'
      ? `Lembrete: amanhã — ${dateStr} às ${timeStr}`
      : reminderType === 'dayOf'
        ? `Lembrete: hoje às ${timeStr}`
        : `Evento em ${reminderMinutesBefore} minutos (${timeStr})`;

  const text = `Olá${name ? ` ${name}` : ''},\n\n${reminderLabel}\nEvento: ${eventTitle}\n\nVer calendário: ${frontendUrl}/calendar`;
  return { subject, html, text };
}
