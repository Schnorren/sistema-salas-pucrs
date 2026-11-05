// Sons curtos do balcão de empréstimos (Web Audio — sem arquivo de áudio).
// Confirmam que o leitor de crachá funcionou sem precisar olhar para a tela.
// Cada computador liga/desliga o seu (localStorage), como o nome do balcão.
const CHAVE = 'balcao_som';

export const somLigado = () => {
  try { return localStorage.getItem(CHAVE) !== 'off'; } catch { return true; }
};

export const definirSom = (ligado) => {
  try { localStorage.setItem(CHAVE, ligado ? 'on' : 'off'); } catch { /* modo privado */ }
};

// [frequência Hz, duração s] de cada nota
const SONS = {
  bip:  { tipo: 'sine',     notas: [[1046, 0.07]] },                 // crachá lido
  ok:   { tipo: 'sine',     notas: [[880, 0.08], [1318, 0.12]] },    // registrado
  erro: { tipo: 'triangle', notas: [[330, 0.14], [220, 0.22]] },     // recusado/falhou
};

let contexto = null;

export function tocarSom(nome) {
  if (!somLigado()) return;
  const som = SONS[nome];
  if (!som) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    contexto = contexto || new Ctx();
    if (contexto.state === 'suspended') contexto.resume();
    let t = contexto.currentTime;
    for (const [freq, dur] of som.notas) {
      const osc = contexto.createOscillator();
      const ganho = contexto.createGain();
      osc.type = som.tipo;
      osc.frequency.value = freq;
      ganho.gain.setValueAtTime(0.0001, t);
      ganho.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      ganho.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(ganho).connect(contexto.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur;
    }
  } catch { /* sem áudio: segue só com o aviso visual */ }
}
