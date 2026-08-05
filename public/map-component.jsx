// Simple India outline SVG map for visual reference in map questions
// This renders a basic India outline with ability to highlight states, rivers, locations

function IndiaMapSVG({ mapData }) {
    if (!mapData) return null;

    // Basic India outline points (simplified)
    const indiaPath = "M 180,50 L 200,45 220,55 240,48 260,52 280,60 290,70 295,85 300,100 305,120 298,135 290,145 285,160 280,175 285,190 290,205 295,220 300,235 295,250 285,260 275,270 270,285 275,300 280,315 285,330 280,345 270,355 260,360 250,370 245,385 240,395 235,380 225,370 215,375 205,390 200,400 195,410 190,405 185,395 180,385 175,370 165,360 155,350 145,345 140,335 135,320 130,305 128,290 125,275 120,260 115,245 112,230 110,215 112,200 115,185 118,170 122,155 128,140 135,125 140,115 148,105 155,95 162,82 170,68 175,55 Z";

    // Key locations on the simplified map
    const locations = {
        'Delhi': { x: 175, y: 140 },
        'Mumbai': { x: 135, y: 265 },
        'Chennai': { x: 220, y: 340 },
        'Kolkata': { x: 265, y: 225 },
        'Bengaluru': { x: 185, y: 335 },
        'Hyderabad': { x: 190, y: 290 },
        'Ahmedabad': { x: 130, y: 210 },
        'Shimla': { x: 175, y: 110 },
        'Srinagar': { x: 160, y: 70 },
        'Jaipur': { x: 155, y: 170 },
        'Bhopal': { x: 175, y: 220 },
        'Lucknow': { x: 210, y: 175 },
        'Guwahati': { x: 290, y: 175 },
        'Thiruvananthapuram': { x: 185, y: 390 },
        'Amarkantak': { x: 200, y: 225 },
        'Trimbakeshwar': { x: 145, y: 260 },
    };

    const renderPoints = () => {
        if (mapData.points) {
            return mapData.points.map((p, i) => {
                const loc = locations[p.name] || { x: 150 + (i * 30), y: 150 + (i * 40) };
                return (
                    <g key={i}>
                        <circle cx={loc.x} cy={loc.y} r="5" fill="#f97316" stroke="#fff" strokeWidth="1.5" />
                        <text x={loc.x + 8} y={loc.y + 4} fill="#eab308" fontSize="10" fontWeight="bold">{p.name}</text>
                    </g>
                );
            });
        }
        return null;
    };

    return (
        <div style={{ textAlign: 'center', margin: '16px 0', padding: '12px', background: '#0a1628', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
            <svg viewBox="80 30 260 400" width="280" height="350" style={{ maxWidth: '100%' }}>
                {/* India outline */}
                <path d={indiaPath} fill="#1e293b" stroke="#3b82f6" strokeWidth="1.5" />
                {/* Tropic of Cancer */}
                <line x1="90" y1="220" x2="320" y2="220" stroke="#eab308" strokeWidth="0.5" strokeDasharray="4,4" opacity="0.5" />
                <text x="92" y="216" fill="#eab308" fontSize="7" opacity="0.7">Tropic of Cancer</text>
                {/* Points */}
                {renderPoints()}
                {/* Map type label */}
                <text x="150" y="420" fill="#64748b" fontSize="9" textAnchor="middle">
                    {mapData.type === 'river' ? `🌊 River: ${mapData.highlight}` : ''}
                    {mapData.type === 'state' ? `📍 State: ${mapData.highlight}` : ''}
                    {mapData.type === 'locations' ? '📍 Locations shown on map' : ''}
                </text>
            </svg>
            {mapData.note && <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '4px' }}>{mapData.note}</p>}
        </div>
    );
}

window.IndiaMapSVG = IndiaMapSVG;
