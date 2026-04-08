import { useState } from 'react';
import { usePredio } from '../contexts/PredioContext'; // 1. Importe o contexto

export default function UploadCSV({ session, acesso, onUploadSuccess }) {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    
    const { predioAtivo } = usePredio(); 

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const idParaUpload = predioAtivo || acesso?.predioId;
        if (!idParaUpload) {
            setMessage('Erro: Selecione um prédio no menu superior antes de fazer o upload.');
            e.target.value = null; // Reseta o input file
            return;
        }

        setLoading(true);
        setMessage('Lendo PDF e atualizando banco de dados...');

        const formData = new FormData();
        formData.append('arquivo', file);

        const headers = {
            'Authorization': `Bearer ${session?.access_token}`,
            'x-predio-id': idParaUpload // Manda o ID selecionado ou o ID fixo do Magril
        };

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/grade/importar-pdf`, {
                method: 'POST',
                headers: headers,
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Erro no servidor ou permissão negada');
            }

            const data = await res.json();
            setMessage(`Sucesso! ${data.registrosInseridos} aulas inseridas na base.`);
            if (onUploadSuccess) onUploadSuccess();

        } catch (error) {
            setMessage(`Erro: ${error.message}`);
        } finally {
            setLoading(false);
            e.target.value = null;
        }
    };

    return (
        <div className="bar-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <h2>Atualização de Grade</h2>
            <p style={{ color: 'var(--text2)', marginBottom: '20px' }}>
                Selecione o arquivo da agenda gerado pelo sistema central em formato <b>.pdf</b>
            </p>
            
            <input 
                type="file" 
                accept=".pdf" 
                id="pdfUpload" 
                hidden 
                onChange={handleUpload} 
                disabled={loading} 
            />
            
            <button 
                className="btn-primary" 
                onClick={() => document.getElementById('pdfUpload').click()}
                disabled={loading}
            >
                {loading ? 'Processando PDF...' : 'Selecionar Arquivo PDF'}
            </button>

            {message && (
                <div style={{ marginTop: '20px', fontWeight: 'bold', color: message.includes('Erro') ? 'var(--red)' : 'var(--accent)' }}>
                    {message}
                </div>
            )}
        </div>
    );
}