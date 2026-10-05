import React from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  UsersRound
} from 'lucide-react';
import './Home.css';

const highlights = [
  {
    icon: Briefcase,
    title: 'Find the right opportunity',
    description: 'Explore internships that match your goals, interests, and next steps.'
  },
  {
    icon: ClipboardCheck,
    title: 'Keep every detail in sync',
    description: 'Bring applications, tasks, and important documents together in one place.'
  },
  {
    icon: UsersRound,
    title: 'Grow with your people',
    description: 'Stay connected with supervisors and make progress with clear feedback.'
  }
];

const steps = [
  { number: '01', title: 'Discover', description: 'Browse opportunities and find a placement that feels right.' },
  { number: '02', title: 'Get organized', description: 'Keep your application, schedule, and next steps close at hand.' },
  { number: '03', title: 'Make progress', description: 'Share updates, complete tasks, and celebrate how far you’ve come.' }
];

function WorkspacePreview() {
  return (
    <div className="home-preview-wrap" role="img" aria-label="A preview of the internship workspace, showing application progress and upcoming tasks">
      <div className="home-preview-orbit home-preview-orbit--one" aria-hidden="true" />
      <div className="home-preview-orbit home-preview-orbit--two" aria-hidden="true" />

      <div className="home-preview">
        <div className="home-preview__topbar">
          <div className="home-preview__brand">
            <span className="home-preview__brand-mark"><GraduationCap size={15} aria-hidden="true" /></span>
            <span>My workspace</span>
          </div>
          <span className="home-preview__avatar" aria-label="Your profile">JD</span>
        </div>

        <div className="home-preview__body">
          <div className="home-preview__welcome">
            <div>
              <span className="home-preview__eyebrow">YOUR INTERNSHIP JOURNEY</span>
              <h2>A great start, Eddy.</h2>
              <p>Here&apos;s what&apos;s happening this week.</p>
            </div>
            <span className="home-preview__sparkle"><Sparkles size={17} aria-hidden="true" /></span>
          </div>

          <div className="home-preview__stats">
            <div className="home-preview__stat">
              <span className="home-preview__stat-icon home-preview__stat-icon--blue"><FileCheck2 size={15} aria-hidden="true" /></span>
              <span className="home-preview__stat-label">Applications</span>
              <strong>03</strong>
              <span className="home-preview__stat-note">in progress</span>
            </div>
            <div className="home-preview__stat">
              <span className="home-preview__stat-icon home-preview__stat-icon--green"><CheckCircle2 size={15} aria-hidden="true" /></span>
              <span className="home-preview__stat-label">Tasks completed</span>
              <strong>08</strong>
              <span className="home-preview__stat-note">nice momentum</span>
            </div>
          </div>

          <div className="home-preview__lower">
            <div className="home-preview__progress-card">
              <div className="home-preview__card-heading">
                <div>
                  <strong>Your progress</strong>
                  <span>A little progress adds up</span>
                </div>
                <span className="home-preview__trend"><ArrowUpRight size={14} aria-hidden="true" /> On track</span>
              </div>
              <div className="home-preview__chart" aria-hidden="true">
                {[32, 48, 40, 63, 54, 78, 68, 92, 80, 100, 86, 112].map((height, index) => (
                  <span key={index} style={{ height: `${height}px` }} />
                ))}
              </div>
              <div className="home-preview__chart-labels" aria-hidden="true"><span>Week 1</span><span>Week 4</span></div>
            </div>

            <div className="home-preview__next-card">
              <span className="home-preview__next-icon"><CalendarDays size={16} aria-hidden="true" /></span>
              <span className="home-preview__next-copy"><strong>Coming up</strong><span>Weekly check-in</span></span>
              <span className="home-preview__next-date">Thu</span>
            </div>
          </div>
        </div>
      </div>

      <div className="home-float-card home-float-card--check">
        <span><Check size={15} aria-hidden="true" /></span>
        <div><strong>Application sent</strong><small>One step closer</small></div>
      </div>
      <div className="home-float-card home-float-card--people" aria-hidden="true">
        <span className="home-float-card__avatar home-float-card__avatar--one">A</span>
        <span className="home-float-card__avatar home-float-card__avatar--two">M</span>
        <span className="home-float-card__avatar home-float-card__avatar--three">J</span>
        <small>Right here with you</small>
      </div>
    </div>
  );
}

