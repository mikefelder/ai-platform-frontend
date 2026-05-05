import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import ChatPage from './pages/ChatPage';
import FlowPage from './pages/FlowPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="nav-bar">
          <div className="nav-brand">
            <span className="brand-sub">Unified AI Platform</span>
          </div>
          <div className="nav-links">
            <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Chat
            </NavLink>
            <NavLink to="/flow" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Agent Flow
            </NavLink>
          </div>
        </nav>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="/flow" element={<FlowPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
