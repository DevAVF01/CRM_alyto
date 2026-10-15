import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(11, 30, 54, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(3px)',
      padding: '16px'
    }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        maxWidth: '560px',
        width: '100%',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
        overflow: 'hidden'
      }}>
        <div style={{
          backgroundColor: '#0B1E36',
          color: '#FFFFFF',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, letterSpacing: '0.02em' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8FA6C3',
              fontSize: '20px',
              cursor: 'pointer',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: '24px' }}>
          {children}
        </div>
      </div>
    </div>
  );
};
