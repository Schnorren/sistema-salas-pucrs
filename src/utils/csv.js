// Exportação CSV (abre no Excel da secretaria).
//
// Célula que começa com = + - @ (ou tab/CR) o Excel interpreta como FÓRMULA:
// um nome de sala vindo do PDF como "=HYPERLINK(...)" viraria link/comando ao
// abrir a planilha (CSV injection). Prefixar com ' mantém o texto literal.
// Vírgula, aspas e quebra de linha exigem aspas em volta (RFC 4180).
export const celulaCsv = (valor) => {
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : '';
  let texto = String(valor ?? '');
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[",\n\r;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

export const linhaCsv = (valores) => valores.map(celulaCsv).join(',');

// BOM para o Excel reconhecer UTF-8 (acentos); URL do blob liberada depois.
export const baixarCsv = (nomeArquivo, linhas) => {
  const blob = new Blob(['﻿' + linhas.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
