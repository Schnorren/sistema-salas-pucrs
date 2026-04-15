const SHARED_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  
  * { 
    -webkit-print-color-adjust: exact !important; 
    print-color-adjust: exact !important; 
    box-sizing: border-box; 
  }
  
  @page {
    size: A4 portrait;
    margin: 10mm;
  }

  body { 
    font-family: 'Inter', sans-serif; 
    color: #1e293b; 
    padding: 0; 
    margin: 0 auto; 
    background: #fff; 
    font-size: 11px;
    width: 190mm; 
    max-width: 190mm;
  }
  
  .header { 
    border-bottom: 2px solid #0f172a; 
    padding-bottom: 12px; 
    margin-bottom: 15px; 
  }
  
  h1 { font-size: 20px; margin: 0 0 5px 0; color: #0f172a; font-weight: 800; letter-spacing: -0.5px; }
  .gen-date { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600; }
  
  .section-title { 
    font-size: 13px; 
    margin: 25px 0 15px; 
    font-weight: 700; 
    color: #0f172a; 
    border-bottom: 1px solid #e2e8f0; 
    padding-bottom: 6px; 
    text-transform: uppercase;
    letter-spacing: 0.5px;
    clear: both;
  }

  .filters-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 25px;
    font-size: 10px;
    color: #334155;
    line-height: 1.5;
  }
  
  .footer-note { 
    margin-top: 30px; 
    font-size: 9px; 
    color: #94a3b8; 
    border-top: 1px solid #e2e8f0; 
    padding-top: 10px; 
    text-align: center;
    clear: both;
  }
`;

export const generateSingleReportPDF = (reportData, sortedRoomsArray, activeDays, activePers) => {
  const COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6'];
  const kpis = reportData.data?.kpis || {};
  const curvaHorario = reportData.dinamico?.curvaHorario || [];

  const maxSalasNaCurva = Math.max(...curvaHorario.map(c => c.salasOcupadas), 1);

  const cleanRoomName = (name) => {
    const parts = name.split('.');
    if (parts.length >= 2) return `${parts[parts.length - 2]}${parts[parts.length - 1]}`;
    return name;
  };

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Relatório BI - Ocupação Espacial</title>
      <style>
        ${SHARED_STYLES}
        
        .kpi-card { display: inline-block; width: 31%; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; background: #fafafa; border-top: 4px solid #3b82f6; box-sizing: border-box; vertical-align: top; margin-right: 2%; margin-bottom: 10px; }
        .kpi-card.last { margin-right: 0; }
        .kpi-title { font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; margin-bottom: 8px; }
        .kpi-value { font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
        .kpi-sub { font-size: 9px; color: #64748b; font-weight: 500; line-height: 1.3;}

        .chart-container { display: block; height: 160px; padding: 25px 15px 0; border: 1px solid #e2e8f0; border-radius: 8px; background: #fafafa; margin-bottom: 30px; box-sizing: border-box; text-align: center; white-space: nowrap; }
        .chart-bar-wrapper { display: inline-block; width: 5%; position: relative; height: 100%; margin: 0 0.5%; vertical-align: bottom; }
        .chart-bar { width: 100%; background: rgba(59, 130, 246, 0.7); border-radius: 2px 2px 0 0; border-top: 2px solid #2563eb; position: absolute; bottom: 15px; }
        .chart-label { position: absolute; bottom: -5px; width: 100%; font-size: 8px; color: #64748b; font-weight: bold; text-align: center; }
        .chart-val { position: absolute; width: 100%; font-size: 8px; font-weight: bold; color: #0f172a; text-align: center; margin-top: -12px;}

        .room-card { display: inline-block; width: 23%; margin-right: 2%; border: 1px solid #e2e8f0; padding: 15px 5px; border-radius: 8px; margin-bottom: 15px; text-align: center; box-sizing: border-box; page-break-inside: avoid; background: #fff; vertical-align: top; }
        .room-card:nth-child(4n) { margin-right: 0; }
        .room-name { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
        .pie { width: 60px; height: 60px; border-radius: 50%; display: inline-block; position: relative; margin-bottom: 10px; }
        .pie-inner { width: 46px; height: 46px; background: #fff; border-radius: 50%; position: absolute; top: 7px; left: 7px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #0f172a; }
        .room-aulas { font-size: 9px; color: #64748b; font-weight: 500;}
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Dashboard Analítico de Ocupação</h1>
        <div class="gen-date">Exportado em: ${new Date().toLocaleString('pt-BR')} | Ref: ${reportData.nome}</div>
      </div>
      
      <div class="filters-box">
        <strong>Dias Considerados:</strong> ${activeDays.join(', ')} <br/>
        <strong style="margin-top: 4px; display: block;">Períodos:</strong> ${activePers.join(', ')} <br/>
        <strong style="margin-top: 4px; display: block;">Salas Analisadas:</strong> ${sortedRoomsArray.join(', ')}
      </div>

      <div>
        <div class="kpi-card" style="border-top-color: ${COLORS[0]}">
          <div class="kpi-title">Eficiência do Prédio</div>
          <div class="kpi-value" style="color: ${COLORS[0]}">${reportData.percentual.toFixed(1)}%</div>
          <div class="kpi-sub">Taxa de Ocupação Global</div>
        </div>
        <div class="kpi-card" style="border-top-color: ${COLORS[1]}">
          <div class="kpi-title">Volume de Aulas</div>
          <div class="kpi-value" style="color: ${COLORS[1]}">${reportData.totalFiltrado}</div>
          <div class="kpi-sub">Alocações nos Filtros Ativos</div>
        </div>
        <div class="kpi-card last" style="border-top-color: ${COLORS[2]}">
          <div class="kpi-title">Salas Encontradas</div>
          <div class="kpi-value" style="color: ${COLORS[2]}">${kpis.totalSalas || 0}</div>
          <div class="kpi-sub">Sala Crítica:<br/>${cleanRoomName(kpis.salaMaisUsada || '-')}</div>
        </div>
      </div>

      <div class="section-title">Curva de Ocupação Operacional</div>
      <div class="chart-container">
        ${curvaHorario.map(c => {
    const hPerc = (c.salasOcupadas / maxSalasNaCurva) * 100;
    return `
              <div class="chart-bar-wrapper">
                <div class="chart-bar" style="height: ${hPerc}%;">
                  ${c.salasOcupadas > 0 ? `<div class="chart-val">${c.salasOcupadas}</div>` : ''}
                </div>
                <div class="chart-label">${c.horario}</div>
              </div>
            `;
  }).join('')}
      </div>

      <div class="section-title">Ranking de Utilização por Sala</div>
      <div>
        ${sortedRoomsArray.map(room => {
    const stat = reportData.roomStats[room] || { perc: 0, count: 0 };
    const pNum = Number(stat.perc);
    const ringColor = pNum > 80 ? '#ef4444' : pNum > 45 ? '#f59e0b' : '#3b82f6';

    return `
              <div class="room-card">
                <div class="room-name">${room}</div>
                <div class="pie" style="background: conic-gradient(${ringColor} ${pNum}%, #e2e8f0 0);">
                  <div class="pie-inner">${stat.perc}%</div>
                </div>
                <div class="room-aulas">${stat.count} aulas alocadas</div>
              </div>
            `;
  }).join('')}
      </div>

      <div class="footer-note">Este documento é gerado dinamicamente através do módulo de Business Intelligence.</div>
    </body>
    </html>
  `;
  executePrint(html);
};

export const generateHeatmapPDF = (stats, activeDays, activePersCount) => {
};

const executePrint = (html) => {
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.print(); }, 500);
};