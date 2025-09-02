export default function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200/70 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950">
      <div className="container-narrow py-8 text-sm text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row gap-2 sm:gap-4 justify-between">
        <p>© {new Date().getFullYear()} One-Fare Helper • Made for Toronto riders</p>
        <p>Not affiliated with TTC/Metrolinx.</p>
      </div>
    </footer>
  );
}

