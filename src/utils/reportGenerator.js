

const SHARED_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono&display=swap');
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
  body { font-family: 'IBM Plex Sans', sans-serif; color: #1a1714; padding: 40px; margin: 0; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1c2b4a; padding-bottom: 10px; margin-bottom: 20px; }
  h1 { font-size: 20px; margin: 0; color: #1c2b4a; font-weight: 600; }
  .gen-date { font-size: 10px; color: #7a756c; font-family: 'IBM Plex Mono', monospace; text-transform: uppercase; }
  .section-title { font-size: 14px; margin: 30px 0 15px; font-weight: 600; color: #1c2b4a; text-transform: uppercase; letter-spacing: 1px; border-left: 4px solid #c8973a; padding-left: 10px; }
  .footer-note { margin-top: 30px; font-size: 9px; color: #7a756c; border-top: 1px solid #d8d3cb; padding-top: 10px; }
`;


export const generateHeatmapPDF = (stats, activeDays, activePersCount) => {
  const daysArray = [...activeDays];
  const totalPossibleSlots = daysArray.length * activePersCount;
  const totalOccupied = stats.heatmap.reduce((acc, row) => acc + row.totalSala, 0);
  const totalPossibleAll = stats.heatmap.length * totalPossibleSlots;
  const percGeral = totalPossibleAll > 0 ? ((totalOccupied / totalPossibleAll) * 100) : 0;

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Relatório de Ocupação - PUCRS</title>
      <style>
        ${SHARED_STYLES}
        .filters-summary { font-size: 11px; background: #f7f5f2; padding: 12px; border-radius: 4px; border: 1px solid #d8d3cb; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .overall-container { display: flex; align-items: center; gap: 40px; background: #fff; border: 1px solid #d8d3cb; padding: 20px; border-radius: 6px; }
        .pie { width: 120px; height: 120px; border-radius: 50%; flex-shrink: 0; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .card { border: 1px solid #d8d3cb; padding: 12px; border-radius: 4px; text-align: center; page-break-inside: avoid; }
        .card h3 { margin: 0 0 8px 0; font-size: 13px; color: #1c2b4a; font-family: 'IBM Plex Mono'; }
        .mini-pie { width: 50px; height: 50px; border-radius: 50%; margin: 8px auto; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>SISTEMA DE SALAS · Relatório de Ocupação</h1>
        <div class="gen-date">Processado em: ${new Date().toLocaleString('pt-BR')}</div>
      </div>
      <div class="filters-summary">
        <div><b>Dias:</b> ${daysArray.join(', ')}</div>
        <div><b>Salas:</b> ${stats.heatmap.length} selecionadas</div>
        <div style="grid-column: span 2"><b>Janela:</b> ${activePersCount} períodos analisados por dia</div>
      </div>
      <div class="section-title">Ocupação Consolidada</div>
      <div class="overall-container">
        <div class="pie" style="background: conic-gradient(#1c2b4a ${percGeral}%, #e8e4de 0);"></div>
        <div>
          <div style="font-size: 22px; font-weight: 600;">${percGeral.toFixed(1)}%</div>
          <div style="font-size: 12px; color: #7a756c;">Utilização: ${totalOccupied} aulas de ${totalPossibleAll} slots</div>
        </div>
      </div>
      <div class="section-title">Detalhamento por Sala</div>
      <div class="grid">
        ${stats.heatmap.map(row => {
          const perc = totalPossibleSlots > 0 ? (row.totalSala / totalPossibleSlots) * 100 : 0;
          return `
            <div class="card">
              <h3>SALA ${row.sala}</h3>
              <div class="mini-pie" style="background: conic-gradient(#1c2b4a ${perc}%, #e8e4de 0);"></div>
              <div style="font-size: 12px; font-weight: 600;">${perc.toFixed(1)}%</div>
            </div>`;
        }).join('')}
      </div>
      <div class="footer-note">Prédio 15</div>
    </body>
    </html>
  `;
  executePrint(html);
};


export const generateComparisonPDF = (comparativoData) => {
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Comparativo Histórico - Prédio 15</title>
      <style>
        ${SHARED_STYLES}
        .comp-row { margin-bottom: 25px; page-break-inside: avoid; }
        .comp-label { font-size: 13px; font-weight: 600; margin-bottom: 8px; display: flex; justify-content: space-between; }
        .comp-track { background: #f0ede8; height: 32px; border-radius: 4px; border: 1px solid #d8d3cb; overflow: hidden; }
        .comp-bar { height: 100%; background: #1c2b4a; display: flex; align-items: center; padding-left: 15px; color: #fff; font-size: 11px; font-weight: 600; }
        .comp-bar.alt { background: #c8973a; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>ANÁLISE HISTÓRICA · Comparativo de Semanas</h1>
        <div class="gen-date">Exportado em: ${new Date().toLocaleString('pt-BR')}</div>
      </div>
      <p style="font-size: 12px; color: #42403a;">Este documento apresenta a comparação de ocupação entre diferentes conjuntos de dados carregados na Sandbox da secretaria.</p>
      
      <div class="section-title">Resultados do Confronto</div>
      
      ${comparativoData.map((s, i) => `
        <div class="comp-row">
          <div class="comp-label">
            <span>${s.nome}</span>
            <span>${s.percentual}% de ocupação</span>
          </div>
          <div class="comp-track">
            <div class="comp-bar ${i % 2 !== 0 ? 'alt' : ''}" style="width: ${s.percentual}%">
              ${s.total} Aulas registradas
            </div>
          </div>
        </div>
      `).join('')}

      <div class="footer-note">Relatório gerado via Modo de Análise Externa (Ad-hoc)</div>
    </body>
    </html>
  `;
  executePrint(html);
};


const executePrint = (html) => {
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.print();
  };
};