import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err){ return { hasError: true, message: String(err) }; }
  componentDidCatch(err, info){ console.error('ErrorBoundary caught:', err, info); }
  render(){
    if (this.state.hasError){
      return (
        <main style={{padding:16,fontFamily:'system-ui'}}>
          <h1>Something went wrong</h1>
          <p style={{color:'#b00'}}>{this.state.message}</p>
          <button onClick={()=>window.location.reload()}>Reload</button>
        </main>
      );
    }
    return this.props.children;
  }
}

