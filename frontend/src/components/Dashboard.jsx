import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import UploadCSV from './UploadCSV'

export default function Dashboard({ session }) {
  const [grade, setGrade] = useState([])

  const fetchGrade = () => {
    fetch(`${import.meta.env.VITE_API_URL}/api/grade`)
      .then(res => res.json())
      .then(data => setGrade(data))
      .catch(err => console.error("Erro ao buscar grade:", err))
  }

  // Busca inicial
  useEffect(() => {
    fetchGrade()
  }, [])

  return (
    <div style={{ padding: '30px', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #c8973a', paddingBottom: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ color: '#1c2b4a', margin: 0 }}>PUCRS · Secretaria Prédio 15</h2>
          <small style={{ color: '#7a756c' }}>Logado como: {session.user.email}</small>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ background: '#a02828', color: '#fff', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
          Sair
        </button>
      </header>
      
      {/* Componente que acabamos de criar */}
      <UploadCSV onUploadSuccess={fetchGrade} />

      <h3 style={{ marginTop: '30px', color: '#1c2b4a' }}>Prévia do Banco de Dados ({grade.length} registros)</h3>
      
      {grade.length === 0 ? <p style={{ color: '#7a756c' }}>O banco de dados está vazio. Faça o upload do CSV acima.</p> : (
        <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #d8d3cb', borderRadius: '8px', padding: '16px' }}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {grade.slice(0, 50).map((aula) => ( // Mostrando só os 50 primeiros para não travar a tela
              <li key={aula.id} style={{ padding: '8px 0', borderBottom: '1px solid #e8e4de', fontSize: '14px' }}>
                <strong style={{ color: '#1e6b40' }}>Sala {aula.salas?.numero}</strong> | {aula.dia_semana} ({aula.periodo}): {aula.nome_aula}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}