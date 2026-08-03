import { useEffect } from 'react'
import './landing.css'
import './legal-pages.css'

function useDocumentTitle(title) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title
    return () => {
      document.title = previousTitle
    }
  }, [title])
}

function PipaWordmark({ onHome }) {
  return (
    <a
      href="/"
      className="chirp-wordmark"
      aria-label="Pipa, back to home"
      onClick={(event) => {
        if (!onHome) return
        event.preventDefault()
        onHome()
      }}
    >
      <span aria-hidden="true">p</span>
      pipa!
    </a>
  )
}

function LegalShell({
  documentTitle,
  eyebrow,
  updatedLabel,
  onHome,
  siblingHref,
  siblingLabel,
  children,
}) {
  const sectionLinks = Array.from(children || []).map((child) => ({
    id: child.props.sectionId,
    label: child.props.title,
  }))

  return (
    <div className="legal-page">
      <div className="legal-page__sky" aria-hidden="true" />
      <header className="chirp-nav legal-page__nav">
        <PipaWordmark onHome={onHome} />
        <div className="chirp-nav__actions">
          <a href={siblingHref} className="chirp-nav__grownups">
            {siblingLabel}
          </a>
          <a
            href="/"
            className="chirp-nav__earlyBtn"
            onClick={(event) => {
              if (!onHome) return
              event.preventDefault()
              onHome()
            }}
          >
            Back home
          </a>
        </div>
      </header>

      <main className="legal-page__main">
        <header className="legal-page__intro">
          <div>
            <p className="legal-page__eyebrow">{eyebrow}</p>
            <h1>{documentTitle}</h1>
          </div>
          <div className="legal-page__promise">
            <strong>Made to be understood.</strong>
            <p>Plain language first, with clear boundaries around children, voice, and family data.</p>
            <span>{updatedLabel}</span>
          </div>
        </header>
        <div className="legal-page__layout">
          <aside className="legal-page__contents">
            <p>On this page</p>
            <nav aria-label={`${documentTitle} sections`}>
              {sectionLinks.map((sectionLink) => (
                <a key={sectionLink.id} href={`#${sectionLink.id}`}>{sectionLink.label}</a>
              ))}
            </nav>
          </aside>
          <div className="legal-page__body">
            {children}
          </div>
        </div>
      </main>

      <footer className="chirp-footer legal-page__footer">
        <PipaWordmark onHome={onHome} />
        <p>Home practice for speech sound disorders.</p>
        <nav className="chirp-footer__legal" aria-label="Legal">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms</a>
        </nav>
      </footer>
    </div>
  )
}

