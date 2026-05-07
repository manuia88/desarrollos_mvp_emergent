// Phase 14 · Batch 37 — InmobiliariaCrossPartnerships
// Reutiliza CrossPartnershipsPage con InmobiliariaLayout
import React from 'react';
import InmobiliariaLayout from '../../components/developer/InmobiliariaLayout';
import { CrossPartnershipsPage } from '../developer/DesarrolladorCrossPartnerships';

export default function InmobiliariaCrossPartnerships({ user, onLogout }) {
  return <CrossPartnershipsPage user={user} onLogout={onLogout} Layout={InmobiliariaLayout} portalName="Inmobiliaria" />;
}
