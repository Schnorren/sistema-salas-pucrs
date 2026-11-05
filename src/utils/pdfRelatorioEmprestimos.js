// PDF do relatório de empréstimos, desenhado com o jsPDF (texto e gráficos
// vetoriais). Antes era uma captura da tela (html2canvas): saía no tema
// escuro, com ~30 MB, sem o período filtrado e só com as linhas abertas na tela.
//
// Recebe o relatório JÁ montado por montarRelatorio() (relatorioEmprestimos.js)
// — a tela e o PDF mostram os mesmos números. Roda no Node também
// (tests/pdfRelatorioEmprestimos.test.js).
//
// O PDF é só o resumo: sem a lista de retiradas (decisão do usuário,
// 05/11/2026). A lista continua na tela e na planilha.

import { jsPDF } from 'jspdf';
import { formatarDuracao } from '../../backend_core/utils/emprestimoRegras.js';
import { formatarDataHora, formatarNumero, formatarHoras } from './relatorioEmprestimos.js';

// Paleta do tema claro (index.css)
const COR = {
  navy: [28, 43, 74], blue: [26, 78, 150], amber: [150, 82, 10], green: [30, 107, 64],
  red: [160, 40, 40], purple: [78, 51, 138], text: [26, 23, 20], text2: [66, 64, 58],
  muted: [122, 117, 108], border: [216, 211, 203], border2: [196, 189, 179], panel2: [247, 245, 242], branco: [255, 255, 255],
};

const PAGINA_L = 210;
const PAGINA_A = 297;
const MARGEM = 14;
const LARGURA = PAGINA_L - 2 * MARGEM;
const LIMITE_Y = PAGINA_A - 18; // acima do rodapé
const ESPACO = 7;

