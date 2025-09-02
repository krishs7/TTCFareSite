import usePWAInstall from '../usePWAInstall.js';
import { Link } from 'react-router-dom';

export default function Install() {
  const { deferredPrompt, promptInstall, installed, isIOS, isSafari } = usePWAInstall();
  const canPrompt = !!deferredPrompt;

  return (
    <div className="container-narrow py-10">
      <div className="card p-6">
        <h1 className="text-2xl font-bold mb-2">Install One-Fare Helper</h1>
        <p className="text-slate-600 mb-6">
          Install this site as an app for quick access and offline support.
        </p>

        {installed ? (
          <div className="rounded-xl border border-green-200 bg-green-50 text-green-800 px-4 py-3 mb-6">
            ✅ Already installed — open it from your home screen / launcher.
          </div>
        ) : canPrompt ? (
          <button
            className="btn btn-primary"
            onClick={async () => {
              const res = await promptInstall();
              console.log('[PWA] install outcome:', res);
            }}
          >
            Install app
          </button>
        ) : (
          <div className="space-y-4">
            <p className="text-slate-700">
              If your browser doesn’t show an install icon, follow the steps below:
            </p>

            {/* iPhone (Safari) instructions */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="font-semibold mb-2">iPhone (Safari or Chrome)</h2>
              <ol className="list-decimal pl-5 space-y-1 text-slate-700">
                <li>Open this site in <strong>Safari or Chrome</strong>.</li>
                <li>Tap the <strong>Share</strong> icon (square with an up arrow).</li>
                <li>Scroll and choose <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong>.</li>
              </ol>
              <p className="mt-2 text-slate-500 text-sm">
                Tip: On iOS, installation works best from Safari.
              </p>
            </div>

            {/* Android (Chrome) instructions */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="font-semibold mb-2">Android (Chrome)</h2>
              <ol className="list-decimal pl-5 space-y-1 text-slate-700">
                <li>Open this site in <strong>Chrome</strong>.</li>
                <li>Tap the <strong>⋮</strong> menu (top-right).</li>
                <li>Choose <strong>Add to Home screen</strong> (or <strong>Install app</strong>).</li>
                <li>Confirm by tapping <strong>Add</strong> (or <strong>Install</strong>).</li>
              </ol>
            </div>

            {/* Desktop fallback */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="font-semibold mb-2">Desktop (Chrome / Edge)</h2>
              <ol className="list-decimal pl-5 space-y-1 text-slate-700">
                <li>Look for the <strong>Install</strong> icon in the address bar (or the browser menu).</li>
                <li>Click <strong>Install</strong>.</li>
              </ol>
            </div>
          </div>
        )}

        <div className="mt-8">
          <Link to="/tool" className="btn btn-ghost">Back to tool</Link>
        </div>
      </div>
    </div>
  );
}

