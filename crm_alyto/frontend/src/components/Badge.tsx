import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'primary', size = 'md' }) => {
  const styles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: '#0B1E36', color: '#FFFFFF' },
    accent: { backgroundColor: '#F3D014', color: '#0B1E36', fontWeight: 700 },
    success: { backgroundColor: '#E8F7EE', color: '#0E8345', border: '1px solid #B8E5CA' },
    warning: { backgroundColor: '#FEF3C7', color: '#D97706', border: '1px solid #FCD34D' },
    danger: { backgroundColor: '#FEE2E2', color: '#C5221F', border: '1px solid #FCA5A5' },
    info: { backgroundColor: '#E0EBF7', color: '#1E3653', border: '1px solid #BED6EE' }
  };

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    borderRadius: '9999px',
    padding: size === 'sm' ? '2px 8px' : '4px 10px',
    fontSize: size === 'sm' ? '11px' : '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    ...styles[variant]
  };

  return <span style={baseStyle}>{children}</span>;
};