export function Home({ onLogin, onRegister }) {
  return (
    <main className="public-home">
      <div className="home-shell">
        <header className="home-header">
          <a className="home-brand" href="#home" aria-label="Internship Hub home">
            <span className="home-brand__mark"><GraduationCap size={21} aria-hidden="true" /></span>
            <span>IMS</span>
          </a>
          <nav className="home-nav" aria-label="Public navigation">
            <a href="#opportunities">Opportunities</a>
            <a href="#how-it-works">How it works</a>
          </nav>
          <div className="home-header__auth-actions">
            <button type="button" className="home-header__login" onClick={onLogin}>Sign in</button>
            <button type="button" className="home-header__cta" onClick={onRegister}>
              Get started <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        <section className="home-hero" id="home">
          <div className="home-hero__copy">
            <div className="home-pill"><span aria-hidden="true" /> A clearer path to your future</div>
            <h1>Make your next chapter <span>count.</span></h1>
            <p className="home-hero__lede">
              Your internship journey, all in one place. Find opportunities, stay on top of every step, and build a future you&apos;re excited about.
            </p>
            <div className="home-hero__actions">
              <button type="button" className="home-button home-button--primary" onClick={onRegister}>
                Explore opportunities <ArrowRight size={17} aria-hidden="true" />
              </button>
              <a className="home-button home-button--secondary" href="#how-it-works">
                See how it works
              </a>
            </div>
            <div className="home-hero__assurance">
              <span className="home-hero__assurance-icon"><ShieldCheck size={16} aria-hidden="true" /></span>
              <span>A supportive space for students and supervisors</span>
            </div>
          </div>
          <WorkspacePreview />
        </section>

        <section className="home-benefits" id="opportunities" aria-labelledby="home-benefits-title">
          <div className="home-section-heading">
            <span className="home-kicker">A BETTER WAY TO GET THERE</span>
            <h2 id="home-benefits-title">Everything you need to move forward.</h2>
            <p>From your first search to your final reflection, feel supported at every step.</p>
          </div>
          <div className="home-feature-grid">
            {highlights.map(({ icon: Icon, title, description }, index) => (
              <article className="home-feature-card" key={title} style={{ '--feature-index': index }}>
                <span className="home-feature-card__icon"><Icon size={21} aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{description}</p>
                <span className="home-feature-card__arrow" aria-hidden="true"><ArrowRight size={17} /></span>
              </article>
            ))}
          </div>
        </section>

        <section className="home-journey" id="how-it-works" aria-labelledby="home-journey-title">
          <div className="home-journey__intro">
            <span className="home-kicker">SMALL STEPS, BIG THINGS</span>
            <h2 id="home-journey-title">A smoother journey, from day one.</h2>
            <p>Less time juggling details. More room to learn, connect, and do your best work.</p>
          </div>
          <div className="home-steps">
            {steps.map(({ number, title, description }, index) => (
              <article className="home-step" key={number} style={{ '--step-index': index }}>
                <span className="home-step__number">{number}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-cta" aria-labelledby="home-cta-title">
          <span className="home-cta__icon"><GraduationCap size={24} aria-hidden="true" /></span>
          <div>
            <h2 id="home-cta-title">Your next opportunity starts here.</h2>
            <p>Take the first step toward an experience that moves you forward.</p>
          </div>
          <button type="button" className="home-button home-button--light" onClick={onRegister}>
            Start exploring <ArrowRight size={17} aria-hidden="true" />
          </button>
        </section>

        <footer className="home-footer">
          <a className="home-brand home-brand--footer" href="#home">
            <span className="home-brand__mark"><GraduationCap size={18} aria-hidden="true" /></span>
            <span>IMS</span>
          </a>
          <p>Helping every next step feel a little more possible.</p>
        </footer>
      </div>
    </main>
  );
}

export default Home;
