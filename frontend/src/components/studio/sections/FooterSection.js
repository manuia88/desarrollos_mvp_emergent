// W5.22 Z.8.3 — Footer · theme-driven (default / minimal)
import React from 'react';

export default function FooterSection({ config = {}, brandKit = {}, theme = {} }) {
  const palette = theme.palette || {};
  const typography = theme.typography || {};
  const sectionVariants = theme.section_variants || {};
  const variant = config.variant || sectionVariants.footer || 'default';

  const showSocial = config.show_social !== false;
  const showContact = config.show_contact !== false;
  const showDisclaimer = config.show_disclaimer !== false;
  const social = config.social || { whatsapp: '', instagram: '', linkedin: '' };
  const contact = config.contact || { email: '', phone: '', address: '' };
  const disclaimer = brandKit.disclaimer_text || 'Renders ilustrativos. Especificaciones sujetas a cambio sin previo aviso.';
  const footerLegal = brandKit.footer_legal || 'DesarrollosMX (c) 2026';

  const themePrimary = palette.primary || '#6366F1';
  const text = palette.text || '#F0EBE0';
  const textDim = palette.text_dim || 'rgba(240,235,224,0.5)';
  const headingFont = typography.heading_font || "'Outfit', sans-serif";
  const bodyFont = typography.body_font || "'DM Sans', sans-serif";

  if (variant === 'minimal') {
    return (
      <footer data-testid="sec-footer-minimal" data-variant={variant} style={{ padding: '60px 24px 32px', borderTop: `1px solid ${themePrimary}33`, color: text, fontFamily: bodyFont, textAlign: 'center' }}>
        {brandKit.logo_url ? <img src={brandKit.logo_url} alt="logo" style={{ maxHeight: 32, marginBottom: 14 }} /> : <strong style={{ fontFamily: headingFont, fontSize: 18, letterSpacing: '0.15em' }}>DESARROLLOSMX</strong>}
        {showDisclaimer && <p style={{ fontSize: 11, color: textDim, marginTop: 14, lineHeight: 1.6, maxWidth: 640, margin: '14px auto 0' }}>{disclaimer}</p>}
        <div style={{ marginTop: 32, paddingTop: 18, borderTop: `1px solid ${themePrimary}22`, fontSize: 11, color: textDim, letterSpacing: '0.15em' }}>{footerLegal}</div>
      </footer>
    );
  }

  return (
    <footer data-testid="sec-footer" data-variant={variant} style={{ padding: '3rem 1.5rem 2rem', background: 'rgba(13,16,23,0.92)', borderTop: `1px solid ${themePrimary}33`, color: text, fontFamily: bodyFont }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
        <div>
          {brandKit.logo_url ? <img src={brandKit.logo_url} alt="logo" style={{ maxHeight: 40, marginBottom: 12 }} /> : <strong style={{ fontFamily: headingFont, fontSize: 20 }}>DesarrollosMX</strong>}
          {showDisclaimer && <p style={{ fontSize: 12, color: textDim, marginTop: 8, lineHeight: 1.5 }}>{disclaimer}</p>}
        </div>
        {showContact && (
          <div>
            <h4 style={{ margin: '0 0 12px', fontFamily: headingFont, fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase', color: textDim }}>Contacto</h4>
            <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              {contact.email && <a href={`mailto:${contact.email}`} style={{ color: 'inherit', textDecoration: 'none' }}>{contact.email}</a>}
              {contact.phone && <a href={`tel:${contact.phone}`} style={{ color: 'inherit', textDecoration: 'none' }}>{contact.phone}</a>}
              {contact.address && <span>{contact.address}</span>}
            </div>
          </div>
        )}
        {showSocial && (
          <div>
            <h4 style={{ margin: '0 0 12px', fontFamily: headingFont, fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase', color: textDim }}>Sigue</h4>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
              {social.whatsapp && <a href={`https://wa.me/${social.whatsapp}`} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>WhatsApp</a>}
              {social.instagram && <a href={`https://instagram.com/${social.instagram}`} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>Instagram</a>}
              {social.linkedin && <a href={`https://linkedin.com/in/${social.linkedin}`} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>LinkedIn</a>}
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', fontSize: 12, color: textDim }}>{footerLegal}</div>
    </footer>
  );
}
