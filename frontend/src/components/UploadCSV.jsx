import { useState } from 'react';

export default function UploadCSV({ onUploadSuccess }) {
  const [loading, setLoading] = useState(false);

  // A mesma função robusta que você já usava no HTML
  const parseCSV = (txt) => {
    const lines = txt.trim().split(/\r?\n/);
    const hdr = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = []; let c = '', q = false;
      for (const ch of lines[i]) {
        if (ch === '"') { q = !q; }
        else if (ch === ',' && !q) { parts.push(c); c = ''; }
        else c += ch;
      }
      parts.push(c);
      if (parts.every(p => !p.trim())) continue;
      const o = {}; hdr.forEach((h, j) => o[h] = (parts[j] || '').trim());
      if (o['Sala']) rows.push(o);
    }
    return rows;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const parsedData = parseCSV(ev.target.result);
      
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/importar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsedData)
        });
        
        if (response.ok) {
          alert('✅ Grade atualizada com sucesso no banco de dados!');
          onUploadSuccess(); // Aciona a recarga do Dashboard
        } else {
          alert('❌ Erro ao importar os dados no servidor.');
        }
      } catch (error) {
        console.error('Erro:', error);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  return (
    <div style={{ 
      marginTop: '20px', padding: '24px', background: '#f7f5f2', 
      border: '2px dashed #1c2b4a', borderRadius: '8px', textAlign: 'center' 
    }}>
      <h3 style={{ color: '#1c2b4a', marginBottom: '8px' }}>Atualizar Grade de Salas</h3>
      <p style={{ fontSize: '14px', color: '#7a756c', marginBottom: '16px' }}>
        Selecione o arquivo <b>.csv</b> exportado do sistema acadêmico.
      </p>
      <input 
        type="file" 
        accept=".csv" 
        onChange={handleFileUpload} 
        disabled={loading}
        style={{ cursor: 'pointer' }}
      />
      {loading && <p style={{ marginTop: '12px', color: '#c8973a', fontWeight: 'bold' }}>Sincronizando com o banco de dados. Aguarde...</p>}
    </div>
  );
}