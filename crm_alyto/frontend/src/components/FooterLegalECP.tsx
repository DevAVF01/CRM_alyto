import React from 'react';

export const FooterLegalECP: React.FC = () => {
  return (
    <footer style={{
      backgroundColor: '#0B1E36',
      borderTop: '2px solid #F3D014',
      padding: '12px 24px',
      color: '#FFFFFF',
      fontSize: '11px',
      textAlign: 'center',
      lineHeight: '1.5'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            backgroundColor: '#F3D014',
            color: '#0B1E36',
            fontWeight: 800,
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '3px'
          }}>
            ECP ASFI
          </span>
          <span style={{ color: '#DDE3EA' }}>
            AV Finance S.R.L. opera en el Entorno Controlado de Pruebas (ECP) bajo supervisión de ASFI.
          </span>
        </div>
        <div style={{ color: '#8FA6C3' }}>
          Solución de transferencias internacionales B2B con custodia institucional.
        </div>
      </div>
    </footer>
  );
};
