import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-50 to-white"></div>
        <div className="container-narrow relative py-14 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
                Know exactly <span className="text-brand-600">when to tap</span> for <br className="hidden sm:block" />
                TTC ⇄ GO/905 <span className="text-brand-600">One-Fare</span>
              </h1>
              <p className="mt-3 text-lg text-slate-600">
                Since 2024, many transfers don’t double-charge — but the rules are confusing.
                This PWA shows your tap-by deadline and eligibility in real time.
              </p>
              <div className="mt-6 flex gap-3">
                <Link to="/tool" className="btn btn-primary">Open the Tool</Link>
                <a href="#how-it-works" className="btn btn-ghost">How it works</a>
              </div>
              <p className="mt-3 text-slate-500 text-sm">Works offline after first load. No PRESTO login required.</p>
            </div>
            <div className="relative">
              <img
                src="/hero-toronto.svg"
                alt="Toronto skyline with CN Tower"
                className="w-full max-w-xl mx-auto drop-shadow-[0_30px_50px_rgba(31,84,214,0.25)]"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="container-narrow py-12">
        <h2 className="text-2xl font-semibold mb-6">How it works</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          <div className="card p-5">
            <h3 className="font-semibold mb-2">Pick direction</h3>
            <p className="text-slate-600">TTC → GO, GO → TTC, or TTC ⇄ 905. Choose how your trip starts and how you pay.</p>
          </div>
          <div className="card p-5">
            <h3 className="font-semibold mb-2">Tap once</h3>
            <p className="text-slate-600">Press “I just tapped.” The app starts a 2-hour (local) or 3-hour (GO) timer for your transfer.</p>
          </div>
          <div className="card p-5">
            <h3 className="font-semibold mb-2">Get reminders</h3>
            <p className="text-slate-600">We’ll nudge you at T-5 and T-1 minutes (while the page is open). Stay within your window.</p>
          </div>
        </div>
        <div className="mt-8">
          <Link to="/tool" className="btn btn-primary">Try it now</Link>
        </div>
      </section>

      <section className="bg-white">
        <div className="container-narrow py-12">
          <h2 className="text-2xl font-semibold mb-4">Why it matters</h2>
          <ul className="list-disc pl-5 text-slate-700 space-y-2">
            <li>Shows the exact <strong>tap-by deadline</strong> for discounted/free transfers.</li>
            <li>Makes the <strong>2-hour local / 3-hour GO</strong> window crystal clear.</li>
            <li>No scraping, no accounts — runs on <strong>open policy rules</strong>.</li>
            <li><strong>Offline-friendly</strong> PWA: stays running even if signal drops.</li>
          </ul>
          <p className="mt-4 text-slate-500 text-sm">Policy: One-Fare requires the same card/phone/watch; tickets/e-tickets are not eligible.</p>
        </div>
      </section>
    </>
  );
}

