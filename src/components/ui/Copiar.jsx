import { Copy } from 'lucide-react';
import { useUI } from '../../contexts/UIContext';

// Valor clicável (tel:/mailto:) + botão de copiar — no balcão o mais comum é
// copiar o ramal/e-mail para colar no telefone ou no Outlook.
export default function Copiar({ valor, href }) {
  const { toast } = useUI();
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      toast.success(`${valor} copiado.`);
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e use Ctrl C.');
    }
  };
  return (
    <span className="copia">
      {href ? <a className="mono" href={href}>{valor}</a> : <span className="mono">{valor}</span>}
      <button type="button" className="icon-btn" onClick={copiar} aria-label={`Copiar ${valor}`} title="Copiar"><Copy size={14} /></button>
    </span>
  );
}