// Fontes padrão do PDF só têm o Latin-1 (WinAnsi): o resto vira lixo na tela.
// Troca as pontuações comuns e tira acento de letra que não existe ali.
const TROCAS = { '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '•': '·', ' ': ' ' };
export const textoPdf = (valor) => [...String(valor ?? '')].map((c) => {
  if (TROCAS[c]) return TROCAS[c];
  if (c.charCodeAt(0) <= 255) return c;
  const base = c.normalize('NFD')[0];
  return base && base.charCodeAt(0) <= 255 ? base : '?';
}).join('');

// Eixo com até 4 marcas inteiras em passos 1, 2, 5 × 10^n: máximo 10 → 0, 5, 10
// (passo 2,5 dava 0, 3, 5, 8, 10 depois de arredondar)
export const escalaEixo = (maximo) => {
  const alvo = Math.max(maximo, 1) / 4;
  const pot = 10 ** Math.floor(Math.log10(alvo));
  const passo = Math.max(1, [1, 2, 5, 10].map(m => m * pot).find(v => v >= alvo));
  const marcas = Math.max(1, Math.ceil(Math.max(maximo, 1) / passo));
  return { passo, marcas, teto: passo * marcas };
};

// Mistura branco → cor (t de 0 a 1)
const misturar = (cor, t) => cor.map(c => Math.round(255 + (c - 255) * t));

export const gerarPdfRelatorio = (rel, meta = {}, { compress = true } = {}) => {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress });
  const { predioNome = '', pontoNome = 'Todos os pontos', geradoEm = new Date(), geradoPor = '' } = meta;
  let y = MARGEM;

  pdf.setProperties({
    title: textoPdf(`Relatório de Empréstimos - ${predioNome} - ${rel.periodo.texto}`),
    subject: 'Relatório de Empréstimos', creator: 'Sistema de Salas PUCRS',
  });

  // ------------------------------------------------------------ primitivas
  const fonte = (tamanho, estilo = 'normal', cor = COR.text) => {
    pdf.setFont('helvetica', estilo);
    pdf.setFontSize(tamanho);
    pdf.setTextColor(...cor);
  };
  const escrever = (texto, x, yy, opcoes) => pdf.text(textoPdf(texto), x, yy, opcoes);
  const largura = (texto) => pdf.getTextWidth(textoPdf(texto));
  // Corta com "..." para caber na largura (fonte atual)
  // Um sufixo " (PAT-01)" é preservado: é ele que diferencia itens de mesmo nome.
  const caber = (texto, max) => {
    let t = textoPdf(texto);
    if (pdf.getTextWidth(t) <= max) return t;
    const sufixo = / \([^()]{1,20}\)$/.exec(t)?.[0] || '';
    if (sufixo) t = t.slice(0, -sufixo.length);
    while (t.length > 1 && pdf.getTextWidth(`${t}...${sufixo}`) > max) t = t.slice(0, -1);
    return `${t.trimEnd()}...${sufixo}`;
  };
  const caixa = (x, yy, w, h, preenchimento, borda) => {
    if (preenchimento) pdf.setFillColor(...preenchimento);
    if (borda) { pdf.setDrawColor(...borda); pdf.setLineWidth(0.2); }
    pdf.rect(x, yy, w, h, preenchimento && borda ? 'FD' : preenchimento ? 'F' : 'S');
  };
  const novaPagina = () => { pdf.addPage(); y = MARGEM; };
  const garantir = (altura) => { if (y + altura > LIMITE_Y) novaPagina(); };

  // Título de bloco (com subtítulo à direita) — 8 mm
  const tituloBloco = (x, yy, w, titulo, sub) => {
    fonte(10.5, 'bold', COR.navy);
    escrever(titulo, x, yy + 4.5);
    if (sub) {
      fonte(7.5, 'normal', COR.muted);
      escrever(caber(sub, w - largura(titulo) - 6), x + w, yy + 4.5, { align: 'right' });
    }
    return 8;
  };
  const vazio = (x, yy) => { fonte(8, 'italic', COR.muted); escrever('Nenhum registro no período.', x, yy + 4); return 8; };

  // --------------------------------------------------------------- blocos
  // Barras horizontais: [{ rotulo, valor, texto? }]
  const ALTURA_LINHA_BARRA = 6;
  const alturaBarrasH = (linhas) => 8 + (linhas.length ? linhas.length * ALTURA_LINHA_BARRA : 8);
  const barrasH = (x, yy, w, titulo, sub, linhas, cor) => {
    let cy = yy + tituloBloco(x, yy, w, titulo, sub);
    if (!linhas.length) return vazio(x, cy);
    const larguraRotulo = Math.min(w * 0.5, 70);
    const larguraValor = 14;
    const area = w - larguraRotulo - larguraValor - 2;
    const max = Math.max(...linhas.map(l => l.valor), 1);
    for (const l of linhas) {
      fonte(7.5, 'normal', COR.text2);
      escrever(caber(l.rotulo, larguraRotulo - 2), x + larguraRotulo - 2, cy + 4, { align: 'right' });
      const bw = (l.valor / max) * area;
      if (bw > 0) caixa(x + larguraRotulo, cy + 1.1, Math.max(bw, 0.6), 3.8, cor);
      fonte(7.5, 'bold', COR.text);
      escrever(l.texto ?? String(l.valor), x + larguraRotulo + bw + 1.5, cy + 4);
      cy += ALTURA_LINHA_BARRA;
    }
  };

  // Barras verticais (série no tempo)
  const ALTURA_GRAFICO = 48;
  const barrasV = (x, yy, w, titulo, sub, barras, cor) => {
    const cy = yy + tituloBloco(x, yy, w, titulo, sub);
    if (!barras.length) return vazio(x, cy);
    const eixo = 9;
    const px = x + eixo;
    const pw = w - eixo;
    const ph = ALTURA_GRAFICO - 8;
    const base = cy + 2 + ph;
    const { passo, marcas, teto } = escalaEixo(Math.max(...barras.map(b => b.quantidade)));
    pdf.setLineWidth(0.15);
    for (let i = 0; i <= marcas; i++) {
      const gy = base - (ph * i) / marcas;
      pdf.setDrawColor(...(i === 0 ? COR.border2 : COR.border));
      pdf.line(px, gy, px + pw, gy);
      fonte(6.5, 'normal', COR.muted);
      escrever(formatarNumero(passo * i), px - 1.5, gy + 1, { align: 'right' });
    }
    const slot = pw / barras.length;
    const bw = Math.max(Math.min(slot * 0.7, 14), 0.4);
    const passoRotulo = Math.max(1, Math.ceil(9 / slot)); // rótulo a cada N barras para não encavalar
    barras.forEach((b, i) => {
      const cx = px + slot * i + slot / 2;
      const h = (b.quantidade / teto) * ph;
      if (h > 0) caixa(cx - bw / 2, base - h, bw, h, cor);
      if (b.quantidade > 0 && slot >= 3.2) {
        fonte(slot >= 6 ? 6.5 : 5.5, 'bold', COR.text2);
        escrever(String(b.quantidade), cx, base - h - 1, { align: 'center' });
      }
      if (i % passoRotulo === 0) {
        fonte(6.5, 'normal', COR.text2);
        escrever(b.rotulo, cx, base + 4, { align: 'center' });
      }
    });
  };

  // Mapa de calor dia da semana × hora
  const alturaMapa = (mapa) => 8 + 6 + mapa.dias.length * 6.4 + 2;
  const mapaCalor = (x, yy, w, titulo, sub, mapa) => {
    let cy = yy + tituloBloco(x, yy, w, titulo, sub);
    const rot = 11;
    const cw = (w - rot) / mapa.horas.length;
    const ch = 6;
    fonte(6.5, 'bold', COR.muted);
    mapa.horas.forEach((h, i) => escrever(`${String(h).padStart(2, '0')}h`, x + rot + cw * i + cw / 2, cy + 4, { align: 'center' }));
    cy += 6;
    for (const d of mapa.dias) {
      fonte(7.5, 'bold', COR.text2);
      escrever(d.dia, x, cy + 4.2);
      d.valores.forEach((v, i) => {
        const t = mapa.maximo ? v / mapa.maximo : 0;
        caixa(x + rot + cw * i + 0.2, cy + 0.2, cw - 0.4, ch, v ? misturar(COR.blue, 0.12 + 0.88 * t) : COR.panel2);
        if (v) {
          fonte(cw >= 8 ? 7 : 6, 'bold', t > 0.5 ? COR.branco : COR.navy);
          escrever(String(v), x + rot + cw * i + cw / 2, cy + 4.2, { align: 'center' });
        }
      });
      cy += ch + 0.4;
    }
  };

  // Dois blocos lado a lado (mesma linha); cada um { altura, desenhar(x, y, w) }
  const META = (LARGURA - 8) / 2;
  const lado = (esq, dir) => {
    const altura = Math.max(esq.altura, dir?.altura || 0);
    garantir(altura);
    esq.desenhar(MARGEM, y, META);
    if (dir) dir.desenhar(MARGEM + META + 8, y, META);
    y += altura + ESPACO;
  };
  const inteiro = (bloco) => {
    garantir(bloco.altura);
    bloco.desenhar(MARGEM, y, LARGURA);
    y += bloco.altura + ESPACO;
  };
  const blocoBarrasH = (titulo, sub, linhas, cor) => ({
    altura: alturaBarrasH(linhas), desenhar: (x, yy, w) => barrasH(x, yy, w, titulo, sub, linhas, cor),
  });

  // ----------------------------------------------------------- cabeçalho
  const r = rel.resumo;
  fonte(18, 'bold', COR.navy);
  escrever('Relatório de Empréstimos', MARGEM, y + 6);
  fonte(7.5, 'normal', COR.muted);
  escrever(`Gerado em ${formatarDataHora(geradoEm)}`, MARGEM + LARGURA, y + 2.5, { align: 'right' });
  if (geradoPor) escrever(caber(`por ${geradoPor}`, 70), MARGEM + LARGURA, y + 6, { align: 'right' });
  fonte(10, 'normal', COR.text2);
  escrever([predioNome, pontoNome].filter(Boolean).join('  ·  '), MARGEM, y + 13);
  fonte(10, 'bold', COR.text);
  escrever(`Período: ${rel.periodo.texto}`, MARGEM, y + 19);
  pdf.setDrawColor(...COR.navy);
  pdf.setLineWidth(0.6);
  pdf.line(MARGEM, y + 23, MARGEM + LARGURA, y + 23);
  y += 29;

  // ---------------------------------------------------------------- KPIs
  const cartoes = [
    ['Retiradas', formatarNumero(r.retiradas), 'no período', COR.blue],
    ['Alunos únicos', formatarNumero(r.alunos), `${formatarNumero(r.alunosRecorrentes)} voltaram mais de uma vez`, COR.green],
    ['Média por aluno', formatarNumero(r.mediaPorAluno, 1), 'retiradas por aluno', COR.purple],
    ['Tempo típico de uso', r.duracaoMediana == null ? '--' : formatarDuracao(Math.round(r.duracaoMediana)), `mediana · ${formatarHoras(r.minutosTotais)} somadas`, COR.amber],
    ['Com problema', formatarNumero(r.comProblema), 'devoluções com problema', r.comProblema ? COR.red : COR.muted],
    ['Itens usados', `${formatarNumero(r.itensUsados)} de ${formatarNumero(r.itensNoAcervo)}`, 'do acervo saíram no período', COR.navy],
  ];
  const kw = (LARGURA - 2 * 3) / 3;
  const kh = 18;
  cartoes.forEach(([rotulo, valor, sub, cor], i) => {
    const kx = MARGEM + (i % 3) * (kw + 3);
    const ky = y + Math.floor(i / 3) * (kh + 3);
    caixa(kx, ky, kw, kh, COR.panel2, COR.border);
    fonte(6.5, 'bold', COR.muted);
    escrever(rotulo.toUpperCase(), kx + 3, ky + 5);
    fonte(15, 'bold', cor);
    escrever(valor, kx + 3, ky + 12);
    fonte(6.3, 'normal', COR.muted);
    escrever(caber(sub, kw - 6), kx + 3, ky + 16);
  });
  y += 2 * kh + 3 + ESPACO + 1;

  // ------------------------------------------------- gráficos e tabelas
  const desenharCorpo = () => {
    inteiro({
      altura: 8 + ALTURA_GRAFICO,
      desenhar: (x, yy, w) => barrasV(x, yy, w, rel.serie.titulo, `${formatarNumero(r.retiradas)} retiradas no período`, rel.serie.barras, COR.blue),
    });

    const total = r.retiradas || 1;
    const pct = (q) => `${formatarNumero(q)} (${formatarNumero((q / total) * 100)}%)`;
    const porCategoria = blocoBarrasH('Retiradas por categoria', null, rel.porCategoria.map(c => ({ rotulo: c.nome, valor: c.quantidade, texto: pct(c.quantidade) })), COR.purple);
    if (rel.variosPontos) {
      lado(blocoBarrasH('Retiradas por ponto de empréstimo', null, rel.porPonto.map(p => ({ rotulo: p.nome, valor: p.quantidade, texto: pct(p.quantidade) })), COR.purple), porCategoria);
    } else {
      inteiro(porCategoria);
    }
    lado(
      blocoBarrasH('Itens mais retirados', 'top 10, vezes', rel.itensMaisRetirados.map(i => ({ rotulo: i.nome, valor: i.quantidade })), COR.blue),
      blocoBarrasH('Itens com maior tempo de uso', 'top 10, horas somadas', rel.itensMaisTempo.map(i => ({ rotulo: i.nome, valor: i.minutos, texto: formatarHoras(i.minutos) })), COR.amber),
    );
    inteiro({
      altura: alturaMapa(rel.mapaCalor),
      desenhar: (x, yy, w) => mapaCalor(x, yy, w, 'Retiradas por dia da semana e horário', r.pico ? `pico: ${r.pico}` : null, rel.mapaCalor),
    });
    lado(
      blocoBarrasH('Tempo de uso', `${formatarNumero(r.devolvidas)} devoluções`, r.devolvidas ? rel.faixasDuracao.map(f => ({ rotulo: f.rotulo, valor: f.quantidade })) : [], COR.green),
      blocoBarrasH('Frequência dos alunos', 'quantas vezes cada um retirou', r.alunos ? rel.frequenciaAlunos.map(f => ({ rotulo: f.rotulo, valor: f.quantidade, texto: `${f.quantidade} aluno${f.quantidade === 1 ? '' : 's'}` })) : [], COR.purple),
    );

    // Itens sem retirada: lista corrida em duas colunas
    if (r.itensNoAcervo) {
      const sem = rel.itensSemUso;
      const linhasLista = Math.ceil(sem.length / 2);
      inteiro({
        altura: 8 + (sem.length ? linhasLista * 5 : 6),
        desenhar: (x, yy, w) => {
          const cy = yy + tituloBloco(x, yy, w, 'Itens sem nenhuma retirada no período', `${sem.length} de ${r.itensNoAcervo} do acervo`);
          if (!sem.length) { fonte(8, 'italic', COR.muted); escrever('Todos os itens do acervo saíram pelo menos uma vez.', x, cy + 4); return; }
          sem.forEach((item, i) => {
            const col = i < linhasLista ? 0 : 1;
            const lin = i < linhasLista ? i : i - linhasLista;
            fonte(7.5, 'normal', COR.text2);
            escrever(caber(`${item.nome} - ${item.categoria}${rel.variosPontos ? ` (${item.ponto})` : ''}`, w / 2 - 4), x + col * (w / 2), cy + 4 + lin * 5);
          });
        },
      });
    }
  };

  // Período vazio: só o cabeçalho, os cartões e o aviso (sem páginas de "nenhum registro")
  if (r.retiradas) {
    desenharCorpo();
  } else {
    fonte(10, 'italic', COR.muted);
    escrever('Nenhuma retirada registrada neste período.', MARGEM, y + 4);
  }

  // --------------------------------------------------------------- rodapé
  const paginas = pdf.getNumberOfPages();
  const rodape = textoPdf(`Relatório de Empréstimos  ·  ${[predioNome, pontoNome].filter(Boolean).join('  ·  ')}  ·  ${rel.periodo.texto}`);
  for (let p = 1; p <= paginas; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(...COR.border);
    pdf.setLineWidth(0.2);
    pdf.line(MARGEM, PAGINA_A - 12, MARGEM + LARGURA, PAGINA_A - 12);
    fonte(7, 'normal', COR.muted);
    pdf.text(caber(rodape, LARGURA - 30), MARGEM, PAGINA_A - 8);
    pdf.text(`Página ${p} de ${paginas}`, MARGEM + LARGURA, PAGINA_A - 8, { align: 'right' });
  }
  return pdf;
};
