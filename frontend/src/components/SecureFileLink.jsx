import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2, X } from 'lucide-react';
import api from '../services/api';

export default function SecureFileLink({ label, url }) {
  const [fileUrl, setFileUrl] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  async function openFile() {
    setLoading(true);
    setError('');
    try {
      const fullUrl = new URL(url, 'http://localhost:5050');
      if (fullUrl.origin !== 'http://localhost:5050') {
        throw new Error('Only IMS-hosted files can be opened here.');
      }
      const response = await api.get(fullUrl.href, { responseType: 'blob' });
      const blob = response.data;
      setMimeType(blob.type || response.headers['content-type'] || '');
      setFileUrl(URL.createObjectURL(blob));
      setOpen(true);
    } catch (err) {
      setError(err.response?.data?.error || `Unable to open ${label.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }

  if (!url) return null;
  try {
    const remoteUrl = new URL(url);
    if (['http:', 'https:'].includes(remoteUrl.protocol) && remoteUrl.origin !== 'http://localhost:5050' && remoteUrl.username === '' && remoteUrl.password === '') {
      return <a href={remoteUrl.href} target="_blank" rel="noreferrer" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 10px', fontSize: '0.8rem' }}>{label}</a>;
    }
  } catch {
    // Relative IMS download paths are resolved against the backend origin on click.
  }
  return (
    <>
      <button type="button" onClick={openFile} disabled={loading} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 10px', fontSize: '0.8rem' }}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
        {label}
      </button>
      {error && <span role="alert" style={{ color: '#b91c1c', fontSize: '0.78rem' }}>{error}</span>}
      {open && (
        <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '20px' }}>
          <section role="dialog" aria-modal="true" aria-label={label} className="glass-card secure-file-dialog" style={{ width: '100%', maxWidth: '1000px', height: 'min(85vh, 900px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '14px 18px', borderBottom: '1px solid #dbeafe' }}>
              <strong style={{ color: '#0f172a' }}>{label}</strong>
              <div style={{ display: 'flex', gap: '8px' }}>
                <a href={fileUrl} download={label} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 10px', fontSize: '0.8rem' }}><Download size={14} /> Download</a>
                <button type="button" aria-label="Close file preview" onClick={() => setOpen(false)} className="btn-secondary" style={{ padding: '7px' }}><X size={16} /></button>
              </div>
            </header>
            {mimeType === 'application/pdf' ? (
              <iframe title={label} src={fileUrl} style={{ flex: 1, width: '100%', border: 0 }} />
            ) : mimeType.startsWith('text/') ? (
              <iframe title={label} src={fileUrl} style={{ flex: 1, width: '100%', border: 0, background: '#fff' }} />
            ) : (
              <p style={{ padding: '24px', color: '#475569' }}>This document type cannot be previewed in the browser. Use Download to view it.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
