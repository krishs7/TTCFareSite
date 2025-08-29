import { Link, NavLink } from 'react-router-dom';

export default function NavBar() {
  return (
    <header className="sticky top-0 z-40 bg-white/70 backdrop-blur border-b border-slate-200/70">
      <div className="container-narrow h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">OF</span>
          <span>One-Fare Helper</span>
        </Link>
        <nav className="flex items-center gap-2">
          <NavLink to="/" className={({isActive}) => `btn btn-ghost ${isActive?'bg-brand-50':''}`}>Home</NavLink>
          <NavLink to="/tool" className={({isActive}) => `btn ${isActive?'btn-primary':'btn-ghost'}`}>Open the Tool</NavLink>
          <NavLink to="/install" className={({isActive}) => `btn ${isActive?'btn-primary':'btn-ghost'}`}>Install app</NavLink>
        </nav>
      </div>
    </header>
  );
}