function LegalSection({ title, sectionId, children }) {
  return (
    <section className="legal-section" id={sectionId}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export function PrivacyPolicy({ onHome }) {
  useDocumentTitle('Privacy Policy · Pipa')
  return (
    <LegalShell
      documentTitle="Privacy Policy"
      eyebrow="Your nest stays private"
      updatedLabel="Last updated August 1, 2026"
      onHome={onHome}
      siblingHref="/terms"
      siblingLabel="Terms"
    >
      <LegalSection title="In plain words" sectionId="plain-words">
        <p>
          Pipa helps kids practice speech sounds at home. Parents run the nest.
          We collect only what we need to coach practice, show progress, and keep
          the product working — never to sell a child’s voice or story.
        </p>
      </LegalSection>

      <LegalSection title="Who this covers" sectionId="who-this-covers">
        <p>
          This policy covers pipa.app and related Pipa services for parents,
          children using Pipa with a parent’s account, and visitors who join the
          founding waitlist. If you are under 13, a parent or guardian must
          manage the account.
        </p>
      </LegalSection>

      <LegalSection title="What we collect" sectionId="what-we-collect">
        <ul>
          <li>
            <strong>Parent account.</strong> Email, sign-in details, and basic
            account settings.
          </li>
          <li>
            <strong>Child profile.</strong> Display name, practice goals, and
            progress the parent chooses to keep in the nest.
          </li>
          <li>
            <strong>Voice practice.</strong> Short audio turns and transcripts
            used to score sounds, coach, and show parents what happened in a
            session.
          </li>
          <li>
            <strong>Product use.</strong> Session timing, feature events, and
            device basics that help us fix bugs and keep Pipa reliable.
          </li>
          <li>
            <strong>Waitlist / founding seat.</strong> Parent email and Stripe
            payment status for the one-time founding seat. Card details are
            handled by Stripe — we do not store full card numbers.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="How we use voice" sectionId="voice">
        <p>
          Voice is for practice coaching and parent-visible progress. We score
          turns, may keep short session artifacts so parents (and, if you choose,
          an SLP) can review them, then discard recordings on the schedule we
          show in the nest. We do not sell voice data. We do not use a child’s
          voice to train unrelated public AI models.
        </p>
      </LegalSection>

      <LegalSection title="Who can see a child’s progress" sectionId="progress-access">
        <p>
          Parents signed into the nest. If you invite an SLP or share review
          access, that professional sees what you enable. Our service providers
          (hosting, auth, payments, speech tooling) process data only to run
          Pipa for you.
        </p>
      </LegalSection>

      <LegalSection title="Kids and parental consent" sectionId="parental-consent">
        <p>
          Pipa is built for home practice with a grown-up in charge. A parent or
          guardian creates the account, consents to practice features, and can
          delete child data from the nest. We do not ask children for parent
          emails or market to kids directly.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep things" sectionId="retention">
        <p>
          Account and progress data stay while the nest is active. Practice
          recordings follow the retention choice in the product (including
          shorter windows when you opt out of longer review storage). Waitlist
          and payment records are kept as needed for receipts, fraud prevention,
          and legal duties. You can ask us to delete what we can delete.
        </p>
      </LegalSection>

      <LegalSection title="Security" sectionId="security">
        <p>
          We use industry-standard protections for accounts and data in transit.
          No app is perfectly sealed — if something sensitive goes wrong, we will
          act quickly and tell affected parents when the law says we must.
        </p>
      </LegalSection>

      <LegalSection title="Your choices" sectionId="your-choices">
        <ul>
          <li>Update or delete child profiles in the nest.</li>
          <li>Ask us to export or erase account data we hold.</li>
          <li>Stop waitlist email by contacting us (founding seats are receipts, not newsletters).</li>
          <li>Turn off microphone access in the browser or device anytime.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Contact" sectionId="contact">
        <p>
          Privacy questions:{' '}
          <a href="mailto:hello@pipa.app?subject=Privacy">hello@pipa.app</a>
          . We read parent mail ourselves.
        </p>
      </LegalSection>
    </LegalShell>
  )
}

export function TermsOfUse({ onHome }) {
  useDocumentTitle('Terms of Use · Pipa')
  return (
    <LegalShell
      documentTitle="Terms of Use"
      eyebrow="The nest rules"
      updatedLabel="Last updated August 1, 2026"
      onHome={onHome}
      siblingHref="/privacy"
      siblingLabel="Privacy"
    >
      <LegalSection title="In plain words" sectionId="plain-words">
        <p>
          Pipa is home speech-sound practice with a playful coach. These terms
          are the agreement between you (the parent or guardian) and Pipa when
          you use the site, waitlist, or nest.
        </p>
      </LegalSection>

      <LegalSection title="Not a replacement for therapy" sectionId="not-therapy">
        <p>
          Pipa supports speech sound practice. It is not a medical device, not a
          diagnosis, and not a substitute for a licensed speech-language
          pathologist. If you have concerns about childhood apraxia, stuttering,
          language delay, hearing, or sudden changes, see a professional.
        </p>
      </LegalSection>

      <LegalSection title="Who may use Pipa" sectionId="who-may-use-pipa">
        <p>
          You must be a parent or legal guardian (or an adult authorized by one)
          to create an account and let a child practice. Kids use Pipa only under
          that grown-up’s supervision. You are responsible for the nest and for
          what is said into the microphone.
        </p>
      </LegalSection>

      <LegalSection title="Accounts and the nest" sectionId="accounts">
        <p>
          Keep your login honest and private. Do not share a child’s nest with
          people who should not see it. You may close the account; we may suspend
          access if these terms are broken or if we need to protect a child or
          the service.
        </p>
      </LegalSection>

      <LegalSection title="Founding seat and payments" sectionId="payments">
        <p>
          The founding seat is a one-time $99 hold processed by Stripe. Taxes or
          fees Stripe shows at checkout may apply. Unless the law requires
          otherwise, founding-seat payments are non-refundable once the seat is
          confirmed. Benefits of early access may evolve as Pipa ships — we will
          not bait-and-switch the core promise of a founding place in the nest.
        </p>
      </LegalSection>

      <LegalSection title="Voice, content, and safety" sectionId="voice-safety">
        <p>
          You grant Pipa permission to process practice audio and transcripts to
          run coaching, scoring, and parent progress views as described in the{' '}
          <a href="/privacy">Privacy Policy</a>. Do not upload or speak content
          that is illegal, abusive, or meant to harm a child. We may safety-screen
          live chats and remove material that breaks this rule.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use" sectionId="acceptable-use">
        <ul>
          <li>No scraping, reverse engineering, or abusing rate limits.</li>
          <li>No impersonating another family or clinician.</li>
          <li>No using Pipa to build a competing model from our outputs.</li>
          <li>No attempting to access another family’s nest.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Our service, as-is" sectionId="service">
        <p>
          We work hard to keep Pipa warm and reliable, but practice scores,
          availability, and features can change. To the fullest extent allowed by
          law, Pipa is provided “as is,” without warranties that practice will
          produce a specific clinical outcome.
        </p>
      </LegalSection>

      <LegalSection title="Limits of liability" sectionId="liability">
        <p>
          To the fullest extent allowed by law, Pipa and its team are not liable
          for indirect, incidental, or consequential damages, or for decisions
          made solely from in-app scores. If we are liable for something we can
          lawfully limit, that amount will not exceed what you paid us in the
          three months before the claim (or $99 if you only held a founding seat).
        </p>
      </LegalSection>

      <LegalSection title="Changes" sectionId="changes">
        <p>
          We may update these terms as Pipa grows. Material changes will be
          dated here. Continued use after an update means you accept the new
          terms. If you do not agree, stop using the nest and contact us to close
          the account.
        </p>
      </LegalSection>

      <LegalSection title="Contact" sectionId="contact">
        <p>
          Questions about these terms:{' '}
          <a href="mailto:hello@pipa.app?subject=Terms">hello@pipa.app</a>.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
