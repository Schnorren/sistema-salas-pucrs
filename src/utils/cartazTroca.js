// Cartaz A4 de troca de sala (janela de impressão). Extraído da Timeline no
// redesign para ser usado também pela Planta — o HTML do cartaz é o mesmo.
import logoPucrs from '../assets/logos/pucrs.jpeg';
import logoLiving360 from '../assets/logos/living360.jpeg';

// Dia em inglês para a linha EN do cartaz
const DAYS_EN = { Segunda: 'Monday', 'Terça': 'Tuesday', Quarta: 'Wednesday', Quinta: 'Thursday', Sexta: 'Friday', 'Sábado': 'Saturday', Domingo: 'Sunday' };

// Escapa valores interpolados no HTML do cartaz (inclui dados gravados por
// outros usuários — sem escape vira vetor de XSS na janela de impressão).
export const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Recebe os textos crus; devolve false se o navegador bloqueou o pop-up.
export function abrirCartazTroca(dados) {
    const nomeAula      = escapeHtml(dados.nomeAula);
    const codCred       = escapeHtml(String(dados.codCred ?? '').trim());
    const professor     = escapeHtml(String(dados.professor ?? '').trim());
    const predioDestino = escapeHtml(String(dados.predioDestino ?? '').trim());
    const salaDestino   = escapeHtml(String(dados.salaDestino ?? '').trim());
    const periodos      = escapeHtml(dados.periodos);
    const horario       = escapeHtml(dados.horario);
    const salaOrigem    = escapeHtml(dados.salaOrigem);
    const diaSemana     = escapeHtml(dados.dia);
    // "Gerado em" no fuso da PUCRS, não no do browser (regra do projeto)
    const geradoEm      = escapeHtml(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));

    // Linha em inglês — só inclui os campos preenchidos
    const partesEN = [`Class: ${nomeAula}`];
    if (codCred)   partesEN.push(`Code/Credits: ${codCred}`);
    if (professor) partesEN.push(`Instructor: ${professor}`);
    partesEN.push(`has been moved from Room ${salaOrigem} to Room ${salaDestino}, Building ${predioDestino}`);
    partesEN.push(`${DAYS_EN[dados.dia] || diaSemana} · Periods: ${periodos} (${horario.replace(' às ', ' to ')})`);
    const linhaEN = partesEN.join(' · ');

    const blocoCodCred   = codCred   ? `
      <div class="field">
        <div class="field-label">COD / CRED</div>
        <div class="field-value small">${codCred}</div>
      </div>` : '';

    const blocoProfessor = professor ? `
      <div class="field">
        <div class="field-label">PROFESSOR</div>
        <div class="field-value">${professor}</div>
      </div>` : '';

    const printWindow = window.open('', '', 'width=794,height=1123');
    if (!printWindow) return false;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>Aviso de Troca de Sala</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            * { box-sizing: border-box; margin: 0; padding: 0; }

            body {
              font-family: 'Arial', sans-serif;
              width: 210mm;
              min-height: 297mm;
              background: #fff;
              color: #0f172a;
              display: flex;
              align-items: stretch;
            }

            .page {
              width: 100%;
              min-height: 297mm;
              display: flex;
              flex-direction: column;
            }

            /* Cabeçalho — logos PUCRS + Living 360 */
            .header {
              background: #fff;
              padding: 18px 36px;
              display: flex;
              align-items: center;
              gap: 24px;
              border-bottom: 4px solid #003DA5;
            }

            .header-logo-pucrs { height: 48px; width: auto; display: block; }
            .header-logo-living360 { height: 42px; width: auto; display: block; }

            .header-divider-v {
              width: 1px;
              height: 42px;
              background: #CBD5E1;
              flex-shrink: 0;
            }

            /* Faixa vermelha de atenção */
            .atencao-bar {
              background: #DC2626;
              padding: 18px 36px;
              display: flex;
              align-items: center;
              gap: 14px;
            }
            .atencao-icon { font-size: 36px; line-height: 1; }
            .atencao-text {
              font-size: 36px;
              font-weight: 900;
              color: #fff;
              letter-spacing: 2px;
              text-transform: uppercase;
            }

            /* Corpo */
            .body {
              flex: 1;
              padding: 32px 36px;
              display: flex;
              flex-direction: column;
              gap: 24px;
            }

            /* Seção da aula */
            .aula-section {
              background: #F8FAFC;
              border: 2px solid #E2E8F0;
              border-left: 6px solid #003DA5;
              border-radius: 8px;
              padding: 20px 24px;
              display: flex;
              flex-direction: column;
              gap: 14px;
            }

            .field-label {
              font-size: 10px;
              font-weight: 700;
              color: #64748B;
              letter-spacing: 1.5px;
              text-transform: uppercase;
              margin-bottom: 3px;
            }

            .field-value {
              font-size: 26px;
              font-weight: 800;
              color: #0F172A;
              text-transform: uppercase;
              line-height: 1.2;
            }

            .field-value.small { font-size: 18px; }

            .divider {
              border: none;
              border-top: 1px solid #E2E8F0;
            }

            /* Caixa destino — centralizada, destaque total */
            .destino-section {
              background: linear-gradient(135deg, #DC2626 0%, #9B1C1C 100%);
              border-radius: 12px;
              padding: 36px 24px;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 10px;
              text-align: center;
            }

            .destino-label {
              font-size: 13px;
              font-weight: 700;
              color: rgba(255,255,255,0.8);
              letter-spacing: 2px;
              text-transform: uppercase;
            }

            .destino-sala {
              font-size: 110px;
              font-weight: 900;
              color: #fff;
              line-height: 1;
              letter-spacing: -4px;
            }

            .destino-predio {
              font-size: 22px;
              font-weight: 600;
              color: rgba(255,255,255,0.9);
              background: rgba(0,0,0,0.2);
              padding: 6px 20px;
              border-radius: 20px;
              margin-top: 4px;
            }

            /* Badge de períodos */
            .periodos-section {
              display: flex;
              justify-content: center;
            }

            .periodos-badge {
              background: #003DA5;
              color: #fff;
              font-size: 17px;
              font-weight: 700;
              padding: 12px 28px;
              border-radius: 50px;
              letter-spacing: 0.5px;
              text-align: center;
            }

            /* Linha em inglês */
            .en-line {
              font-size: 10px;
              color: #94A3B8;
              text-align: center;
              font-style: italic;
              line-height: 1.6;
              padding: 0 20px;
            }

            /* Rodapé */
            .footer {
              background: #F1F5F9;
              border-top: 2px solid #E2E8F0;
              padding: 12px 36px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }

            .footer-left { font-size: 10px; color: #64748B; }
            .footer-right { font-size: 10px; color: #94A3B8; font-style: italic; }

            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="page">

            <!-- Cabeçalho — logos PUCRS + Living 360 -->
            <div class="header">
              <img class="header-logo-pucrs" src="${logoPucrs}" alt="PUCRS" />
              <div class="header-divider-v"></div>
              <img class="header-logo-living360" src="${logoLiving360}" alt="Living 360" />
            </div>

            <!-- Faixa de atenção -->
            <div class="atencao-bar">
              <div class="atencao-icon">⚠</div>
              <div class="atencao-text">Atenção — Aviso de Troca de Sala</div>
            </div>

            <!-- Corpo -->
            <div class="body">

              <!-- Dados da aula -->
              <div class="aula-section">
                <div class="field">
                  <div class="field-label">Aula</div>
                  <div class="field-value">${nomeAula}</div>
                </div>
                ${blocoCodCred ? `<hr class="divider">${blocoCodCred}` : ''}
                ${blocoProfessor ? `<hr class="divider">${blocoProfessor}` : ''}
                <hr class="divider">
                <div class="field">
                  <div class="field-label">Sala de Origem</div>
                  <div class="field-value small">Sala ${salaOrigem}</div>
                </div>
              </div>

              <!-- Destino — centralizado e em destaque -->
              <div class="destino-section">
                <div class="destino-label">Foi transferida para a sala</div>
                <div class="destino-sala">${salaDestino}</div>
                <div class="destino-predio">Prédio ${predioDestino}</div>
              </div>

              <!-- Períodos -->
              <div class="periodos-section">
                <div class="periodos-badge">
                  ${diaSemana} &nbsp;·&nbsp; PERÍODOS: ${periodos} &nbsp;·&nbsp; ${horario}
                </div>
              </div>

              <!-- Linha em inglês -->
              <div class="en-line">${linhaEN}</div>

            </div>

            <!-- Rodapé -->
            <div class="footer">
              <div class="footer-left">Secretaria Acadêmica — PUCRS</div>
              <div class="footer-right">Gerado em ${geradoEm}</div>
            </div>

          </div>
          <script>
            // print() é assíncrono em alguns navegadores — fechar a janela logo
            // após chamá-lo cancelava o diálogo. onafterprint fecha só ao concluir
            // (ou cancelar) a impressão.
            window.onload = () => { window.focus(); window.print(); };
            window.onafterprint = () => window.close();
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    return true;
}
