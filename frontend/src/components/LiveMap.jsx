import { useEffect, useState } from 'react';

export default function LiveMap() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  // Lógica para definir o período atual (exemplo simplificado)
  const getCurrentPeriod = () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    // Horários baseados no seu HTML original
    if (totalMinutes >= 480 && totalMinutes < 525) return 'A';
    if (totalMinutes >= 525 && totalMinutes < 570) return 'B';
    if (totalMinutes >= 585 && totalMinutes < 630) return 'C';
    // ... adicione os demais períodos conforme necessário
    return 'L'; // Exemplo padrão
  };

  useEffect(() => {
    const period = getCurrentPeriod();
    const day = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(new Date());
    const capitalizedDay = day.charAt(0).toUpperCase() + day.slice(1);

    fetch(`${import.meta.env.VITE_API_URL}/api/grade`)
      .then(res => res.json())
      .then(data => {
        // Filtra o que está acontecendo agora no Prédio 15
        const currentClasses = data.filter(d => 
          d.dia_semana === capitalizedDay && d.periodo === period
        );
        setRooms(currentClasses);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="empty-st">Carregando planta...</div>;

  return (
    <div className="map-main">
      <div className="fl-sec">
        <div className="fl-lbl">1º Andar</div>
        <div className="room-grid">
          {/* Aqui mapeamos as salas conforme a lógica do seu CSS original */}
          <div className="room-tile free">
            <div className="rt-n">101</div>
            <div className="rt-s">Livre</div>
            <div className="rt-c">—</div>
          </div>
          {/* Adicionar lógica para iterar sobre salas reais do banco */}
        </div>
      </div>
    </div>
  );
}