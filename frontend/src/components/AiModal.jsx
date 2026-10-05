import React from 'react';
import { Sparkles, X, CheckCircle2, Award, Zap, AlertCircle } from 'lucide-react';

export default function AiModal({ isOpen, onClose, title, type = 'report', data }) {
  if (!isOpen || !data) return null;

  const score = data.score || data.performance_score || 90;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5, 8, 18, 0.85)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }} className="animate-fade-in ai-modal-overlay">
      <div className="glass-card" style={{
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        overflowY: 'auto',
        border: '1px solid rgba(168, 85, 247, 0.3)',
        padding: '28px',
        boxShadow: '0 20px 50px rgba(139, 92, 246, 0.3)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', pb: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(236, 72, 153, 0.5)'
            }}>
              <Sparkles size={22} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
                {title || 'Gemini AI Intelligent Analysis'}
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#a855f7', fontWeight: 600 }}>
                Powered by Google Gemini 1.5 LLM Engine
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', padding: '8px', borderRadius: '50%' }}>
            <X size={20} />
          </button>
        </div>

        {/* Score & Summary Banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(168,85,247,0.15) 100%)',
          border: '1px solid rgba(168,85,247,0.25)',
          borderRadius: '16px',
          padding: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '24px'
        }}>
          <div style={{
            width: '85px', height: '85px', borderRadius: '50%',
            background: 'conic-gradient(#8b5cf6 calc(var(--score) * 1%), rgba(255,255,255,0.1) 0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
            '--score': score
          }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%', background: '#0f172a',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
            }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7' }}>{score}</span>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>/ 100</span>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Award size={18} color="#a855f7" />
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Performance Evaluation Summary</h4>
            </div>
            <p style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: '1.5' }}>
              {data.summary || data.ai_summary || data.ai_evaluation_summary || 'Analysis complete.'}
            </p>
          </div>
        </div>

        {/* Final Report Analysis Details */}
        {type === 'report' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {data.technical_depth && (
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={16} /> Technical Depth & Rigor
                </h5>
                <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.4' }}>{data.technical_depth}</p>
              </div>
            )}

            {data.key_achievements && (
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} /> Key Achievements Highlighted
                </h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {Array.isArray(data.key_achievements) ? data.key_achievements.map((item, idx) => (
                    <div key={idx} style={{ fontSize: '0.82rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#10b981' }}>•</span> {item}
                    </div>
                  )) : <p style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>{data.key_achievements}</p>}
                </div>
              </div>
            )}

            {data.feedback && (
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fbbf24', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={16} /> AI Feedback & Career Guidance
                </h5>
                <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.4' }}>{data.feedback}</p>
              </div>
            )}
          </div>
        )}

        {/* Supervisor Intern Evaluation Details */}
        {type === 'evaluation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} /> Core Technical & Behavioral Strengths
              </h5>
              <p style={{ fontSize: '0.85rem', color: '#e2e8f0', whitespace: 'pre-line', lineHeight: '1.5' }}>
                {data.strengths || data.ai_strengths}
              </p>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fbbf24', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={16} /> Development & Growth Recommendations
              </h5>
              <p style={{ fontSize: '0.85rem', color: '#e2e8f0', whitespace: 'pre-line', lineHeight: '1.5' }}>
                {data.improvement_areas || data.ai_improvement_areas}
              </p>
            </div>
          </div>
        )}

        {/* Action button */}
        <div style={{ marginTop: '24px', textAlign: 'right' }}>
          <button onClick={onClose} className="btn-primary">
            Close Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
