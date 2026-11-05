// Estilos dos modais de troca de sala (painel da aula, formulário, lista) —
// os mesmos valores do modal antigo da Linha do tempo, num lugar só.
export const OVERLAY = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
};
export const CARTAO = {
  background: 'var(--panel)', padding: '30px', borderRadius: '12px', width: '500px', maxWidth: 'calc(100vw - 32px)',
  maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxSizing: 'border-box',
  border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
};
export const ROTULO = { fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)', display: 'block', marginBottom: '5px' };
export const CAMPO = {
  width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
};
export const BOTAO = {
  padding: '10px 16px', background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)',
  borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
};
export const BOTAO_PRIMARIO = { ...BOTAO, background: 'var(--blue)', color: '#fff', border: '1px solid var(--blue)' };
export const BOTAO_PERIGO = { ...BOTAO, background: 'var(--red-b)', color: 'var(--red)', border: '1px solid rgba(160, 40, 40, 0.2)' };
export const BOTAO_PEQUENO = { padding: '5px 10px', fontSize: '12px' };
