// W5.22 Z.8.2 — Footer: logo brand_kit + social + contact + disclaimer
import React from 'react';

export default function FooterSection({ config = {}, brandKit = {} }) {
  const showSocial = config.show_social !== false;
  const showContact = config.show_contact !== false;
  const showDisclaimer = config.show_disclaimer !== false;
  const social = config.social || { whatsapp: '', instagram: '', linkedin: '' };
  const contact = config.contact || { email: '', phone: '', address: '' };
  const disclaimer = brandKit.disclaimer_text || 'Renders ilustrativos. Especificaciones sujetas a cambio sin previo aviso.';
  const footerLegal = brandKit.footer_legal || 'DesarrollosMX (c) 2026';

  return (
    <footer data-testid="sec-footer" style={{ padding: '3rem 1.5rem 2rem', background: 'rgba(13,16,23,0.92)', borderTop: '1px solid rgba(99,102,241,0.18)', color: 'rgba(240,235,224,0.82)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
        <div>
          {brandKit.logo_url ? <img src={brandKit.logo_url} alt="logo" style={{ maxHeight: 40, marginBottom: 12 }} /> : <strong style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20 }}>DesarrollosMX</strong>}
          {showDisclaimer && <p style={{ fontSize: 12, color: 'rgba(240,235,224,0.5)', marginTop: 8, lineHeight: 1.5 }}>{disclaimer}</p>}
        </div>
        {showContact && (
          <div>
            <h4 style={{ margin: '0 0 12px', fontFamily: 'Outfit, sans-serif', fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a0a4b0' }}>Contacto</h4>
            <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              {contact.email && <a href={`mailto:${contact.email}`} style={{ color: 'inherit', textDecoration: 'none' }}>{contact.email}</a>}
              {contact.phone && <a href={`tel:${contact.phone}`} style={{ color: 'inherit', textDecoration: 'none' }}>{contact.phone}</a>}
              {contact.address && <span>{contact.address}</span>}
            </div>
          </div>
        )}
        {showSocial && (
          <div>
            <h4 style={{ margin: '0 0 12px', fontFamily: 'Outfit, sans-serif', fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a0a4b0' }}>Sigue</h4>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
              {social.whatsapp && <a href={`https://wa.me/${social.whatsapp}`} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>WhatsApp</a>}
              {social.instagram && <a href={`https://instagram.com/${social.instagram}`} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>Instagram</a>}
              {social.linkedin && <a href={`https://linkedin.com/in/${social.linkedin}`} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>LinkedIn</a>}
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', fontSize: 12, color: 'rgba(240,235,224,0.5)' }}>{footerLegal}</div>
    </footer>
  );
}
