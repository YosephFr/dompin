import { createRoot } from 'react-dom/client';

const App = () => <div>DOMPin Options</div>;

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
