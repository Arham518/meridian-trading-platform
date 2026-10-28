import { useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowLeft, FileWarning } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { useSettings } from '../store/settings.js';

/*
 * DRAFT legal pages. These texts are a starting point written for a paper-trading / education site. They have NOT been
 * reviewed by a lawyer and must be checked (company name, address, governing law, contact email) before relying on them.
 */
const UPDATED = '28 October 2026';
const DOCS = {
  terms: {
    title: 'Terms of Service',
    sections: [
      ['1. Who we are', 'These terms govern your use of {site} (the "Service"), operated by the owner of this website ("we", "us"). By creating an account you agree to these terms. If you do not agree, do not use the Service.'],
      ['2. What the Service is', 'The Service publishes trade ideas ("signals"), shows market charts and gives you a paper-trading account that uses virtual money only. No order is ever sent to a broker or an exchange, and you cannot deposit or withdraw real money through the Service.'],
      ['3. Not financial advice', 'Signals and all other content are general information for education. They are not personal investment, legal or tax advice and do not take your circumstances into account. You are solely responsible for any decision you make with real money elsewhere.'],
      ['4. Your account', 'You must give a valid email address, keep your password secret and be at least 18 years old (or the age of majority where you live). You are responsible for activity on your account. Tell us straight away if you think your account has been used without permission.'],
      ['5. Acceptable use', 'Do not attempt to break, overload, scrape or reverse-engineer the Service, share your account, resell signals, or use the Service for anything unlawful. We may suspend or close accounts that break these rules.'],
      ['6. Market data', 'Crypto prices come from public third-party sources; other instruments are simulated and labelled SIM. Data may be delayed, incomplete or wrong, and we do not guarantee its accuracy or availability.'],
      ['7. Advertising', 'Some pages show advertising, including from third-party ad networks. Ads are not endorsements, and we are not responsible for third-party sites or products.'],
      ['8. Liability', 'The Service is provided "as is". To the extent permitted by law we are not liable for any loss, including trading losses, lost profits or data loss, arising from your use of the Service.'],
      ['9. Changes and termination', 'We may change the Service or these terms. Material changes will be announced on the site; continuing to use the Service after a change means you accept it. You may delete your account at any time by contacting us.'],
      ['10. Contact', 'Questions about these terms: use the contact email published on this website. [Owner to complete: legal entity name, address and governing law.]'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      ['1. Data we collect', 'Account data (name, email, hashed password, two-factor settings), activity data (sign-ins with IP address and browser, paper trades, orders, watchlists) and technical logs. We do not collect payment details.'],
      ['2. Why we use it', 'To run your account, secure it (for example detecting suspicious sign-ins), send service emails such as confirmation and password reset links, produce the exports you request, and improve the Service.'],
      ['3. Cookies and similar technology', 'We store a sign-in token in your browser. Our hosting/CDN provider (Cloudflare) may collect anonymous performance statistics. If advertising is enabled, Google AdSense may use cookies to show and measure ads; see Google\u2019s policy at policies.google.com/technologies/ads.'],
      ['4. Sharing', 'We do not sell your data. Data is processed by our hosting, database and email providers only to run the Service, and may be disclosed where the law requires it.'],
      ['5. Retention', 'Account data is kept while your account exists. Sign-in activity older than 180 days and expired sessions or links are deleted automatically. When an administrator deletes an account, its trades, orders, watchlist and sessions are deleted and its sign-in history is anonymised.'],
      ['6. Your rights', 'You can view and download your data from your account page, correct it, or ask us to delete your account. Depending on where you live you may have further rights, including complaining to a data-protection authority.'],
      ['7. Security', 'Passwords are hashed, sessions can be revoked, and two-factor authentication is available. No system is perfectly secure, so please use a unique password.'],
      ['8. Contact', 'Privacy questions: use the contact email published on this website. [Owner to complete: data controller name and address.]'],
    ],
  },
  risk: {
    title: 'Risk Disclosure',
    sections: [
      ['High risk', 'Trading foreign exchange, cryptocurrencies, indices, commodities and stocks, especially with leverage, carries a high level of risk and may not be suitable for everyone. You can lose some or all of the money you invest, and with leveraged products you can lose more than your deposit.'],
      ['Signals are educational', 'Signals show one possible plan (entry, stop loss and targets). They are not a recommendation to buy or sell and do not consider your objectives, finances or experience. Never trade money you cannot afford to lose.'],
      ['Past performance', 'The track record shows how published signals closed. Past results, including the demo dataset shipped with the site, do not predict future performance.'],
      ['Paper trading is simulated', 'The paper account fills orders at the quoted price with no slippage, spread widening, fees or liquidity limits. Real results are usually worse than simulated ones.'],
      ['Data', 'Prices other than crypto are simulated and labelled SIM. Even real prices can be delayed or wrong. Always check prices with your own broker before acting.'],
      ['Get independent advice', 'If you are unsure, speak to a licensed financial adviser before trading.'],
    ],
  },
};

export default function Legal({ doc }) {
  const d = DOCS[doc]; const siteName = useSettings((s) => s.siteName);
  useEffect(() => { document.title = `${d.title} | ${siteName}`; window.scrollTo(0, 0); }, [d.title, siteName]);
  return (
    <div className="min-h-dvh">
      <header className="px-3 sm:px-5 pt-3 sticky top-0 z-40">
        <div className="frost max-w-[72rem] mx-auto h-14 px-4 sm:px-5 flex items-center justify-between !rounded-2xl">
          <Link to="/" aria-label={`${siteName} home`}><Logo name={siteName} /></Link>
          <Link to="/" className="btn btn-ghost btn-sm"><ArrowLeft size={14} />Home</Link>
        </div>
      </header>
      <main id="main" className="max-w-[72rem] mx-auto px-5 sm:px-8 py-10 sm:py-14 grid lg:grid-cols-[220px_minmax(0,1fr)] gap-8">
        <nav className="glass p-2 self-start lg:sticky lg:top-24 flex lg:flex-col gap-1 overflow-x-auto" aria-label="Legal documents">
          {Object.entries(DOCS).map(([k, v]) => <NavLink key={k} to={`/${k}`} className={({ isActive }) => `px-3 py-2 rounded-lg text-[1rem] whitespace-nowrap ${isActive ? 'bg-accent text-white font-semibold' : 'text-mute hover:text-ink hover:bg-ink/[0.04]'}`}>{v.title}</NavLink>)}
        </nav>
        <article className="glass p-6 sm:p-10 min-w-0" data-testid="legal-page">
          <div role="note" className="flex gap-3 rounded-xl border border-warn/30 bg-[#fff6e5] px-4 py-3 text-[0.9375rem] text-[#6b4100]">
            <FileWarning size={18} className="shrink-0 mt-0.5" /><p><b>Draft.</b> This document is a draft and has not yet been reviewed by a lawyer. It may change before it is finalised.</p>
          </div>
          <p className="eyebrow mt-8">Legal · Draft</p>
          <h1 className="display text-[1.67rem] sm:text-[2.13rem] mt-3">{d.title}</h1>
          <p className="text-[0.9375rem] text-dim mt-2">Last updated {UPDATED}</p>
          <div className="mt-8 space-y-7">
            {d.sections.map(([h, t]) => <section key={h}><h2 className="text-[1.1rem] font-semibold tracking-[-0.01em]">{h}</h2><p className="mt-2 text-mute leading-relaxed">{t.replaceAll('{site}', siteName)}</p></section>)}
          </div>
        </article>
      </main>
    </div>
  );
}
