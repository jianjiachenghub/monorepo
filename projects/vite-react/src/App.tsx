import { BrowserRouter as Router, Switch, Route, Link } from 'react-router-dom';
import Editor from './pages/Editor';
import './App.css';

function App() {
  return (
    <Router>
      <Switch>
        <Route path="/" exact>
          <nav>
            <ul>
              <li>
                <Link to="/editor">editor</Link>
              </li>
            </ul>
          </nav>
        </Route>
        <Route path="/editor">
          <Editor />
        </Route>
      </Switch>
    </Router>
  );
}

export default App;
